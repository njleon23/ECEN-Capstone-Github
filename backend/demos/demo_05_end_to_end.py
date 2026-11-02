"""End-to-end demo against a RUNNING backend (steps 6-8). From backend/:

    terminal 1:  python -m uvicorn app.main:app --reload
    terminal 2:  python3 -m demos.demo_05_end_to_end [--base http://127.0.0.1:8000]

Uploads the sample agenda with Nick's endpoint, adds the FICTIONAL supporting sources, shows
that unapproved sources are ignored, approves them, analyzes every item, prints the heat list,
one briefing, and follow-up questions. Everything goes through HTTP, exactly as the frontend
will. It writes to the database the server is using (DATABASE_URL), so run it against your
development database, never a shared or production one.
"""
import argparse
import sys
import time

import httpx

from app.analysis.demo_sources import demo_sources

from ._common import SAMPLE_AGENDA, heading


def wait(client, status_url, tries=60):
    for _ in range(tries):
        job = client.get(status_url).json()
        if job["state"] in ("completed", "degraded", "failed"):
            return job
        time.sleep(0.25)
    raise SystemExit("job did not finish")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    args = ap.parse_args()
    c = httpx.Client(base_url=args.base, timeout=30)

    try:
        c.get("/api/v1/health").raise_for_status()
    except httpx.HTTPError:
        print(f"Cannot reach {args.base}. Start it with: python -m uvicorn app.main:app")
        return 1

    heading("1. Upload the sample agenda (Nick's endpoint)")
    with SAMPLE_AGENDA.open("rb") as f:
        agenda = c.post("/api/v1/agendas", files={"file": (SAMPLE_AGENDA.name, f, "text/plain")},
                        data={"meeting_title": "Regular Meeting", "meeting_date": "2026-10-08"}).json()
    print(f"  agenda {agenda['agenda_id'][:8]}...  parsed {len(agenda['items'])} items")
    ids = {i["item_number"]: i["item_id"] for i in agenda["items"]}

    heading("2. Add supporting sources with the backend's POST /api/v1/sources (they start UNAPPROVED)")
    src = {}
    for s in demo_sources():
        r = c.post("/api/v1/sources", json={"title": s.title, "source_type": s.source_type,
                                            "text": s.text, "source_date": s.source_date}).json()
        src[s.source_id] = r["source_id"]
    print(f"  added {len(src)} sources, approved: {sum(1 for s in c.get('/api/v1/sources').json() if s['approved'])}")

    heading("3. Analyze item 4.4 with NO approved sources -> insufficient evidence")
    r = c.post(f"/api/v1/items/{ids['4.4']}/analyses")
    job = wait(c, r.json()["status_url"])
    print(f"  202 Accepted -> job state: {job['state']}  score: {job['priority']['score']}  "
          f"error: {job['error']['code'] if job['error'] else None}")

    heading("4. A human approves the sources")
    for s in demo_sources():
        if s.approved:
            c.patch(f"/api/v1/sources/{src[s.source_id]}/approval", json={"approved": True})
    print(f"  approved: {sum(1 for s in c.get('/api/v1/sources').json() if s['approved'])} "
          f"(the draft minutes stay unapproved)")

    heading("5. Analyze the whole agenda; read the heat list")
    c.post(f"/api/v1/agendas/{agenda['agenda_id']}/analyses")
    time.sleep(1.0)
    for _ in range(40):
        rows = c.get(f"/api/v1/agendas/{agenda['agenda_id']}/priorities").json()["items"]
        if all(r["state"] in ("completed", "degraded", "failed", "not_analyzed") for r in rows) and \
                not any(r["state"] in ("queued", "running") for r in rows):
            break
        time.sleep(0.25)
    for r in rows:
        p = r["priority"]
        shown = ("procedural, not scored" if r["procedural"]
                 else "suppressed" if not p or p["score"] is None
                 else f"{p['score']:>4}/10  {p['category']}")
        print(f"  {r['item_number']:<4} {r['title'][:58]:<58} {shown}")

    heading("6. Briefing for item 4.4 (always a draft)")
    b = c.get(f"/api/v1/items/{ids['4.4']}/briefing").json()
    print(f"  status: {b['status']}   model: {b['model_id']}")
    for fact in b["key_facts"]:
        print(f"  fact [{fact['support']}]: {fact['text'][:120]}")
    for w in b["warnings"]:
        print(f"  WARNING: {w}")

    heading("7. Follow-up questions")
    for num, q in (("4.1", "Have we had rezoning requests near University Drive before, and how did residents react?"),
                   ("4.1", "How should I vote on the rezoning?"),
                   ("4.1", "What is the runway length at the airport?")):
        r = c.post(f"/api/v1/items/{ids[num]}/questions", json={"question": q})
        body = r.json()
        status = body.get("status") or body["error"]["code"]
        print(f"  [{r.status_code}] {q}\n        -> {status}: "
              f"{(body.get('answer') or body.get('message') or body['error']['message'])[:110]}")
    print("\n(Offline stand-in unless the server has LLM_API_KEY set. Fictional data.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
