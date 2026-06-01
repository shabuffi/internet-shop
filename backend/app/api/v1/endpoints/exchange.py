"""
CommerceML exchange endpoint для приёма данных от МойСклад.

МойСклад обращается к этому URL в определённом порядке:
  GET  /api/v1/1c/exchange?mode=checkauth   → "success\nsession\ntoken"
  GET  /api/v1/1c/exchange?mode=init        → "zip=no\nfile_limit=..."
  POST /api/v1/1c/exchange?mode=file&type=catalog&filename=import.xml  → тело = XML
  GET  /api/v1/1c/exchange?mode=import&filename=import.xml  → запускает импорт
"""

import logging
from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.integrations.moysklad.commerceml_parser import parse_import_xml, parse_offers_xml, ParsedCatalog
from app.services.import_service import upsert_catalog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/1c/exchange", tags=["1C Exchange"])

# Временное хранилище XML файлов в памяти (на время сессии обмена)
# В продакшне заменить на Redis или S3
_file_storage: dict[str, bytes] = {}
_pending_catalog: ParsedCatalog | None = None


@router.get("", response_class=PlainTextResponse)
@router.get("/", response_class=PlainTextResponse)
async def exchange_get(
    mode: str = Query(...),
    type: str = Query(default=""),
    filename: str = Query(default=""),
    db: Session = Depends(get_db),
):
    global _pending_catalog

    # ── Шаг 1: checkauth ──────────────────────────────────────────────────────
    # Стандарт 1С требует ровно три строки: "success", имя куки, значение куки
    if mode == "checkauth":
        return "success\nsession\ncommerceml-session"

    # ── Шаг 2: init ───────────────────────────────────────────────────────────
    # МойСклад спрашивает параметры: поддерживаем ли zip, максимальный размер файла
    if mode == "init":
        return "zip=no\nfile_limit=10485760"  # 10 MB

    # ── Шаг 4: import — запускаем upsert в БД ────────────────────────────────
    if mode == "import":
        if filename == "import.xml":
            if _pending_catalog is None or not _pending_catalog.products:
                return "failure\nНет данных для импорта"
            log = upsert_catalog(db, _pending_catalog, source="commerceml")
            _pending_catalog = None
            _file_storage.clear()
            print(f"Imported: {log.products_created} created, {log.products_updated} updated", flush=True)
            return f"success\nИмпортировано: {log.products_created} новых, {log.products_updated} обновлено"

        # offers.xml — цены уже применены в POST-шаге, просто подтверждаем
        return "success"

    return "failure\nНеизвестный mode"


@router.post("", response_class=PlainTextResponse)
@router.post("/", response_class=PlainTextResponse)
async def exchange_post(
    request: Request,
    mode: str = Query(...),
    type: str = Query(default=""),
    filename: str = Query(default=""),
):
    global _pending_catalog

    # ── Шаг 3: file — МойСклад отправляет XML файл ───────────────────────────
    if mode == "file":
        body = await request.body()
        _file_storage[filename] = body
        logger.info("Received file: %s (%d bytes)", filename, len(body))

        if filename == "import.xml":
            try:
                _pending_catalog = parse_import_xml(body)
                print(f"Parsed: {len(_pending_catalog.categories)} categories, {len(_pending_catalog.products)} products", flush=True)
            except Exception as exc:
                print(f"PARSE ERROR import.xml: {exc}", flush=True)
                _pending_catalog = None

        elif filename == "offers.xml" and _pending_catalog is not None:
            # Применяем цены и остатки сразу — до того как import запустит upsert
            try:
                parse_offers_xml(body, _pending_catalog)
                prices = [p.price for p in _pending_catalog.products if p.price > 0]
                print(f"Offers applied: {len(prices)} products with price", flush=True)
            except Exception as exc:
                print(f"PARSE ERROR offers.xml: {exc}", flush=True)

        return "success"

    return "failure\nНеизвестный mode"
