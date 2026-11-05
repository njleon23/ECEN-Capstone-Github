# AI and Analytics: demos and API contract

All data is fictional. Run commands from `backend/` with the virtual environment active. The tests and the
HTTP demo need PostgreSQL (`docker compose up -d db test-db`, then `alembic upgrade head` for the
development database).
Until `LLM_API_KEY` is set on the server, briefings come from a rule-based offline stand-in
(`model_id: offline-extractive-v1`), not an AI model.

## Demos

| Step | What exists | Command | What it shows |
|---|---|---|---|
| 1 | Models, config, provider client | `python -m pytest tests/test_llm_client.py tests/test_models_alignment.py -q` | Provider client tests (success, 429, 5xx, bad JSON) against a local fake server; model fields match the backend |
| 2 | Retrieval and scoring | `python3 -m demos.demo_02_retrieval_scoring` | Approved-only retrieval, 0-10 scores with explained factors, reviewer adjustment needing a reason |
| 3 | Briefing and guardrails | `python3 -m demos.demo_03_briefing_guardrails` | Labeled draft briefing, vote recommendation removed, no invented facts |
| 4 | Follow-up questions | `python3 -m demos.demo_04_followup` | Cited answers, refusal of vote advice, "insufficient evidence" |
| 5 | Pipeline | `python3 -m app.analysis` | The whole sample agenda through the pipeline, offline |
| 6 | Sources from the backend | curl commands below | Add a source with the backend's endpoint, then approve it over HTTP; analysis follows the table |
| 7 | Analysis endpoints | `python3 -m demos.demo_05_end_to_end` (server running; writes to the development database) | Agenda upload to heat list, briefing, and follow-up over HTTP |

## Source endpoints with curl (server running on port 8000)

Sources are added with the backend's own `POST /api/v1/sources` and approved with its
`PATCH /api/v1/sources/{source_id}/approval`. The analysis reads the same table.

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/sources \
  -H "Content-Type: application/json" \
  -d '{"title": "Minutes, Nov 13, 2025 (fictional)", "source_type": "minutes", "source_date": "2025-11-13", "text": "Public hearing on a request to rezone 12 acres near University Drive. Five residents expressed concern about traffic."}'

curl -s http://127.0.0.1:8000/api/v1/sources

curl -s -X PATCH http://127.0.0.1:8000/api/v1/sources/SOURCE_ID/approval \
  -H "Content-Type: application/json" -d '{"approved": true}'
