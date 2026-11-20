// AI and Analytics client: the one place that talks to the analysis endpoints.
//
// Backend contract: docs/analysis-demos.md. This module turns the backend's response objects
// (score, category, factors, claims with citation ids) into the shapes the screens already use
// (score, category, key_facts, anticipated_questions, talking_points, priority.factors).
// The backend decides the score and the category; nothing here calculates either.

import { API_BASE_URL, ApiError, readErrorMessage } from "./api"

export type Category = "Low" | "Moderate" | "High"
export type Support = "supported" | "uncertain" | "unsupported"
export type EvidenceLevel = "strong" | "limited" | "insufficient"
export type AnalysisState = "idle" | "completed" | "degraded" | "failed"

// ---- what the backend sends -------------------------------------------------------------

interface ApiCitation {
  citation_id: string
  source_id: string
  source_title: string
  source_location: string
  source_date: string | null
  excerpt: string
}

interface ApiClaim {
  text: string
  kind: "fact" | "interpretation"
  support: Support
  citation_ids: string[]
}

interface ApiQuestion {
  question: string
  draft_response: string | null
  citation_ids: string[]
}

interface ApiFactor {
  key: string
  label: string
  explanation: string
  weight: number
  raw_value: number
  contribution: number
}

interface ApiPriority {
  score: number | null
  category: Category | null
  evidence_level: EvidenceLevel
  factors: ApiFactor[]
  manual_adjustment?: { factor_key: string; reason: string; reviewer_id: string; old_value: number; new_value: number } | null
}

interface ApiBriefing {
  briefing_id: string
  status: string
  summary: string
  key_facts: ApiClaim[]
  concerns: ApiClaim[]
  anticipated_questions: ApiQuestion[]
  talking_points: ApiClaim[]
  citations: ApiCitation[]
  source_ids: string[]
  warnings: string[]
  model_id: string
}

interface ApiJob {
  job_id: string
  state: "queued" | "running" | "completed" | "degraded" | "failed"
  error: { code: string; message: string } | null
  priority: ApiPriority | null
  briefing: ApiBriefing | null
}

// ---- what the screens use ----------------------------------------------------------------

export interface UiCitation {
  id: string
  sourceId: string
  title: string
  location: string
  date: string | null
  excerpt: string
}

export interface UiClaim {
  text: string
  kind: "fact" | "interpretation"
  support: Support
  support_level: "High" | "Moderate" | "Low"
  /** Source labels the UI shows in its dropdown, for example "Title, location". */
  citations: string[]
  citationDetails: UiCitation[]
}

export interface UiFactor {
  key: string
  label: string
  explanation: string
  points: number
  maxPoints: number
  /** 0 to 1, as the backend stores it. A reviewer adjustment sends this value. */
  rawValue: number
}

export interface UiAdjustment {
  factorKey: string
  reason: string
  reviewer: string
}

export interface AdjustmentRecord {
  id: string
  factorKey: string
  oldScore: number
  newScore: number
  newCategory: string
  reason: string
  reviewer: string
  at: string
}

export interface ReviewRecord {
  id: string
  status: "draft" | "in_review" | "approved" | "rejected"
  reviewer: string
  comments: string
  at: string
}

export interface AnalysisFields {
  score: number | null
  category: Category | null
  evidenceLevel: EvidenceLevel | null
  analysisState: AnalysisState
  procedural: boolean
  priority: { factors: UiFactor[] }
  key_facts: UiClaim[]
  concerns: UiClaim[]
  anticipated_questions: Array<{ text: string; draft_response: string | null; support_level: "Moderate" | "Low"; citations: string[]; citationDetails: UiCitation[] }>
  talking_points: UiClaim[]
  missingInformation: string[]
  summary?: string
  /** Sources the briefing actually used. The sources attached to the item are `sourceIds` on the item. */
  usedSourceIds?: string[]
  modelId?: string
  jobId?: string
  briefingId?: string
  adjustment?: UiAdjustment | null
}

export interface FollowUpResult {
  status: "answered" | "refused" | "insufficient_evidence" | "error"
  text: string
  citations: UiCitation[]
}

// ---- helpers -----------------------------------------------------------------------------

const SUPPORT_LEVEL = { supported: "High", uncertain: "Moderate", unsupported: "Low" } as const
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** 401 (session problem) and 429 (rate limit) are handled by the screen, so they are rethrown. */
function isAuthOrRateLimit(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 429)
}

function toUiCitation(c: ApiCitation): UiCitation {
  return { id: c.citation_id, sourceId: c.source_id, title: c.source_title, location: c.source_location, date: c.source_date, excerpt: c.excerpt }
}

function resolve(ids: string[], byId: Map<string, UiCitation>): UiCitation[] {
  // The id "item" means the agenda item's own text. It has no citation object.
  return ids.map((id) => byId.get(id)).filter((c): c is UiCitation => Boolean(c))
}

const label = (c: UiCitation) => [c.title, c.location].filter(Boolean).join(", ")

