// A small in-memory stand-in for the backend API, used by the website tests.
// It serves two analyzed agenda items (A and B) and records every save request.
// A save can be held open and released later, to reproduce "the response arrives after the reviewer switched items".

import { vi } from "vitest"

export const ITEM_A = { id: "item-a", number: "3.1", title: "Award of the Riverside Street contract", briefingId: "briefing-a", jobId: "job-a" }
export const ITEM_B = { id: "item-b", number: "3.2", title: "Public hearing on Maple Avenue rezoning", briefingId: "briefing-b", jobId: "job-b" }

// Factor values on purpose: A and B have the same value for two factors. A control that only reset when its value
// changed would keep A's unsaved edit after switching to B.
const FACTORS: Record<string, number[]> = {
  [ITEM_A.id]: [0.903, 0, 0, 0.35],
  [ITEM_B.id]: [0.5, 0, 0, 0.6],
}
const FACTOR_DEFS = [
  { key: "cost_exposure", label: "Cost exposure", weight: 0.3 },
  { key: "historical_opposition", label: "Opposition in similar past items", weight: 0.25 },
  { key: "public_discussion", label: "Public discussion", weight: 0.25 },
  { key: "topic_sensitivity", label: "Topic sensitivity", weight: 0.2 },
]

const NOW = "2026-11-22T00:00:00Z"
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

export interface SavedReviewRequest { briefingId: string; status: string; comments: string }
export interface SavedAdjustmentRequest { itemId: string; factorKey: string; reason: string }

export function installFakeBackend() {
  const reviews: Record<string, any[]> = {}
  const adjustments: Record<string, any[]> = {}
  const reviewRequests: SavedReviewRequest[] = []
  const adjustmentRequests: SavedAdjustmentRequest[] = []
  const heldReviews = new Map<string, () => void>()
  const heldAdjustments = new Map<string, () => void>()
  const holdReviewFor = new Set<string>()
  const holdAdjustmentFor = new Set<string>()
  let counter = 0

  const item = (it: typeof ITEM_A, order: number) => ({
    item_id: it.id, agenda_id: "agenda-1", item_number: it.number, title: it.title,
    source_text: `${it.number} ${it.title}`, order, review_status: "needs_review",
  })
  const job = (it: typeof ITEM_A) => ({
    job_id: it.jobId, item_id: it.id, state: "completed", progress_message: "Completed",
    created_at: NOW, completed_at: NOW, error: null,
    priority: {
      item_id: it.id, score: 3.4, category: "Low", configuration_version: "score-0.1.0",
      factors: FACTOR_DEFS.map((f, i) => ({
        key: f.key, label: f.label, explanation: "Test data.", raw_value: FACTORS[it.id][i], weight: f.weight,
        contribution: Math.round(FACTORS[it.id][i] * f.weight * 100) / 10, citations: [],
      })),
      evidence_level: "limited", incomplete: false, manual_adjustment: null, computed_at: NOW,
    },
    briefing: {
      briefing_id: it.briefingId, item_id: it.id, revision: 1, status: "draft", summary: `Summary of ${it.title}`,
      key_facts: [], concerns: [], anticipated_questions: [], talking_points: [], citations: [],
      generated_at: NOW, model_id: "offline-extractive-v1", prompt_version: "briefing-0.1.0",
      configuration_version: "score-0.1.0", source_ids: [], incomplete: false, warnings: [],
    },
  })
  const byItemId = (id: string) => (id === ITEM_A.id ? ITEM_A : id === ITEM_B.id ? ITEM_B : null)
  const byBriefingId = (id: string) => (id === ITEM_A.briefingId ? ITEM_A : id === ITEM_B.briefingId ? ITEM_B : null)

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost")
    const path = url.pathname.replace(/^.*\/api\/v1/, "")
    const method = (init?.method ?? "GET").toUpperCase()
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined
    let m: RegExpMatchArray | null

    if (path === "/auth/login" && method === "POST") return json({ access_token: "test-token", token_type: "bearer", expires_in: 3600 })
    if (path === "/auth/logout") return json({ status: "ok" })
    if (path === "/agendas" && method === "GET") {
      return json([{ agenda_id: "agenda-1", meeting_title: "Test meeting", meeting_date: "2026-11-12", version_id: "v1", original_file_name: "a.txt", uploader: "test", source_url: null, client_version: "x", uploaded_at: NOW, parsing_status: "parsed", warnings: [], items: [item(ITEM_A, 1), item(ITEM_B, 2)] }])
    }
    if (path === "/sources" && method === "GET") return json([])
    if ((m = path.match(/^\/items\/([^/]+)\/analysis$/)) && method === "GET") {
      const it = byItemId(m[1]); return it ? json(job(it)) : json({ detail: "none" }, 404)
    }
    if ((m = path.match(/^\/agenda-items\/([^/]+)\/sources$/)) && method === "GET") return json([])
    if ((m = path.match(/^\/briefings\/([^/]+)\/reviews$/)) && method === "GET") return json(reviews[m[1]] ?? [])
    if ((m = path.match(/^\/items\/([^/]+)\/priority\/adjustments$/)) && method === "GET") return json(adjustments[m[1]] ?? [])

    if ((m = path.match(/^\/briefings\/([^/]+)\/review$/)) && method === "PATCH") {
      const briefingId = m[1]
      reviewRequests.push({ briefingId, status: body.status, comments: body.comments })
      if (holdReviewFor.has(briefingId)) await new Promise<void>((release) => heldReviews.set(briefingId, release))
      const saved = { review_id: `review-${++counter}`, briefing_id: briefingId, status: body.status, reviewer: "tester", comments: body.comments, reviewed_at: NOW }
      ;(reviews[briefingId] ??= []).push(saved)
      return json(saved)
    }
    if ((m = path.match(/^\/items\/([^/]+)\/priority\/adjustments$/)) && method === "POST") {
      const itemId = m[1]
      adjustmentRequests.push({ itemId, factorKey: body.factor_key, reason: body.reason })
      if (holdAdjustmentFor.has(itemId)) await new Promise<void>((release) => heldAdjustments.set(itemId, release))
      const saved = { adjustment_id: `adj-${++counter}`, item_id: itemId, job_id: byItemId(itemId)?.jobId, factor_key: body.factor_key, old_value: 0, new_value: body.new_raw_value, old_score: 3.4, new_score: 4.1, new_category: "Low", reason: body.reason, reviewer: "tester", created_at: NOW }
      ;(adjustments[itemId] ??= []).push(saved)
      return json(saved, 201)
    }
    return json({ detail: `unhandled ${method} ${path}` }, 404)
  }

  vi.stubGlobal("fetch", vi.fn(handler))
  void byBriefingId

  return {
    reviewRequests,
    adjustmentRequests,
    /** The next review for this briefing will not finish until `releaseReview` is called. */
    holdReview(briefingId: string) { holdReviewFor.add(briefingId) },
    releaseReview(briefingId: string) { holdReviewFor.delete(briefingId); heldReviews.get(briefingId)?.(); heldReviews.delete(briefingId) },
    holdAdjustment(itemId: string) { holdAdjustmentFor.add(itemId) },
    releaseAdjustment(itemId: string) { holdAdjustmentFor.delete(itemId); heldAdjustments.get(itemId)?.(); heldAdjustments.delete(itemId) },
  }
}
