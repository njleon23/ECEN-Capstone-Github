// BriefingParts.tsx
//
// Read-only pieces of the Briefing tab. App.tsx uses these to display what the analysis produced:
//   - ClaimList     -> "Key facts", "Concerns to check" and "Suggested talking points"
//   - QuestionList  -> "Likely questions", each one opening to show its draft answer
//   - CitationList  -> the sources under a statement; each source opens to show the quoted excerpt
//
// These components only DISPLAY data. They never call the backend and never change anything,
// so they are safe to reuse anywhere a briefing is shown.

// Icons from the lucide-react icon library (the same library the rest of the app uses).
import { ChevronRight, Link2 } from "lucide-react"

// Types only (no code): the shapes of a citation and a claim, defined in analysisApi.ts.
import type { UiCitation, UiClaim } from "./analysisApi"

// The type of an icon component, for example CheckCircle2. App.tsx passes one in so each list has its own icon.
type Icon = React.ComponentType<{ className?: string }>

// The shape of one "likely question", matching what analysisApi.ts puts in item.anticipated_questions.
export interface UiQuestion {
  text: string                          // the question a council member might ask
  draft_response: string | null         // suggested answer; null when the sources don't cover it
  support_level: "Moderate" | "Low"     // Moderate if at least one source backs it, Low if none
  citations: string[]                   // short labels like "FY27 Budget, page 4"
  citationDetails: UiCitation[]         // full citation objects (title, date, excerpt...)
}

// Tailwind classes for the colored "High / Moderate / Low support" badge.
// Green = well supported, amber = partly, gray = weak. The badge also shows the word, so color is not the only signal.
const SUPPORT_STYLE: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  moderate: "bg-amber-50 text-amber-800 ring-amber-600/20",
  low: "bg-slate-50 text-slate-600 ring-slate-500/10",
}

// A dashed gray box shown when a list has nothing in it yet (for example, before the analysis has run).
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">{children}</div>
}

// The small "High support" / "Moderate support" / "Low support" badge next to a statement.
function SupportBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[0.65rem] font-medium ring-1 ring-inset ${SUPPORT_STYLE[level.toLowerCase()] ?? SUPPORT_STYLE.low}`}>
      {level} support
    </span>
  )
}

/**
 * The sources behind one statement, shown as an indented list under it.
 *
 * Each source uses the HTML <details>/<summary> element: the <summary> line (the source's title) is always
 * visible, and clicking it opens the rest (the date and the quoted excerpt). This needs no extra React state
 * because the browser handles opening and closing.
 *
 * `details` are the full citation objects. If they are missing (older data), it falls back to the plain text
 * `labels`. If neither exists, it shows nothing.
 */
export function CitationList({ details, labels }: { details?: UiCitation[]; labels?: string[] }) {
  // Case 1: full citation details are available -> clickable sources that open to show the excerpt.
  if (details && details.length > 0) {
    return (
      <ul className="ml-5 mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
        {details.map((citation) => (
          <li key={citation.id}>
            {/* "group" lets the arrow icon inside react to the open/closed state ("group-open:rotate-90"). */}
            <details className="group text-xs text-slate-500">
              {/* The clickable line. "list-none" and the webkit rule hide the browser's default triangle,
                  since we draw our own arrow (ChevronRight) that rotates when opened. */}
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded py-0.5 hover:text-blue-700 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3 shrink-0 transition group-open:rotate-90" />
                <Link2 className="size-3 shrink-0 text-slate-400" />
                {/* Title and location, for example "FY27 Budget, page 4". filter(Boolean) drops empty parts. */}
                <span className="font-medium">{[citation.title, citation.location].filter(Boolean).join(", ")}</span>
              </summary>
              {/* Only visible after clicking: the source date and the exact text that was cited. */}
              <div className="mb-2 mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 leading-5 text-slate-600">
                {citation.date && <p className="mb-1 text-slate-400">{citation.date}</p>}
                <p className="whitespace-pre-line">“{citation.excerpt}”</p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    )
  }

  // Case 2: only text labels are available -> a plain, non-clickable list.
  if (labels && labels.length > 0) {
    return (
      <ul className="ml-5 mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
        {labels.map((label, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link2 className="size-3 text-slate-400" /> {label}
          </li>
        ))}
      </ul>
    )
  }

  // Case 3: no sources at all -> render nothing.
  return null
}

/**
 * A titled list of briefing statements. Used three times in App.tsx: Key facts, Concerns to check,
 * and Suggested talking points.
 *
 * Each statement shows: its text, a support badge, how many sources back it, and the sources themselves
 * (via CitationList). `items` can also be plain strings, which are shown without badges or sources.
 * `empty` is the message shown when the list is empty.
 */
export function ClaimList({ title, icon: Icon, items, empty = "No information available." }: { title: string; icon: Icon; items: Array<UiClaim | string> | undefined; empty?: string }) {
  return (
    <div>
      {/* Section heading with its icon, for example "✓ Key facts". */}
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-4 text-blue-600" /> {title}</h3>

      {items && items.length > 0 ? (
        <ul className="space-y-4 text-sm leading-6 text-slate-700">
          {items.map((item, idx) => {
            // A plain string has no badge or sources; a claim object has both.
            const claim = typeof item === "string" ? null : item
            // Number of sources, preferring the full details and falling back to the text labels.
            const sourceCount = claim ? (claim.citationDetails?.length || claim.citations?.length || 0) : 0
            return (
              <li key={idx} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  {/* Blue bullet dot. */}
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-500" />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{claim ? claim.text : item as string}</span>
                    {claim?.support_level && <SupportBadge level={claim.support_level} />}
                    {/* "2 sources" badge, only when there is at least one source. */}
                    {sourceCount > 0 && (
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[0.65rem] font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                        {sourceCount} source{sourceCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                {/* The clickable sources under the statement. */}
                {claim && <CitationList details={claim.citationDetails} labels={claim.citations} />}
              </li>
            )
          })}
        </ul>
      ) : <Empty>{empty}</Empty>}
    </div>
  )
}

/**
 * The "Likely questions" list. Each question is a card; clicking it opens the draft answer
 * and the sources that answer is based on.
 *
 * If the backend could not write an answer (draft_response is null), the card says so instead of
 * showing a blank answer, because the tool only answers from approved sources.
 */
export function QuestionList({ title, icon: Icon, items, empty = "No likely questions yet. Run the analysis to generate them." }: { title: string; icon: Icon; items: UiQuestion[] | undefined; empty?: string }) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-4 text-blue-600" /> {title}</h3>

      {items && items.length > 0 ? (
        <ul className="space-y-3 text-sm leading-6 text-slate-700">
          {items.map((question, idx) => (
            <li key={idx} className="rounded-xl border border-slate-200 bg-white">
              {/* Same open/close pattern as CitationList: <summary> is the visible question,
                  the rest appears when it is clicked. */}
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-2 p-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="mt-1 size-4 shrink-0 text-slate-400 transition group-open:rotate-90" />
                  <span className="flex-1 font-medium text-slate-900">{question.text}</span>
                  <SupportBadge level={question.support_level} />
                </summary>

                {/* Opened part: the draft answer, then its sources. */}
                <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Draft answer</p>
                  {question.draft_response ? (
                    <p className="text-slate-700">{question.draft_response}</p>
                  ) : (
                    <p className="italic text-slate-500">No draft answer: the approved sources do not cover this question.</p>
                  )}
                  <CitationList details={question.citationDetails} labels={question.citations} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : <Empty>{empty}</Empty>}
    </div>
  )
}
