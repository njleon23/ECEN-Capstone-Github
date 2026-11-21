// Small panels for the staff workflow: attaching sources and the review history.
// All saved results come from the backend.

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import type { ReviewRecord } from "./analysisApi"
import type { SourceRecord } from "./api"

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

const REVIEW_LABEL: Record<ReviewRecord["status"], string> = {
  approved: "Approved",
  rejected: "Rejected / flagged",
  in_review: "In review",
  draft: "Draft",
}

export function ReviewHistory({ reviews }: { reviews: ReviewRecord[] }) {
  if (reviews.length === 0) return <p className="mt-3 text-xs text-slate-500">No reviews saved for this briefing yet.</p>
  return (
    <ul className="mt-4 space-y-2" aria-label="Review history">
      {[...reviews].reverse().map((review) => (
        <li key={review.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={review.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
              {REVIEW_LABEL[review.status]}
            </Badge>
            <span className="font-medium">{review.reviewer}</span>
            <span className="text-xs text-slate-400">{when(review.at)}</span>
          </div>
          {review.comments && <p className="mt-1.5 leading-5 text-slate-600">{review.comments}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Attach one of the existing sources to the open item. Only approved, attached sources are analyzed. */
export function AttachPicker({ available, onAttach }: { available: SourceRecord[]; onAttach: (source: SourceRecord) => Promise<void> }) {
  const [choice, setChoice] = useState("")
  const [busy, setBusy] = useState(false)

  if (available.length === 0) return <p className="mt-4 text-xs text-slate-500">Every source in the library is already attached to this item.</p>

  const attach = async () => {
    const source = available.find((s) => s.id === choice)
    if (!source) return
    setBusy(true)
    try {
      await onAttach(source)
      setChoice("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="min-w-56 flex-1">
        <label htmlFor="attach-source" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Attach a source to this item
        </label>
        <select
          id="attach-source"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
        >
          <option value="">Choose a source</option>
          {available.map((source) => (
            <option key={source.id} value={source.id}>
              {source.title}
              {source.approved ? "" : " (not approved)"}
            </option>
          ))}
        </select>
      </div>
      <Button variant="outline" disabled={!choice || busy} onClick={attach}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}Attach
      </Button>
    </div>
  )
}
