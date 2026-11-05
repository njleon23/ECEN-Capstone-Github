# AI and Analytics (`app/analysis`)

Retrieval, scoring, briefing generation, follow-up questions, and evaluation for the Council
Brief backend (FSR "AI and analytics owner" scope). Pure Python standard library; the HTTP
layer lives in `app/routers/analysis.py`; sources come from the backend's own `app/routers/sources.py`.

## What it does

1. **Retrieve** passages from *approved* sources only (BM25, `retrieval.py`).
2. **Score** each item 0-10 for preparation priority from four explained factors (`scoring.py`).
3. **Brief**: ask an LLM for a source-cited draft briefing; every claim is checked and labeled
   supported / uncertain / unsupported (`briefing.py`). Status is always `draft`.
4. **Answer follow-up questions** from the same sources, with citations, refusing vote advice
   and public statements (`followup.py`, `guardrails.py`).
5. **Orchestrate** jobs with states, idempotency, audit events, and "keep the last good
   briefing" (`pipeline.py`).

Procedural items (Call to Order, Adjourn, Approval of Minutes, Public Comment, reports, Executive
Session) are not scored or briefed. See `ScoreConfig.procedural_title_patterns`.

## Modules

| Module | Job |
|---|---|
| `models.py`, `errors.py`, `config.py`, `text_utils.py` | Data classes (ICD field names), error codes, tunable settings and prompts, text helpers |
| `chunking.py`, `retrieval.py` | Passages that keep source, date, and location; BM25 ranking, approval checked at query time |
| `scoring.py`, `evaluation.py` | Versioned score and reviewer adjustment (reason required); measurement helpers for PER-002/005/006 |
| `llm_client.py`, `retry.py` | `OpenAICompatibleProvider` (real) and `OfflineExtractiveProvider` (**rule-based stand-in, not an AI**); one validated retry |
| `briefing.py`, `guardrails.py`, `followup.py` | Briefing validation and labeling; pattern guardrails; grounded answers |
| `pipeline.py` | `submit` / `run_job` / `start` / `ask`, job states, idempotency, staleness fingerprint |
| `source_store.py`, `item_store.py`, `service.py` | Read-only access to the backend's `sources` and `agenda_items` tables (PostgreSQL), process-wide wiring that re-reads the approval flags before each use |
| `demo_sources.py`, `sample_data.py` | FICTIONAL sources for the Oct 8 sample agenda; FICTIONAL data used by the unit tests |

## Configuration (server environment only, SEC-001)

| Variable | Meaning |
|---|---|
| `LLM_API_KEY` | If set, the real OpenAI-compatible provider is used. If unset, the offline stand-in is used. Never commit it or send it to the browser. |
| `LLM_BASE_URL` | Default `https://api.openai.com/v1` |
| `LLM_MODEL` | Default `gpt-4o-mini` |

Every briefing carries `model_id` (`offline-extractive-v1` for the stand-in) so the UI can say
which one produced it.

## Endpoints added

```text
Sources use the backend's own endpoints (nothing was added for them):
POST  /api/v1/sources                       add a source (starts unapproved)
PATCH /api/v1/sources/{source_id}/approval  {"approved": true|false}   (a human action)

POST /api/v1/items/{item_id}/analyses      202 {job_id, state, status_url}
POST /api/v1/agendas/{agenda_id}/analyses  202 {jobs: [...]}   one job per item
GET  /api/v1/agendas/{agenda_id}/priorities  heat list: score/category/evidence per item
GET  /api/v1/jobs/{job_id}                 queued | running | completed | degraded | failed
GET  /api/v1/items/{item_id}/briefing      latest draft briefing
POST /api/v1/items/{item_id}/questions     {"question": "..."}  -> answered | refused | 422
```

Errors use the same envelope as the agenda endpoints (`code`, `message`, `request_id`,
`details`, `retry_guidance`). Send an `Idempotency-Key` header on analysis requests to make
retries safe.

## Run the checks

```bash
cd backend
python -m pytest -q                          # all tests (needs the PostgreSQL test database)
python3 -m app.analysis                      # whole sample agenda, offline, no network
python3 -m demos.demo_02_retrieval_scoring   # stage demos (see docs/analysis-demos.md)
```

## Requirement coverage

| FSR IDs | Where |
|---|---|
| SRC-004 to SRC-007 | `chunking.py`, `retrieval.py`, `source_store.py` (reads the backend's source approval) |
| ANA-004 to ANA-007, PER-006 | `scoring.py`, `config.py` |
| ANA-001 to ANA-003, ANA-010, REL-007 | `briefing.py` |
| ANA-008, ANA-009 | `followup.py`, `guardrails.py` |
| REL-002 to REL-004, REL-006, REV-001, REV-004 | `pipeline.py` |
| SEC-001, SEC-006, SEC-008 | `service.py`, `llm_client.py`, `pipeline.py` |
| PER-002, PER-005 (measurement helpers only) | `evaluation.py` |

## Known limits (read before presenting)

* **Score factors and weights are proposals.** Cost 0.30, opposition in similar past items
  0.25, public discussion 0.25, topic sensitivity 0.20; cutoffs 3.5 and 6.5. The FSR names the
  factors but not their definitions, and the City has not validated any of it. On the Oct 8
  sample agenda no item scores "high" (the range is 0.8 to 4.7). That comes from the weights and
  the small fictional source set, not from tuning.
* **Two thresholds were set by eye on small fictional data:** `min_relevance` 0.15 and
  `cost_min_relevance` 0.40. A real labeled test set (PER-005) should replace them.
* **Retrieval is lexical** plus a small word table (`text_utils.ALIASES`). It misses paraphrases
  and can match on generic words. Embeddings (ICD-TBD-04) are supported through the `Embedder`
  hook but untested against a real model.
* **The live provider has never been called against a real service.** It is tested against a
  local fake server only. Run `python3 -m app.analysis --live` once with a real key first.
* **The offline provider is not an AI.** It proves the wiring. Briefing quality depends on the
  real model and the prompts in `config.py`.
* **Guardrails are pattern rules** and will miss some phrasings. Human review is the main control.
* **Sentiment and emotion analysis from the CONOPS are not implemented.**
* **Jobs, briefings, idempotency keys, and audit events are in memory** and are lost on restart.
  Sources and agenda items are in PostgreSQL (the backend's tables, read-only here). The reviewer score adjustment (`apply_manual_adjustment`) exists but has
  no endpoint or storage yet.
* **No authentication.** The analysis cannot tell who approved a source. It re-reads the approval
  flag before each use and records only that it saw a change.
* **All approved sources are used for every item.** The backend can attach sources to individual
  agenda items (`/api/v1/agenda-items/{item_id}/sources`), but retrieval does not filter by those
  attachments yet. Whether it should is a team decision.
* **Parser footer:** the last agenda item (7. Adjourn) includes the line "END OF FICTIONAL
  DEMONSTRATION AGENDA" in its `source_text`. Trimming trailing footers is a parser change.
* **Validation errors** (for example an empty question) return FastAPI's default 422 body, not the
  project error envelope, because the app has no global handler yet.
* **Not measured:** the 60 second analysis target (PER-003) and parser accuracy (PER-002).
