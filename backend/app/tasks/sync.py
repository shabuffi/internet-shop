from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.sync.sync_catalog")
def sync_catalog():
    """Запускает синхронизацию каталога из МойСклад. Реализация — в Sprint 1."""
    print("TODO: sync catalog from МойСклад")
    return {"status": "ok", "message": "stub — not implemented yet"}
