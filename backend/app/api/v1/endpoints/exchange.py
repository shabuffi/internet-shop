"""
CommerceML exchange endpoint для приёма данных от МойСклад.

МойСклад обращается к этому URL в определённом порядке:
  GET  /api/v1/1c/exchange?mode=checkauth   → "success\nsession=token"
  GET  /api/v1/1c/exchange?mode=init        → "zip=no\nfile_limit=..."
  POST /api/v1/1c/exchange?mode=file&type=catalog&filename=import.xml  → тело = XML
  GET  /api/v1/1c/exchange?mode=import&filename=import.xml  → запускает импорт
"""

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.integrations.moysklad.commerceml_parser import parse_import_xml, parse_offers_xml, ParsedCatalog
from app.services.import_service import upsert_catalog

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
    # МойСклад проверяет что наш сервер отвечает.
    # Отвечаем "success" + имя куки (МойСклад будет использовать её дальше)
    if mode == "checkauth":
        return "success\nsession=commerceml-session"

    # ── Шаг 2: init ───────────────────────────────────────────────────────────
    # МойСклад спрашивает параметры: поддерживаем ли zip, максимальный размер файла
    if mode == "init":
        return "zip=no\nfile_limit=10485760"  # 10 MB

    # ── Шаг 4: import — запускаем импорт ──────────────────────────────────────
    if mode == "import":
        if _pending_catalog is None:
            return "failure\nНет данных для импорта"

        # Если пришёл offers.xml — обогащаем каталог ценами
        if filename == "offers.xml" and "offers.xml" in _file_storage:
            parse_offers_xml(_file_storage["offers.xml"], _pending_catalog)

        if filename == "import.xml" and _pending_catalog.products:
            log = upsert_catalog(db, _pending_catalog, source="commerceml")
            _pending_catalog = None
            _file_storage.clear()
            return f"success\nИмпортировано: {log.products_created} новых, {log.products_updated} обновлено"

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

        # Парсим import.xml сразу как получили
        if filename == "import.xml":
            _pending_catalog = parse_import_xml(body)

        return "success"

    return "failure\nНеизвестный mode"
