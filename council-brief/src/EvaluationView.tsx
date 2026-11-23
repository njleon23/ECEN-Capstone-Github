// EvaluationView.tsx
//
// The "Evaluation" page (left sidebar -> Evaluation). It summarizes what the system has produced so far:
//   1. Four headline numbers ("stat tiles"): items analyzed, briefings approved, statements supported, sources approved
//   2. Three bar breakdowns: preparation priority, source support, analysis outcomes
//   3. A per-item table with the same information for each agenda item
//
// Everything is calculated from data App.tsx has already loaded (`items` and `sources`).
// This page does NOT call the backend and does NOT calculate scores; it only counts what the backend returned.
// That keeps the numbers consistent with the rest of the website.

// Types and helpers from the other frontend files.
import type { SourceRecord } from "./api"
import { categoryLabel, scoreLabel } from "./analysisApi" // turn an item into "High" and "7/10" text

// One bar in a breakdown chart.
interface Row {
  label: string   // text shown above the bar, for example "High"
  count: number   // how many items/statements fall in this group
  /** Tailwind background class for the bar. The label and count are always shown as text too. */
  bar: string
  hint?: string   // optional extra explanation, shown in the hover tooltip
}

// Percentage helper: pct(3, 12) -> 25. Returns 0 instead of dividing by zero.
function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

// One headline number card: a big value, a label under it, and an optional small detail line.
function StatTile({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-700">{label}</div>
      {detail && <div className="mt-0.5 text-xs text-slate-500">{detail}</div>}
    </div>
  )
}

/**
 * A card with a title and one horizontal bar per row.
 * Each bar is labeled with its name, count and percentage as text, so the chart can be read without
 * relying on color. Hovering a row shows a tooltip (the HTML `title` attribute) with the full numbers.
 */
