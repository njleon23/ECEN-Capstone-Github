// Small panels for the staff workflow: attaching sources to an item. Saved results come from the backend.

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import type { SourceRecord } from "./api"

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
