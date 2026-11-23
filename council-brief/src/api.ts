export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8000/api/v1"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Reads a readable message from a failed response, including detail objects like { message }. */
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json()
    const detail = body?.detail
    if (detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail.message === "string") {
      return detail.message
    }
    if (typeof detail === "string") return detail
    if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return detail[0].msg
    if (typeof body?.error?.message === "string") return body.error.message
    return fallback
  } catch {
    return fallback
  }
}

export interface Factor {
  key: string
  label: string
  description: string
  score: number
}

export interface AgendaItem {
  id: string
  number: string
  title: string
  department: string
  itemType: string
  reviewStatus: "Draft generated" | "Needs review" | "Approved"
  summary: string
  factors: Factor[]
  sourceIds: string[]
  keyFacts: string[]
  historicalContext: string[]
  likelyQuestions: string[]
  talkingPoints: string[]
  missingInformation: string[]
  /** The meeting this item belongs to, as the backend parsed it from the agenda. */
  agendaId?: string
  meetingTitle?: string | null
  meetingDate?: string | null
}

export interface SourceRecord {
  id: string
  title: string
  type: string
  date: string
  url: string
  excerpt: string
  fileName?: string
  approved?: boolean
}

interface BackendAgendaItem {
  item_id: string
  agenda_id: string
  item_number: string
  title: string
  source_text: string
  order: number
  review_status: "needs_review" | "confirmed"
}

interface BackendAgendaResponse {
  agenda_id: string
  meeting_title: string | null
  meeting_date: string | null
  version_id: string
  original_file_name: string
  uploader: string
  source_url: string | null
  client_version: string | null
  uploaded_at: string
  parsing_status:
    | "completed"
    | "completed_with_warnings"
    | "failed"
  warnings: string[]
  items: BackendAgendaItem[]
}

interface BackendSourceResponse {
  source_id: string
  title: string
  source_type: string
  text: string
  source_date: string | null
  source_url: string | null
  file_name: string | null
  approved: boolean
  ingested_at: string
}

type SourceRecordInput = Omit<SourceRecord, "id">

async function requireSuccessfulResponse(
  response: Response,
  fallbackMessage: string,
) {
  if (response.ok) return
  throw new ApiError(await readErrorMessage(response, fallbackMessage), response.status)
}

// Converts one agenda item from the backend's format (snake_case names) into the shape the screens use.
// `agenda` is the agenda the item came from; its meeting title and date are copied onto every item so the
// header can show the right meeting for whichever item is open.
function mapAgendaItem(item: BackendAgendaItem, agenda?: BackendAgendaResponse): AgendaItem {
  return {
    agendaId: item.agenda_id,
    meetingTitle: agenda?.meeting_title ?? null,
    meetingDate: agenda?.meeting_date ?? null,
    id: item.item_id,
    number: item.item_number,
    title: item.title,
    department: "Not assigned",
    itemType: "Agenda item",
    reviewStatus:
      item.review_status === "confirmed"
        ? "Approved"
        : "Needs review",
    summary: item.source_text,
    factors: [],
    sourceIds: [],
    keyFacts: [],
    historicalContext: [],
    likelyQuestions: [],
    talkingPoints: [],
    missingInformation: [
      "AI analysis and briefing content have not been generated yet.",
    ],
  }
}

function formatSourceDate(source: BackendSourceResponse): string {
  const dateText =
    source.source_date ?? source.ingested_at.slice(0, 10)

  const [year, month, day] = dateText
    .slice(0, 10)
    .split("-")
    .map(Number)

  if (!year || !month || !day) return dateText

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day))
}

function mapSource(source: BackendSourceResponse): SourceRecord {
  return {
    id: source.source_id,
    title: source.title,
    type: source.source_type,
    date: formatSourceDate(source),
    url: source.source_url ?? "",
    excerpt: source.text || "No text excerpt was supplied.",
    fileName: source.file_name ?? undefined,
    approved: source.approved,
  }
}

function toIsoDate(dateText: string): string | null {
  const parsed = new Date(dateText)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

export async function fetchAgendas(): Promise<AgendaItem[]> {
  const response = await fetch(`${API_BASE_URL}/agendas`)

  await requireSuccessfulResponse(
    response,
    "Failed to fetch agendas from the backend.",
  )

  const agendas =
    (await response.json()) as BackendAgendaResponse[]

  return agendas.flatMap((agenda) =>
    agenda.items.map((item) => mapAgendaItem(item, agenda)),
  )
}

export async function uploadAgendaPdf(
  file: File,
  token: string | null
): Promise<AgendaItem[]> {
  const formData = new FormData()
  formData.append("file", file)

  const headers: HeadersInit = {}
  if (token) headers["Authorization"] = `Bearer ${token}`

  const response = await fetch(`${API_BASE_URL}/agendas`, {
    method: "POST",
    headers,
    body: formData,
  })

  await requireSuccessfulResponse(
    response,
    "Failed to upload the agenda.",
  )

  const agenda =
    (await response.json()) as BackendAgendaResponse

  return agenda.items.map((item) => mapAgendaItem(item, agenda))
}

/**
 * Turns the backend's meeting date into readable text: "2026-08-27" -> "August 27, 2026".
 * Returns null when the agenda had no date, so the header can say "Meeting date not listed" instead.
 * The date is split by hand (not new Date("2026-08-27")) because that form is read as UTC midnight and
 * can show the previous day in US time zones.
 */
export function formatMeetingDate(dateText: string | null | undefined): string | null {
  if (!dateText) return null
  const [year, month, day] = dateText.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day) return dateText
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day))
}

export async function fetchSources(): Promise<SourceRecord[]> {
  const response = await fetch(`${API_BASE_URL}/sources`)

  await requireSuccessfulResponse(
    response,
    "Failed to fetch sources from the backend.",
  )

  const sources =
    (await response.json()) as BackendSourceResponse[]

  return sources.map(mapSource)
}

export async function addSourceRecord(
  record: SourceRecordInput,
  token: string | null
): Promise<SourceRecord> {
  const requestBody = {
    title: record.title,
    source_type: "other",
    text: record.excerpt,
    source_date: toIsoDate(record.date),
    source_url: record.url || null,
    file_name: record.fileName ?? null,
    approved: false,
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const response = await fetch(`${API_BASE_URL}/sources`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  })

  await requireSuccessfulResponse(
    response,
    "Failed to add the source record.",
  )

  const source =
    (await response.json()) as BackendSourceResponse

  return mapSource(source)
}