```

A new source starts with `"approved": false` and is ignored by analysis until a person approves it.

## Contract for the frontend

Typical flow after an agenda upload (`POST /api/v1/agendas`):

1. `POST /api/v1/agendas/{agenda_id}/analyses` returns `202` and a job per item.
2. Poll `GET /api/v1/agendas/{agenda_id}/priorities` until no row has state `queued` or `running`.
   Each row: `item_id`, `item_number`, `title`, `procedural`, `job_id`, `state`
   (`not_analyzed | queued | running | completed | degraded | failed`), and `priority`
   (`score`, `category`, `evidence_level`, `incomplete`, `configuration_version`) or `null`.
3. `GET /api/v1/items/{item_id}/briefing` for the draft briefing, or `GET /api/v1/jobs/{job_id}`
   for the job with its priority, briefing, and error.
4. `POST /api/v1/items/{item_id}/questions` with `{"question": "..."}`.

How to display results:

* `priority.score` is `null` when evidence is insufficient or the item is procedural. Show
  "Not scored", never a zero. `priority.category` is `"Low" | "Moderate" | "High"` (or `null` when not scored). The backend computes both `score` and `category` (Low under 3.5, Moderate under 6.5, High 6.5 and up); the frontend displays them as given and must not apply its own thresholds.
* Each claim in `key_facts`, `concerns`, and `talking_points` has `text`, `kind` (`fact` or
  `interpretation`), `support` (`supported | uncertain | unsupported`), and `citation_ids`
  that point into `briefing.citations`. Show facts and interpretation differently, and show
  the citations.
* A job with state `degraded` still has a usable `priority` when only the language model failed
  (`error.code` is `PROVIDER_ERROR`, `DEPENDENCY_UNAVAILABLE`, or `RATE_LIMITED`). If the evidence
  was insufficient, `error.code` is `INSUFFICIENT_EVIDENCE`.
* `briefing.status` is always `draft`. Approval is a human action that is not built yet.
* Question answers: `status` is `answered` or `refused` (HTTP 200); no supporting evidence is
  HTTP 422 with `error.code` `INSUFFICIENT_EVIDENCE`.
* Errors use `{"error": {"code", "message", "request_id", "details", "retry_guidance"}}`.
* To label a briefing stale, compare `job.fingerprint` with a newer analysis; not yet exposed
  as an endpoint.

## Exact field names (use these, not placeholders)

Priority (`GET /api/v1/jobs/{job_id}` returns it under `priority`; the priorities list has a short version):

| Field | Meaning |
|---|---|
| `score` | 0 to 10, or `null` when not scored |
| `category` | `"Low"`, `"Moderate"`, `"High"`, or `null` |
| `evidence_level` | `strong`, `limited`, or `insufficient` |
| `factors[]` | `key`, `label`, `explanation`, `raw_value` (0 to 1), `weight`, `contribution` (points), `citations` (source ids) |

Briefing (`GET /api/v1/items/{item_id}/briefing`):

| Field | Meaning |
|---|---|
| `status` | always `draft` for now |
| `summary` | short text |
| `key_facts[]`, `concerns[]`, `talking_points[]` | claims: `text`, `kind` (`fact` or `interpretation`), `support` (`supported`, `uncertain`, `unsupported`), `citation_ids` |
| `anticipated_questions[]` | `question`, `draft_response`, `citation_ids`, `confirm_with` |
| `citations[]` | `citation_id`, `source_id`, `source_title`, `source_location`, `excerpt`, `source_date` |
| `model_id`, `incomplete`, `warnings[]` | which provider wrote it, whether it is partial, notes to show the user |

Notes for the frontend:

* A `citation_ids` entry of `"item"` means the agenda item's own text; there is no matching object in `citations`.
* There is no "historical context" field. Past-opposition evidence appears in the factor `explanation` and `citations`.
* Names a placeholder schema might use, mapped to the real ones: `support_level` is `support`, a claim's `citations` is `citation_ids`, a factor's `points` is `contribution`, and an anticipated question's `text` is `question`.

## Example responses (fictional data, item 4.4)

One row of `GET /api/v1/agendas/{agenda_id}/priorities`:

```json
{"item_number": "4.4", "procedural": false, "state": "completed",
 "priority": {"score": 4.5, "category": "Moderate", "evidence_level": "strong",
              "incomplete": false, "configuration_version": "score-0.1.0"}}
```

One factor from `GET /api/v1/jobs/{job_id}`:

```json
{"key": "cost_exposure", "label": "Cost exposure", "raw_value": 1.0, "weight": 0.3,
 "contribution": 3.0, "citations": ["<source_id>"],
 "explanation": "Largest dollar amount found: $12,800,000. Evidence mentions cost growth, change orders, or overruns."}
```

One claim and one citation from the briefing:

```json
{"text": "Residents of the Eastside neighborhood described repeated street flooding and asked for the project to move faster.",
 "kind": "fact", "support": "supported", "citation_ids": ["<source_id>:p1"]}

{"citation_id": "<source_id>:p1", "source_id": "<source_id>", "source_title": "City Council Minutes, June 12, 2025 (fictional)",
 "source_location": "paragraphs 1-2", "source_date": "2025-06-12", "excerpt": "Item 8. Eastside flooding and drainage improvements. ..."}
```

