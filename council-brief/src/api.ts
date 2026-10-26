const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8000/api/v1"

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
}

export interface SourceRecord {
  id: string
  title: string
  type: string
  date: string
  url: string
  excerpt: string
  fileName?: string
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

  let message = fallbackMessage

  try {
    const body = await response.json()
    message = body?.error?.message ?? body?.detail ?? fallbackMessage
  } catch {
    // Use the fallback when the response is not JSON.
  }

  throw new Error(message)
}

function mapAgendaItem(item: BackendAgendaItem): AgendaItem {
  return {
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
    agenda.items.map(mapAgendaItem),
  )
}

export async function uploadAgendaPdf(
  file: File,
): Promise<AgendaItem[]> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE_URL}/agendas`, {
    method: "POST",
    body: formData,
  })

  await requireSuccessfulResponse(
    response,
    "Failed to upload the agenda.",
  )

  const agenda =
    (await response.json()) as BackendAgendaResponse

  return agenda.items.map(mapAgendaItem)
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

  const response = await fetch(`${API_BASE_URL}/sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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