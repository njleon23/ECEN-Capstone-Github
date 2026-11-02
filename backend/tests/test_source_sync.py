"""The analysis reads the backend's ``sources`` table and follows its approval flags."""

from api_helpers import add_demo_sources, api, set_approval  # noqa: F401  (api is a fixture)

from app.analysis import source_store
from app.analysis.service import get_service, get_synced_service
from app.services.source_repository import get_source as backend_get_source


def _add(api, title="Drainage budget note", approved=False, **extra):
    body = {"title": title, "source_type": "budget",
            "text": "Eastside drainage project estimate is $12.8 million.", **extra}
    r = api.post("/api/v1/sources", json=body)
    assert r.status_code == 201
    sid = r.json()["source_id"]
    if approved:
        set_approval(api, sid, True)
    return sid


def test_source_store_converts_backend_rows(api):
    sid = _add(api, source_date="2026-09-01", source_url="https://example.invalid/b")
    rec = source_store.get_source(sid)
    assert rec.title == "Drainage budget note"
    assert rec.source_type == "budget"
    assert rec.source_date == "2026-09-01"
    assert rec.source_url == "https://example.invalid/b"
    assert rec.approved is False
    assert source_store.get_source("does-not-exist") is None


def test_new_source_reaches_the_retriever_unapproved(api):
    sid = _add(api)
    service = get_synced_service()
    known = service.retriever.get_source(sid)
    assert known is not None and known.approved is False
    assert service.passage_count(sid) >= 1


def test_approval_changes_follow_the_table(api):
    sid = _add(api)
    service = get_synced_service()
    set_approval(api, sid, True)                       # done through the backend's own endpoint
    assert service.retriever.get_source(sid).approved is False    # not synced yet
    get_synced_service()
    assert service.retriever.get_source(sid).approved is True
    set_approval(api, sid, False)
    get_synced_service()
    assert service.retriever.get_source(sid).approved is False
    seen = [e for e in service.audit.events if e["event_type"] == "source_approval_seen"]
    assert [e["approved"] for e in seen] == [True, False]


def test_analysis_never_changes_the_table(api):
    ids = add_demo_sources(api)
    before = {sid: backend_get_source(sid).approved for sid in ids.values()}
    get_synced_service()
    get_synced_service()
    after = {sid: backend_get_source(sid).approved for sid in ids.values()}
    assert before == after
    assert any(before.values()) and not all(before.values())     # one demo source is a draft


def test_unapproved_sources_are_not_retrievable(api):
    ids = add_demo_sources(api, approve=False)
    service = get_synced_service()
    assert len(service.retriever.sources()) == len(ids)
    hits = service.retriever.search("drainage project estimate construction contract")
    assert hits == []


def test_source_deleted_from_the_table_leaves_the_retriever(api):
    from sqlalchemy import delete
    from app.database import SessionLocal
    from app.db_models import SourceRecord
    sid = _add(api, approved=True)
    service = get_synced_service()
    assert service.retriever.get_source(sid) is not None
    with SessionLocal.begin() as db:
        db.execute(delete(SourceRecord).where(SourceRecord.source_id == sid))
    get_synced_service()
    assert service.retriever.get_source(sid) is None
    assert get_service() is service
