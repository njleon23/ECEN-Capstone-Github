import { useState } from "react"
import { Loader2, MessageSquare } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { askFollowUp, FollowUpResult } from "./analysisApi"

const STATUS_LABEL: Record<FollowUpResult["status"], string> = {
  answered: "Answered from approved sources",
  refused: "Not answered: outside this tool's scope",
  insufficient_evidence: "Insufficient evidence",
  error: "Could not answer",
}

const STATUS_STYLE: Record<FollowUpResult["status"], string> = {
  answered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  refused: "border-amber-200 bg-amber-50 text-amber-700",
  insufficient_evidence: "border-slate-200 bg-slate-50 text-slate-600",
  error: "border-rose-200 bg-rose-50 text-rose-700",
}

/** Follow-up questions for one agenda item, answered only from approved sources. */
export function FollowUpBox({ itemId }: { itemId: string }) {
  const [question, setQuestion] = useState("")
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<FollowUpResult | null>(null)

  const ask = async () => {
    const trimmed = question.trim()
    if (!trimmed || asking) return
    setAsking(true)
    try {
      setResult(await askFollowUp(itemId, trimmed))
    } catch {
      setResult({ status: "error", text: "The backend could not be reached.", citations: [] })
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 print:hidden" data-testid="follow-up-box">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <MessageSquare className="size-4 text-blue-600" /> Ask a follow-up question
      </h3>
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") ask() }}
          placeholder="For example: Why did the estimate go up?"
          aria-label="Follow-up question"
        />
        <Button onClick={ask} disabled={asking || !question.trim()} className="bg-blue-600 hover:bg-blue-700">
          {asking ? <Loader2 className="animate-spin" /> : null} Ask
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3" data-testid="follow-up-result">
          <Badge variant="outline" className={STATUS_STYLE[result.status]}>{STATUS_LABEL[result.status]}</Badge>
          <p className="text-sm leading-6 text-slate-700">{result.text}</p>
          {result.citations.map((citation) => (
            <div key={citation.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <p className="font-semibold text-slate-800">{citation.title}</p>
              <p className="text-slate-500">{[citation.date, citation.location].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 line-clamp-3">{citation.excerpt}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">Answers use approved sources only. This tool does not recommend how to vote.</p>
    </div>
  )
}