function toUiClaim(claim: ApiClaim, byId: Map<string, UiCitation>): UiClaim {
  const details = resolve(claim.citation_ids, byId)
  return {
    text: claim.text,
    kind: claim.kind,
    support: claim.support,
    support_level: SUPPORT_LEVEL[claim.support],
    citations: details.map(label),
    citationDetails: details,
  }
}

// ---- display helpers (use these instead of computing anything in the screens) --------------

export function categoryLabel(item: { category?: Category | null; procedural?: boolean; analysisState?: AnalysisState }): string {
  if (item.category) return item.category
  if (item.procedural) return "Procedural"
  if (!item.analysisState || item.analysisState === "idle") return "Not analyzed"
  return "Not scored"
}

export function scoreLabel(item: { score?: number | null }): string {
  return typeof item.score === "number" ? `${item.score}/10` : "Not scored"
}

/** Fields every item needs before an analysis has run, so screens never see `undefined`. */
export function withAnalysisDefaults<T extends object>(item: T): T & AnalysisFields {
  return {
    score: null,
    category: null,
    evidenceLevel: null,
    analysisState: "idle",
    procedural: false,
    priority: { factors: [] },
    key_facts: [],
    concerns: [],
    anticipated_questions: [],
    talking_points: [],
    missingInformation: ["The analysis has not been run yet. Choose Analyze this item."],
    ...item,
  } as T & AnalysisFields
}

// ---- mapping a finished job ----------------------------------------------------------------

export function jobToFields(job: ApiJob, keptPreviousBriefing = false): AnalysisFields {
  const priority = job.priority
  const briefing = job.briefing
  const byId = new Map<string, UiCitation>((briefing?.citations ?? []).map((c) => [c.citation_id, toUiCitation(c)]))
  const claims = (list: ApiClaim[] | undefined) => (list ?? []).map((c) => toUiClaim(c, byId))
  const procedural = Boolean(briefing?.warnings?.[0]?.startsWith("Procedural item"))

  const notes: string[] = []
  if (job.error?.code === "INSUFFICIENT_EVIDENCE") {
    notes.push("No approved source matched this item, so no score was generated. Approve a related source in the Source Library, then run the analysis again.")
  } else if (job.error) {
    notes.push(`The briefing could not be completed: ${job.error.message}${priority?.score != null ? " The score is still shown." : ""}`)
  }
  if (keptPreviousBriefing && job.error) {
    notes.unshift(`The latest run could not write a new briefing (${job.error.message}) The last saved briefing is shown below.`)
  }
  if (briefing) {
    notes.push(...briefing.warnings)
    const weak = [...briefing.key_facts, ...briefing.concerns, ...briefing.talking_points].filter((c) => c.support !== "supported").length
    if (weak > 0) notes.push(`${weak} statement(s) could not be fully verified against the cited sources. Check them before use.`)
    if (priority?.evidence_level === "limited") notes.push("Evidence is limited: few approved sources matched this item.")
    if (!procedural) {
      const writer = briefing.model_id.startsWith("offline") ? "a rule-based stand-in (not an AI model)" : briefing.model_id
      notes.push(`Draft prepared by ${writer}. A person must verify it before use.`)
    }
  }

  const fields: AnalysisFields = {
    score: priority?.score ?? null,
    category: priority?.category ?? null,
    evidenceLevel: priority?.evidence_level ?? null,
    analysisState: job.state === "failed" ? "failed" : job.state === "degraded" ? "degraded" : "completed",
    procedural,
    priority: {
      factors: (priority?.factors ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        explanation: f.explanation,
        points: round(f.contribution),
        maxPoints: round(f.weight * 10),
        rawValue: f.raw_value,
      })),
    },
    key_facts: claims(briefing?.key_facts),
    concerns: claims(briefing?.concerns),
    anticipated_questions: (briefing?.anticipated_questions ?? []).map((q: ApiQuestion) => {
      const details = resolve(q.citation_ids, byId)
      return {
        text: q.question,
        draft_response: q.draft_response,
        support_level: details.length > 0 ? ("Moderate" as const) : ("Low" as const),
        citations: details.map(label),
        citationDetails: details,
      }
    }),
    talking_points: claims(briefing?.talking_points),
    missingInformation: notes,
  }
  fields.jobId = job.job_id
  fields.adjustment = priority?.manual_adjustment
    ? { factorKey: priority.manual_adjustment.factor_key, reason: priority.manual_adjustment.reason, reviewer: priority.manual_adjustment.reviewer_id }
    : null
  if (briefing) {
    fields.summary = briefing.summary
    fields.usedSourceIds = briefing.source_ids
    fields.modelId = briefing.model_id
    fields.briefingId = briefing.briefing_id
  }
  return fields
}

// ---- calls -----------------------------------------------------------------------------------

