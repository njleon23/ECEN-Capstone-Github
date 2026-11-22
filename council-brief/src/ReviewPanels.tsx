// Small panels for the staff workflow: attaching sources, review history,
// and the reviewer factor adjustment (FSR ANA-007). All saved results come from the backend.

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"

import type { AdjustmentRecord, ReviewRecord, UiFactor } from "./analysisApi"
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

/**
 * One priority factor with a slider. Moving the slider changes nothing until the reviewer gives a reason and saves.
 * The backend recomputes the score and category and keeps the reviewer name, reason and old value.
 */
export function FactorAdjuster({
  factor,
  canAdjust,
  onSave,
}: {
  factor: UiFactor
  canAdjust: boolean
  onSave: (factorKey: string, newRawValue: number, reason: string) => Promise<void>
}) {
  const [value, setValue] = useState(factor.points)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(factor.points)
    setReason("")
  }, [factor.points, factor.key])

  const changed = Math.abs(value - factor.points) >= 0.05
  const save = async () => {
    setSaving(true)
    try {
      const raw = factor.maxPoints > 0 ? Math.min(1, Math.max(0, value / factor.maxPoints)) : 0
      await onSave(factor.key, Math.round(raw * 1000) / 1000, reason)
    } catch {
      // the parent shows the error message
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-[1fr_auto] items-center gap-4">
        <Slider
          min={0}
          max={factor.maxPoints ?? 2.5}
          step={0.1}
          value={[value]}
          onValueChange={(next) => setValue(next[0])}
          disabled={!canAdjust}
          aria-label={`${factor.label} points`}
          className={`[&_[data-slot=slider-range]]:bg-blue-600 [&_[data-slot=slider-thumb]]:border-blue-600 ${canAdjust ? "" : "opacity-50"}`}
        />
        <span className="text-xs text-slate-500">{value.toFixed(1)} of {factor.maxPoints ?? 2.5} max</span>
      </div>
      {changed && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <label htmlFor={`reason-${factor.key}`} className="mb-1.5 block text-xs font-semibold text-blue-900">
            Reason for this change (required)
          </label>
          <Input
            id={`reason-${factor.key}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: a petition is not in the approved sources"
            className="border-blue-100 bg-white text-sm"
          />
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={saving} onClick={save}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}Save adjustment
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setValue(factor.points); setReason("") }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export function AdjustmentHistory({ adjustments, labels }: { adjustments: AdjustmentRecord[]; labels: Record<string, string> }) {
  if (adjustments.length === 0) return null
  return (
    <div className="mt-6">
      <h4 className="mb-2 text-sm font-semibold">Reviewer adjustments</h4>
      <ul className="space-y-2" aria-label="Adjustment history">
        {[...adjustments].reverse().map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{labels[a.factorKey] ?? a.factorKey}</span>
              <span className="text-slate-500">score {a.oldScore} to {a.newScore} ({a.newCategory})</span>
              <span className="text-xs text-slate-400">{a.reviewer}, {when(a.at)}</span>
            </div>
            <p className="mt-1.5 leading-5 text-slate-600">{a.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
