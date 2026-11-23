// FollowUpBox.tsx
//
// The "Ask a follow-up question" box on the Briefing tab. The user types a question about the open agenda
// item; the backend answers using only approved sources, or explains why it can't (outside scope, or not
// enough evidence). Every question asked during this visit stays listed, newest first.
import { useState } from "react"
import { Loader2, MessageSquare } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { askFollowUp, FollowUpResult } from "./analysisApi"
import { ApiError } from "./api"

// The text shown on the badge above each answer, one per possible result from the backend.
const STATUS_LABEL: Record<FollowUpResult["status"], string> = {
  answered: "Answered from approved sources",
  refused: "Not answered: outside this tool's scope",
  insufficient_evidence: "Insufficient evidence",
  error: "Could not answer",
}

// Badge colors: green = answered, amber = refused, gray = not enough evidence, red = error.
const STATUS_STYLE: Record<FollowUpResult["status"], string> = {
  answered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  refused: "border-amber-200 bg-amber-50 text-amber-700",
  insufficient_evidence: "border-slate-200 bg-slate-50 text-slate-600",
  error: "border-rose-200 bg-rose-50 text-rose-700",
}

/** Follow-up questions for one agenda item, answered only from approved sources. */
export function FollowUpBox({ 
  itemId, 
  token,
  onApiError
}: { 
  itemId: string; 
  token: string | null;
  onApiError: (error: unknown, fallback: string) => void;
}) {
  const [question, setQuestion] = useState("")
  const [asking, setAsking] = useState(false)
  // Every question asked about this item in this visit, newest first. The parent remounts this box per item,
  // so one item's answers never show under another.
  const [history, setHistory] = useState<Array<{ id: number; question: string; result: FollowUpResult }>>([])

  // Runs when "Ask" is clicked or Enter is pressed.
  const ask = async () => {
    const trimmed = question.trim()
    if (!trimmed || asking) return   // ignore empty questions and double-clicks while one is running
    setAsking(true)
    // Adds one question + answer to the top of the history list.
    const record =(result: FollowUpResult) =>
      setHistory((current) => [{ id: Date.now(), question: trimmed, result }, ...current])
    try {
      record(await askFollowUp(itemId, trimmed, token))
      setQuestion("")   // clear the box only when the question went through
    } catch (error) {
      // Expired session (401) or too many requests (429): let App.tsx handle it (sign-in dialog / wait message).
      if (error instanceof ApiError && (error.status === 401 || error.status === 429)) {
        onApiError(error, "Failed to ask question.")
        return
      }
      // Any other failure (for example the backend is offline) is shown as an error entry in the history.
      record({ status: "error", text: "The backend could not be reached.", citations: [] })
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

      {/* History of questions and answers, newest first. Older entries are slightly faded.
          The newest entry keeps data-testid="follow-up-result" so automated tests can find the latest answer. */}
      {history.length > 0 && (
        <ol className="mt-4 space-y-4" aria-label="Follow-up questions asked">
          {history.map(({ id, question: asked, result }, index) => (
            <li
              key={id}
              className={`space-y-3 ${index > 0 ? "border-t border-slate-100 pt-4 opacity-80" : ""}`}
              data-testid={index === 0 ? "follow-up-result" : undefined}
            >
              <p className="text-sm font-semibold text-slate-900">Q: {asked}</p>
              <Badge variant="outline" className={STATUS_STYLE[result.status]}>{STATUS_LABEL[result.status]}</Badge>
              <p className="text-sm leading-6 text-slate-700">{result.text}</p>
              {result.citations.map((citation) => (
                <div key={citation.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  <p className="font-semibold text-slate-800">{citation.title}</p>
                  <p className="text-slate-500">{[citation.date, citation.location].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 line-clamp-3">{citation.excerpt}</p>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-slate-400">Answers use approved sources only. This tool does not recommend how to vote.</p>
    </div>
  )
}