// Polls every 0.5 s for up to 2 minutes, which leaves room for a live model.
async function waitForJob(jobId: string, tries = 240, delayMs = 500): Promise<ApiJob> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`)
    if (!response.ok) {
      throw new ApiError(await readErrorMessage(response, "The analysis job could not be read."), response.status)
    }
    const job = (await response.json()) as ApiJob
    if (job.state === "completed" || job.state === "degraded" || job.state === "failed") return job
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs))
  }
  throw new Error("The analysis took too long to finish.")
}

function failedFields(message: string): AnalysisFields {
  return { ...(withAnalysisDefaults({}) as AnalysisFields), analysisState: "failed", missingInformation: [message] }
}

/**
 * When a run fails because the model failed (not because evidence is missing), the backend keeps the last good
 * briefing. This fetches it so the page can keep showing it next to the clear error message.
 */
async function withLastGoodBriefing(job: ApiJob, itemId: string): Promise<AnalysisFields> {
  if (job.briefing || job.error?.code === "INSUFFICIENT_EVIDENCE" || !job.error) return jobToFields(job)
  try {
    const response = await fetch(`${API_BASE_URL}/items/${itemId}/briefing`)
    if (response.ok) return jobToFields({ ...job, briefing: (await response.json()) as ApiBriefing }, true)
  } catch {
    // fall through: show the error without a briefing
  }
  return jobToFields(job)
}

async function analyzeOne(itemId: string, token: string | null): Promise<AnalysisFields> {
  try {
    const headers: HeadersInit = {}
    if (token) headers["Authorization"] = `Bearer ${token}`

    const started = await fetch(`${API_BASE_URL}/items/${itemId}/analyses`, {
      method: "POST",
      headers,
    })
    if (!started.ok) {
      const message = await readErrorMessage(started, "The analysis could not be started.")
      if (started.status === 401 || started.status === 429) throw new ApiError(message, started.status)
      return failedFields(message)
    }
    const { job_id } = (await started.json()) as { job_id: string }
    return await withLastGoodBriefing(await waitForJob(job_id), itemId)
  } catch (error) {
    // Session and rate-limit problems go to the screen, which signs the user in again or shows the retry message.
    if (isAuthOrRateLimit(error)) throw error
    return failedFields(error instanceof Error ? error.message : "The analysis failed.")
  }
}

/**
 * Analyzes one agenda item: one request to start the job, then polling until it finishes.
 * Most failures come back as a result with analysisState "failed" and a message.
 * A 401 or 429 is thrown as an ApiError so the screen can handle it.
 * A whole-agenda option can be added later; it should keep the agenda id so other agendas are not analyzed.
 */
export const analyzeItem = analyzeOne

/** Short label for a briefing's writer, for the draft heading. */
export function writerLabel(modelId?: string): string {
  if (!modelId || modelId === "none") return "Source-grounded draft"
  return modelId.startsWith("offline")
    ? "Source-grounded draft (rule-based stand-in, not an AI model)"
    : `Source-grounded draft (AI model: ${modelId})`
}

/** Approves or withdraws a source. Only approved sources are ever used by the analysis. */
export async function setSourceApproval(sourceId: string, approved: boolean, token: string | null): Promise<void> {
  const headers: HeadersInit = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const response = await fetch(`${API_BASE_URL}/sources/${sourceId}/approval`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ approved }),
  })
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response, "The approval could not be saved."), response.status)
  }
}

/** Asks a follow-up question about one item. Refusals and "insufficient evidence" are normal results. */
export async function askFollowUp(itemId: string, question: string, token: string | null): Promise<FollowUpResult> {
  const headers: HeadersInit = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const response = await fetch(`${API_BASE_URL}/items/${itemId}/questions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ question }),
  })
  if (response.ok) {
    const body = (await response.json()) as { status: "answered" | "refused"; answer?: string; message?: string; citations?: ApiCitation[] }
    return {
      status: body.status,
      text: body.status === "answered" ? body.answer ?? "" : body.message ?? "",
      citations: (body.citations ?? []).map(toUiCitation),
    }
  }

  // Read the body once, then decide what it means.
  let code = ""
  let message = "The question could not be answered."
  try {
    const body = await response.json()
    const detail = body?.detail
    code = body?.error?.code ?? (detail && typeof detail === "object" && !Array.isArray(detail) ? detail.code ?? "" : "")
    if (detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail.message === "string") message = detail.message
    else if (typeof detail === "string") message = detail
    else if (Array.isArray(detail) && typeof detail[0]?.msg === "string") message = detail[0].msg
    else if (typeof body?.error?.message === "string") message = body.error.message
  } catch {
    // keep the fallback message
  }

  if (response.status === 401 || response.status === 429) throw new ApiError(message, response.status)
  return { status: code === "INSUFFICIENT_EVIDENCE" ? "insufficient_evidence" : "error", text: message, citations: [] }
}

// ---- saved results: what survives a page refresh ---------------------------------------------------------

/** Everything the page needs to show an item again after a refresh. `null` means nothing was saved. */
export interface RestoredItem {
  fields: AnalysisFields
}

/** Loads the latest saved analysis and its briefing. Never throws. */
export async function restoreSavedItem(itemId: string): Promise<RestoredItem | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/items/${itemId}/analysis`)
    if (!response.ok) return null
    return { fields: await withLastGoodBriefing((await response.json()) as ApiJob, itemId) }
  } catch {
    return null
  }
}