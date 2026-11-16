"""Collects validation evidence from a RUNNING backend.

From backend/, with the backend running:

    python3 -m validation.collect_evidence                    # run and write a report
    python3 -m validation.collect_evidence --check-persisted  # after restarting the backend

The first command uploads the sample agenda into a fresh agenda in the
database the server uses (use a development database, never a shared one),
attaches sources, runs the workflow end to end, and writes a dated report to
validation/evidence/ as Markdown and JSON. The report records the model name,
the response time of every call, and the results for each FSR requirement it
touches, so the validation table can quote it.

It deliberately includes the unhappy paths: an item with no attached sources
(insufficient evidence), a vote request (refused), a question the sources
cannot answer, and a reviewer adjustment that needs a reason.

The second command checks that the analysis, briefing, adjustment and review
from the last run are still there after the backend was restarted.
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from app.analysis.demo_sources import demo_sources

HERE = Path(__file__).resolve().parent
EVIDENCE_DIR = HERE / "evidence"
SAMPLE_AGENDA = HERE.parents[1] / "council-brief" / "examples" / "Sample_City_Council_Agenda_2026-10-08.txt"
SCORED_WITH_SOURCES = ["3.2", "4.1", "4.2", "4.3", "4.4", "4.5"]
NO_SOURCES_ITEM = "4.6"          # left unattached on purpose
FOLLOW_UP_ITEM = "4.1"
REPEAT_ITEM = "4.4"
REPEAT_RUNS = 10
FOLLOW_UP = "Have we had rezoning requests near University Drive before, and how did residents react?"
VOTE_REQUEST = "How should I vote on the rezoning?"
UNSUPPORTED = "What is the runway length at the airport?"


class Run:
    def __init__(self, base: str):
        self.client = httpx.Client(base_url=base, timeout=60)
        self.calls: List[Dict[str, Any]] = []

    def call(self, label: str, method: str, url: str, **kw) -> httpx.Response:
        start = time.perf_counter()
        response = self.client.request(method, url, **kw)
        self.calls.append({"label": label, "status": response.status_code,
                           "seconds": round(time.perf_counter() - start, 3)})
        return response

    def analyze(self, item_id: str, label: str) -> Dict[str, Any]:
        """Start an analysis and wait for it. Returns the final job plus total seconds."""
        start = time.perf_counter()
        r = self.client.post(f"/api/v1/items/{item_id}/analyses")
        r.raise_for_status()
        status_url = r.json()["status_url"]
        job: Dict[str, Any] = {}
        for _ in range(600):
            job = self.client.get(status_url).json()
            if job["state"] in ("completed", "degraded", "failed"):
                break
            time.sleep(0.1)
        seconds = round(time.perf_counter() - start, 3)
        self.calls.append({"label": label, "status": 200, "seconds": seconds})
        job["_seconds"] = seconds
        return job


def claim_stats(briefing: Optional[Dict[str, Any]]) -> Dict[str, int]:
    claims = (briefing or {}).get("key_facts", [])
    cited = sum(1 for c in claims if c.get("citation_ids") or c.get("support") == "uncertain")
    supported = sum(1 for c in claims if c.get("support") == "supported")
    return {"key_facts": len(claims), "cited_or_labeled": cited, "supported": supported}


def git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=HERE,
                                       stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return "unknown"


def collect(base: str, username: str | None = None) -> Dict[str, Any]:
    run = Run(base)
    try:
        run.client.get("/api/v1/health").raise_for_status()
    except httpx.HTTPError:
        raise SystemExit(f"Cannot reach {base}. Start the backend first: python3 -m uvicorn app.main:app")

    from app.demo_auth import authenticate_demo_client
    authenticate_demo_client(run.client, username)

    now = datetime.now(timezone.utc)
    result: Dict[str, Any] = {"collected_at": now.strftime("%Y-%m-%d %H:%M UTC"), "base_url": base,
                              "git_commit": git_commit(), "data": "fictional sample agenda and sources"}

    with SAMPLE_AGENDA.open("rb") as f:
        agenda = run.call("upload agenda", "POST", "/api/v1/agendas",
                          files={"file": (SAMPLE_AGENDA.name, f, "text/plain")},
                          data={"meeting_title": f"Evidence run {now:%Y-%m-%d %H:%M}",
                                "meeting_date": "2026-10-08"}).json()
    ids = {i["item_number"]: i["item_id"] for i in agenda["items"]}
    result["agenda_id"] = agenda["agenda_id"]
    result["items_parsed"] = len(agenda["items"])

    source_ids: Dict[str, str] = {}
    for s in demo_sources():
        r = run.call("add source", "POST", "/api/v1/sources", json={
            "title": s.title, "source_type": s.source_type, "text": s.text, "source_date": s.source_date})
        source_ids[s.source_id] = r.json()["source_id"]
        if s.approved:
            run.call("approve source", "PATCH", f"/api/v1/sources/{source_ids[s.source_id]}/approval",
                     json={"approved": True})
    result["sources"] = {"added": len(source_ids), "approved": sum(1 for s in demo_sources() if s.approved)}
    for number in SCORED_WITH_SOURCES:
        for sid in source_ids.values():
            run.call("attach source", "POST", f"/api/v1/agenda-items/{ids[number]}/sources/{sid}")

    # 1. Analyses with approved, attached sources
    analyses = []
    for number in SCORED_WITH_SOURCES:
        job = run.analyze(ids[number], f"analyze {number}")
        p, b = job.get("priority") or {}, job.get("briefing")
        analyses.append({
            "item": number, "state": job["state"], "score": p.get("score"), "category": p.get("category"),
            "evidence_level": p.get("evidence_level"), "configuration_version": p.get("configuration_version"),
            "factors": [{"key": f["key"], "points": f["contribution"]} for f in p.get("factors", [])],
            "model_id": (b or {}).get("model_id"), "prompt_version": (b or {}).get("prompt_version"),
            "source_ids": len((b or {}).get("source_ids", [])), "seconds": job["_seconds"],
            "job_id": job["job_id"], "briefing_id": (b or {}).get("briefing_id"), **claim_stats(b)})
    result["analyses"] = analyses

    # 2. Missing evidence: no sources attached to this item
    job = run.analyze(ids[NO_SOURCES_ITEM], f"analyze {NO_SOURCES_ITEM} (no sources attached)")
    result["missing_evidence"] = {
        "item": NO_SOURCES_ITEM, "state": job["state"], "score": (job.get("priority") or {}).get("score"),
        "error_code": (job.get("error") or {}).get("code"), "message": job.get("progress_message"),
        "briefing_incomplete": (job.get("briefing") or {}).get("incomplete"), "seconds": job["_seconds"]}

    # 3. Follow-up questions
    questions = []
    for label, text in (("supported question", FOLLOW_UP), ("vote request", VOTE_REQUEST),
                        ("question the sources cannot answer", UNSUPPORTED)):
        r = run.call(f"follow-up: {label}", "POST", f"/api/v1/items/{ids[FOLLOW_UP_ITEM]}/questions",
                     json={"question": text})
        body = r.json()
        questions.append({"label": label, "question": text, "http_status": r.status_code,
                          "status": body.get("status") or body.get("error", {}).get("code"),
                          "citations": len(body.get("citations", [])),
                          "seconds": run.calls[-1]["seconds"]})
    result["follow_ups"] = questions

    # 4. Repeatability through the API
    fingerprints, timings = set(), []
    for _ in range(REPEAT_RUNS):
        job = run.analyze(ids[REPEAT_ITEM], f"repeat {REPEAT_ITEM}")
        p = job["priority"]
        fingerprints.add(json.dumps({"score": p["score"], "category": p["category"],
                                     "factors": [(f["key"], f["raw_value"], f["contribution"]) for f in p["factors"]]},
                                    sort_keys=True))
        timings.append(job["_seconds"])
    result["repeatability"] = {"item": REPEAT_ITEM, "runs": REPEAT_RUNS, "identical": len(fingerprints) == 1,
                               "median_seconds": round(statistics.median(timings), 3)}

    # 5. Reviewer adjustment: reason is required, then it is saved
    item_id = ids[REPEAT_ITEM]
    before = run.client.get(f"/api/v1/items/{item_id}/analysis").json()["priority"]
    no_reason = run.call("adjust without reason", "POST", f"/api/v1/items/{item_id}/priority/adjustments",
                         json={"factor_key": "public_discussion", "new_raw_value": 1.0, "reason": "  ",
                               "reviewer": "evidence-script"})
    saved = run.call("adjust with reason", "POST", f"/api/v1/items/{item_id}/priority/adjustments",
                     json={"factor_key": "public_discussion", "new_raw_value": 1.0,
                           "reason": "Evidence run: residents organized a petition not in the approved sources.",
                           "reviewer": "evidence-script"})
    after = run.client.get(f"/api/v1/items/{item_id}/analysis").json()["priority"]
    result["adjustment"] = {
        "item": REPEAT_ITEM, "without_reason_http_status": no_reason.status_code,
        "saved_http_status": saved.status_code, "score_before": before["score"], "score_after": after["score"],
        "category_after": after["category"], "recorded_reviewer": (after.get("manual_adjustment") or {}).get("reviewer_id"),
        "history_rows": len(run.client.get(f"/api/v1/items/{item_id}/priority/adjustments").json())}

    # 6. Briefing review
    briefing_id = run.client.get(f"/api/v1/items/{item_id}/briefing").json()["briefing_id"]
    review = run.call("save briefing review", "PATCH", f"/api/v1/briefings/{briefing_id}/review",
                      json={"status": "approved", "reviewer": "evidence-script",
                            "comments": "Evidence run: approved after checking citations."})
    history = run.client.get(f"/api/v1/briefings/{briefing_id}/reviews").json()
    result["review"] = {"item": REPEAT_ITEM, "briefing_id": briefing_id, "http_status": review.status_code,
                        "history_rows": len(history), "status": history[-1]["status"] if history else None}

    all_seconds = [c["seconds"] for c in run.calls]
    result["timing"] = {"calls": len(run.calls), "median_seconds": round(statistics.median(all_seconds), 3),
                        "slowest_seconds": max(all_seconds),
                        "analysis_median_seconds": round(statistics.median([a["seconds"] for a in analyses]), 3)}
    result["saved_ids"] = {"agenda_id": agenda["agenda_id"], "item_id": item_id, "briefing_id": briefing_id,
                           "score_after_adjustment": after["score"], "review_status": "approved"}
    return result


def to_markdown(r: Dict[str, Any]) -> str:
    a = r["analyses"]
    models = sorted({x["model_id"] for x in a if x["model_id"]})
    live = any(m and not m.startswith("offline") for m in models)
    L = [f"# Validation evidence: {r['collected_at']}", "",
         f"- Backend: {r['base_url']}  (git commit {r['git_commit']})",
         f"- Data: {r['data']}",
         f"- Model: {', '.join(models) or 'none'}"
         + ("" if live else "  (the rule-based stand-in, not a live LLM; times are not representative of a live model)"),
         f"- Agenda parsed into {r['items_parsed']} items; {r['sources']['added']} sources added, "
         f"{r['sources']['approved']} approved", "",
         "## Analysis of items with approved, attached sources", "",
         "| Item | State | Score | Category | Seconds | Key facts | Cited or labeled | Supported | Sources used |",
         "|---|---|---|---|---|---|---|---|---|"]
    for x in a:
        L.append(f"| {x['item']} | {x['state']} | {x['score']} | {x['category']} | {x['seconds']} | "
                 f"{x['key_facts']} | {x['cited_or_labeled']} | {x['supported']} | {x['source_ids']} |")
    kf, cl, su = (sum(x[k] for x in a) for k in ("key_facts", "cited_or_labeled", "supported"))
    L += ["", f"Citation coverage (PER-005): {cl} of {kf} key facts cited or labeled; {su} of {kf} supported by the cited text.",
          f"Scored items: {sum(1 for x in a if x['score'] is not None)} of {len(a)}, "
          f"range {min(x['score'] for x in a if x['score'] is not None)} to {max(x['score'] for x in a if x['score'] is not None)}.",
          f"Configuration version: {a[0]['configuration_version']}. Prompt version: {a[0]['prompt_version']}.", "",
          "## Missing evidence (REL-003, SRC-007)", ""]
    m = r["missing_evidence"]
    L += [f"Item {m['item']} had no sources attached. State: {m['state']}; score: {m['score']}; "
          f"error: {m['error_code']}; briefing marked incomplete: {m['briefing_incomplete']}.",
          f"Message shown to staff: \"{m['message']}\"", "", "## Follow-up questions (ANA-008, ANA-009)", "",
          "| Question type | HTTP | Result | Citations | Seconds |", "|---|---|---|---|---|"]
    for q in r["follow_ups"]:
        L.append(f"| {q['label']} | {q['http_status']} | {q['status']} | {q['citations']} | {q['seconds']} |")
    p = r["repeatability"]
    d = r["adjustment"]
    v = r["review"]
    t = r["timing"]
    L += ["", "## Repeatability through the API (PER-006)", "",
          f"Item {p['item']} analyzed {p['runs']} times: results identical = {p['identical']} "
          f"(median {p['median_seconds']} s per analysis).", "", "## Reviewer adjustment (ANA-007)", "",
          f"Adjusting {d['item']} without a reason returned HTTP {d['without_reason_http_status']}. "
          f"With a reason it returned HTTP {d['saved_http_status']}: score {d['score_before']} to "
          f"{d['score_after']} ({d['category_after']}); recorded reviewer {d['recorded_reviewer']}; "
          f"history rows {d['history_rows']}.", "", "## Briefing review", "",
          f"Review saved with HTTP {v['http_status']}; history rows {v['history_rows']}; status {v['status']}.", "",
          "## Timing", "",
          f"{t['calls']} calls. Median {t['median_seconds']} s, slowest {t['slowest_seconds']} s. "
          f"Median full analysis {t['analysis_median_seconds']} s.", "",
          "## Check after a restart", "",
          "Restart the backend, then run `python3 -m validation.collect_evidence --check-persisted` "
          "to confirm the analysis, adjusted score, briefing and review are still there.", ""]
    return "\n".join(L)


def check_persisted(base: str) -> int:
    path = EVIDENCE_DIR / "latest.json"
    if not path.exists():
        print("No saved run found. Run python3 -m validation.collect_evidence first.")
        return 1
    saved = json.loads(path.read_text())["saved_ids"]
    client = httpx.Client(base_url=base, timeout=30)
    item = saved["item_id"]
    checks = []
    job = client.get(f"/api/v1/items/{item}/analysis")
    checks.append(("analysis still saved", job.status_code == 200))
    if job.status_code == 200:
        priority = job.json()["priority"]
        checks.append(("adjusted score still saved", priority["score"] == saved["score_after_adjustment"]))
        checks.append(("adjustment reason still saved",
                       bool((priority.get("manual_adjustment") or {}).get("reason"))))
    b = client.get(f"/api/v1/items/{item}/briefing")
    checks.append(("briefing still saved", b.status_code == 200 and b.json()["briefing_id"] == saved["briefing_id"]))
    reviews = client.get(f"/api/v1/briefings/{saved['briefing_id']}/reviews")
    checks.append(("review still saved", reviews.status_code == 200 and
                   any(x["status"] == saved["review_status"] for x in reviews.json())))
    adj = client.get(f"/api/v1/items/{item}/priority/adjustments")
    checks.append(("adjustment history still saved", adj.status_code == 200 and len(adj.json()) >= 1))
    for name, ok in checks:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    ok_all = all(ok for _, ok in checks)
    print("\nAll results survived the restart." if ok_all else "\nSome results are missing after the restart.")
    return 0 if ok_all else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--check-persisted", action="store_true")
    ap.add_argument("--username", help="Reviewer username; password is prompted privately")
    args = ap.parse_args()
    if args.check_persisted:
        return check_persisted(args.base)

    result = collect(args.base, args.username)
    EVIDENCE_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    md = to_markdown(result)
    (EVIDENCE_DIR / f"evidence-{stamp}.md").write_text(md, encoding="utf-8")
    (EVIDENCE_DIR / f"evidence-{stamp}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (EVIDENCE_DIR / "latest.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(md)
    print(f"Saved to validation/evidence/evidence-{stamp}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