function Breakdown({ title, description, rows }: { title: string; description: string; rows: Row[] }) {
  // Total across all rows; each bar's width is its share of this total.
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      {total === 0 ? (
        // Nothing analyzed yet: show a message instead of empty bars.
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Nothing to show yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.label} title={`${row.label}: ${row.count} of ${total} (${pct(row.count, total)}%)${row.hint ? ` — ${row.hint}` : ""}`}>
              {/* Label on the left, "count · percent" on the right. */}
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-700">{row.label}</span>
                <span className="tabular-nums text-slate-500"><span className="font-semibold text-slate-900">{row.count}</span> · {pct(row.count, total)}%</span>
              </div>
              {/* Gray track with the colored bar inside. Bars are at least 2% wide so small non-zero counts stay visible. */}
              <div className="h-2 rounded bg-slate-100">
                {row.count > 0 && <div className={`h-2 rounded ${row.bar}`} style={{ width: `${Math.max(pct(row.count, total), 2)}%` }} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The whole Evaluation page. App.tsx renders it as <EvaluationView items={items} sources={sources} />.
 *   items   = every agenda item, including any analysis results restored from the backend
 *   sources = every source in the Source Library
 */
export function EvaluationView({ items, sources }: { items: any[]; sources: SourceRecord[] }) {
  // ---- Headline counts ------------------------------------------------------------------------

  // Items whose analysis has been run at least once ("idle" means never run).
  const analyzed = items.filter((item) => item.analysisState && item.analysisState !== "idle")
  // Items a reviewer has approved with the "Approve Briefing" button.
  const approvedBriefings = items.filter((item) => item.reviewStatus === "Approved").length
  // Sources marked approved in the Source Library (only these are used by the analysis).
  const approvedSources = sources.filter((source) => source.approved).length

  // Every statement from every analyzed item, combined into one list.
  const claims = analyzed.flatMap((item) => [...(item.key_facts ?? []), ...(item.concerns ?? []), ...(item.talking_points ?? [])])
  // How many of those statements the backend confirmed against a cited source.
  const supported = claims.filter((claim: any) => claim.support === "supported").length

  // ---- Breakdown 1: preparation priority --------------------------------------------------------
  // Colors match the High / Moderate / Low badges used in the agenda list.
  const priorityRows: Row[] = [
    { label: "High", count: items.filter((i) => i.category === "High").length, bar: "bg-rose-500" },
    { label: "Moderate", count: items.filter((i) => i.category === "Moderate").length, bar: "bg-amber-500" },
    { label: "Low", count: items.filter((i) => i.category === "Low").length, bar: "bg-emerald-500" },
    { label: "Procedural", count: items.filter((i) => !i.category && i.procedural).length, bar: "bg-slate-400", hint: "routine items that are not scored" },
    { label: "Analyzed, not scored", count: analyzed.filter((i) => !i.category && !i.procedural).length, bar: "bg-slate-400", hint: "usually insufficient evidence" },
    { label: "Not analyzed yet", count: items.filter((i) => !i.analysisState || i.analysisState === "idle").length, bar: "bg-slate-200" },
  ]

  // ---- Breakdown 2: source support for statements -------------------------------------------------
  const supportRows: Row[] = [
    { label: "Supported by a cited source", count: supported, bar: "bg-emerald-500" },
    { label: "Uncertain", count: claims.filter((c: any) => c.support === "uncertain").length, bar: "bg-amber-500" },
    { label: "Unsupported", count: claims.filter((c: any) => c.support === "unsupported").length, bar: "bg-rose-500" },
  ]

  // ---- Breakdown 3: how each analysis run finished ---------------------------------------------------
  // "degraded" means the model step had a problem but the score and the last good briefing were kept.
  const outcomeRows: Row[] = [
    { label: "Completed", count: analyzed.filter((i) => i.analysisState === "completed").length, bar: "bg-emerald-500" },
    { label: "Completed with a problem (degraded)", count: analyzed.filter((i) => i.analysisState === "degraded").length, bar: "bg-amber-500", hint: "score kept, last good briefing shown" },
    { label: "Failed", count: analyzed.filter((i) => i.analysisState === "failed").length, bar: "bg-rose-500" },
  ]

  // Which briefing writers produced the briefings (for the Dec 2 demo this is the offline rule-based stand-in).
  // new Set(...) removes duplicates; filter(Boolean) drops items with no writer.
  const writers = [...new Set(analyzed.map((i) => i.modelId).filter(Boolean))] as string[]

  return (
    <section className="mx-auto max-w-6xl">
      {/* ---- Page heading ---- */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">System evaluation</p>
        <h2 className="text-2xl font-semibold tracking-tight">How the briefings are holding up</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Counts across every agenda item loaded from the backend. Briefing writer:{" "}
          {/* Writer ids starting with "offline" are labeled as the rule-based stand-in, not an AI model. */}
          {writers.length === 0 ? "none yet" : writers.map((w) => (w.startsWith("offline") ? `${w} (rule-based stand-in, not an AI model)` : w)).join(", ")}.
        </p>
      </div>

      {/* ---- 1. Headline numbers: 2 per row on small screens, 4 per row on large screens ---- */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={`${analyzed.length}/${items.length}`} label="Items analyzed" detail={`${pct(analyzed.length, items.length)}% of the agenda`} />
        <StatTile value={`${approvedBriefings}/${items.length}`} label="Briefings approved" detail="by a signed-in reviewer" />
        <StatTile value={claims.length ? `${pct(supported, claims.length)}%` : "—"} label="Statements supported" detail={`${supported} of ${claims.length} statements`} />
        <StatTile value={`${approvedSources}/${sources.length}`} label="Sources approved" detail="only approved sources are used" />
      </div>

      {/* ---- 2. The three breakdown charts, side by side on large screens ---- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Breakdown title="Preparation priority" description="How the agenda items were scored." rows={priorityRows} />
        <Breakdown title="Source support" description="Key facts, concerns and talking points, checked against their cited sources." rows={supportRows} />
        <Breakdown title="Analysis outcomes" description="How each analysis run finished." rows={outcomeRows} />
      </div>

      {/* ---- 3. Per-item table. overflow-x-auto lets it scroll sideways on narrow screens ---- */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          {/* Hidden caption that screen readers announce. */}
          <caption className="sr-only">Per-item evaluation details</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Analysis</th>
              <th className="px-4 py-3 font-semibold">Review</th>
              <th className="px-4 py-3 text-right font-semibold">Statements supported</th>
              <th className="px-4 py-3 text-right font-semibold">Sources attached</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              // This item's statements, and how many are supported, for the "Statements supported" column.
              const itemClaims = [...(item.key_facts ?? []), ...(item.concerns ?? []), ...(item.talking_points ?? [])]
              const itemSupported = itemClaims.filter((c: any) => c.support === "supported").length
              return (
                <tr key={item.id}>
                  <td className="px-4 py-3"><span className="text-slate-500">{item.number}</span> <span className="font-medium text-slate-900">{item.title}</span></td>
                  <td className="whitespace-nowrap px-4 py-3">{categoryLabel(item)} · {scoreLabel(item)}</td>
                  <td className="whitespace-nowrap px-4 py-3 capitalize">{item.analysisState === "idle" ? "Not run" : item.analysisState}</td>
                  <td className="whitespace-nowrap px-4 py-3">{item.reviewStatus}</td>
                  {/* "3/5" means 3 of 5 statements are supported; "—" means no statements yet. */}
                  <td className="px-4 py-3 text-right tabular-nums">{itemClaims.length ? `${itemSupported}/${itemClaims.length}` : "—"}</td>
                  {/* Note: App.tsx loads an item's attached sources when the item is opened in the
                      Meeting workspace, so items not opened yet in this visit can show 0 here. */}
                  <td className="px-4 py-3 text-right tabular-nums">{item.sourceIds?.length ?? 0}</td>
                </tr>
              )
            })}
            {/* Shown only when no agenda has been uploaded. */}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No agenda items loaded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
