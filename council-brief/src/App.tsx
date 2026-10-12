import { useMemo, useState } from "react"
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Link2,
  ListChecks,
  Loader2,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
import { AgendaItem, sampleItems, sampleSources, SourceRecord } from "./demo-data"

type View = "meeting" | "sources" | "evaluation"

function scoreFor(item: AgendaItem) {
  return item.factors.reduce((total, factor) => total + factor.score, 0)
}

function priorityFor(score: number) {
  if (score >= 7) return "High"
  if (score >= 4) return "Moderate"
  return "Low"
}

function priorityStyle(priority: string) {
  if (priority === "High") return "border-rose-200 bg-rose-50 text-rose-700"
  if (priority === "Moderate") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function statusStyle(status: AgendaItem["reviewStatus"]) {
  if (status === "Approved") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "Needs review") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

async function extractFileText(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const pdf = await task.promise
    const pages: string[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
      pages.push(text)
    }
    return pages.join("\n")
  }

  return file.text()
}

function inferItems(text: string, fileName: string): AgendaItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 7)

  const matches: { number: string; title: string }[] = []
  const seen = new Set<string>()
  const patterns = [
    /^(?:ITEM\s+)?(\d+(?:\.\d+)+)\s*[-:–]?\s+(.{8,180})$/i,
    /^(\d+)\.\s+(.{8,180})$/,
  ]

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match && !seen.has(match[1])) {
        seen.add(match[1])
        matches.push({ number: match[1], title: match[2].trim() })
        break
      }
    }
    if (matches.length >= 12) break
  }

  if (matches.length === 0) {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter((paragraph) => paragraph.length >= 30 && paragraph.length <= 240)
      .slice(0, 6)
    paragraphs.forEach((title, index) => matches.push({ number: `${index + 1}`, title }))
  }

  return matches.map((match, index) => {
    const lower = match.title.toLowerCase()
    const publicScore = /hearing|public comment|zoning/.test(lower) ? 2 : 0
    const householdScore = /tax|fee|rate|utility|budget/.test(lower) ? 2 : 0
    const scaleScore = /budget|citywide|capital|zoning|plan|contract/.test(lower) ? 2 : 1

    return {
      id: `upload-${Date.now()}-${index}`,
      number: match.number,
      title: match.title,
      department: "Department not identified",
      itemType: publicScore > 0 ? "Public action" : "Agenda action",
      reviewStatus: "Draft generated",
      summary: `This item was extracted from ${fileName}. Review the original agenda and attach supporting records before using the generated preparation material.`,
      factors: [
        { key: "public", label: "Formal public participation", description: "Inferred from agenda wording; verify manually.", score: publicScore },
        { key: "household", label: "Direct household effect", description: "Inferred from taxes, rates, fees, or utilities.", score: householdScore },
        { key: "scale", label: "Decision scale", description: "Preliminary estimate based on agenda wording.", score: scaleScore },
        { key: "attention", label: "Prior public attention", description: "No historical evidence attached yet.", score: 0 },
        { key: "tradeoff", label: "Decision uncertainty", description: "Manual review is required.", score: 1 },
      ],
      sourceIds: [],
      keyFacts: ["Agenda text was successfully extracted.", "Supporting facts have not yet been verified."],
      historicalContext: [],
      likelyQuestions: ["What decision is Council being asked to make?", "What supporting evidence should staff verify?"],
      talkingPoints: ["Confirm the agenda description and responsible department.", "Attach approved sources before briefing leadership."],
      missingInformation: ["Supporting City records", "Department review", "Verified dates and financial figures"],
    }
  })
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
      {children}
    </div>
  )
}

export default function App() {
  const [items, setItems] = useState<AgendaItem[]>(sampleItems)
  const [sources, setSources] = useState<SourceRecord[]>(sampleSources)
  const [selectedId, setSelectedId] = useState(sampleItems[0].id)
  const [view, setView] = useState<View>("meeting")
  const [briefTab, setBriefTab] = useState("briefing")
  const [query, setQuery] = useState("")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [agendaFile, setAgendaFile] = useState<File | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceTitle, setSourceTitle] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")

  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const selectedScore = scoreFor(selected)
  const selectedPriority = priorityFor(selectedScore)
  const selectedSources = sources.filter((source) => selected.sourceIds.includes(source.id))

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) =>
      `${item.number} ${item.title} ${item.department}`.toLowerCase().includes(normalized),
    )
  }, [items, query])

  const updateSelected = (update: Partial<AgendaItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === selected.id ? { ...item, ...update } : item)),
    )
  }

  const updateFactor = (key: string, score: number) => {
    updateSelected({
      factors: selected.factors.map((factor) =>
        factor.key === key ? { ...factor, score } : factor,
      ),
    })
  }

  const processAgenda = async () => {
    if (!agendaFile) {
      toast.error("Choose an agenda PDF or text file first.")
      return
    }
    setProcessing(true)
    try {
      const text = await extractFileText(agendaFile)
      const parsed = inferItems(text, agendaFile.name)
      if (parsed.length === 0) throw new Error("No agenda items could be identified")
      setItems((current) => [...parsed, ...current])
      setSelectedId(parsed[0].id)
      setView("meeting")
      setBriefTab("priority")
      setUploadOpen(false)
      toast.success(`${parsed.length} agenda item${parsed.length === 1 ? "" : "s"} extracted for review.`)
    } catch (error) {
      console.error(error)
      toast.error("The file could not be processed. Try a text-based PDF or a TXT file.")
    } finally {
      setProcessing(false)
    }
  }

  const addSource = async () => {
    if (!sourceFile && !sourceTitle.trim()) {
      toast.error("Add a title or choose a source document.")
      return
    }
    setProcessing(true)
    try {
      const text = sourceFile ? await extractFileText(sourceFile) : ""
      const id = `source-${Date.now()}`
      const record: SourceRecord = {
        id,
        title: sourceTitle.trim() || sourceFile?.name || "Untitled source",
        type: sourceFile?.type === "application/pdf" ? "Uploaded PDF" : "Uploaded record",
        date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        url: sourceUrl.trim(),
        excerpt: text.replace(/\s+/g, " ").trim().slice(0, 500) || "No text excerpt was supplied.",
        fileName: sourceFile?.name,
      }
      setSources((current) => [record, ...current])
      updateSelected({ sourceIds: [...selected.sourceIds, id] })
      setSourceOpen(false)
      setSourceTitle("")
      setSourceUrl("")
      setSourceFile(null)
      toast.success("Source added to the selected agenda item.")
    } catch (error) {
      console.error(error)
      toast.error("The source could not be processed.")
    } finally {
      setProcessing(false)
    }
  }

  const downloadBriefing = () => {
    const payload = {
      meeting: "College Station City Council — August 27, 2026",
      agendaItem: selected,
      preparationPriority: { score: selectedScore, category: selectedPriority },
      sources: selectedSources,
      generatedAt: new Date().toISOString(),
      disclaimer: "Prototype output. Human verification is required before use.",
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `briefing-${selected.number.replaceAll(".", "-")}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    toast.success("Briefing downloaded.")
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <Toaster position="top-right" richColors />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-[#0b1f33] text-white lg:flex print:hidden">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid size-10 place-items-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-950/30">
            <Landmark className="size-5" />
          </div>
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-blue-200">Team 3 prototype</p>
            <h1 className="text-lg font-semibold tracking-tight">Council Brief</h1>
          </div>
        </div>

        <nav className="space-y-1 px-3 py-5" aria-label="Primary navigation">
          {[
            { id: "meeting" as const, label: "Meeting workspace", icon: LayoutDashboard },
            { id: "sources" as const, label: "Source library", icon: FolderOpen },
            { id: "evaluation" as const, label: "Evaluation", icon: BarChart3 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                view === id ? "bg-white text-[#0b1f33]" : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 p-5">
          <div className="rounded-xl bg-white/8 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">
              <ShieldCheck className="size-4" />
              Prototype boundary
            </div>
            <p className="text-sm leading-5 text-slate-300">
              Public data only. Generated material remains a draft until a person reviews it.
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:static">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 py-3 sm:px-7 xl:px-10">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 lg:hidden">
                <Landmark className="size-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Council Brief</span>
              </div>
              <h2 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                College Station City Council
              </h2>
              <p className="text-sm text-slate-500">August 27, 2026 · Retrospective proof of concept</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 print:hidden">
              <Badge variant="outline" className="hidden border-blue-200 bg-blue-50 text-blue-700 sm:inline-flex">
                Provisional requirements
              </Badge>
              <Button variant="outline" onClick={() => setSourceOpen(true)} className="hidden sm:inline-flex">
                <Plus /> Add source
              </Button>
              <Button onClick={() => setUploadOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Upload /> <span className="hidden sm:inline">Upload agenda</span><span className="sm:hidden">Upload</span>
              </Button>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden print:hidden">
            {[
              { id: "meeting" as const, label: "Meeting" },
              { id: "sources" as const, label: "Sources" },
              { id: "evaluation" as const, label: "Evaluation" },
            ].map((nav) => (
              <Button key={nav.id} size="sm" variant={view === nav.id ? "secondary" : "ghost"} onClick={() => setView(nav.id)}>
                {nav.label}
              </Button>
            ))}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-7 xl:px-10">
          {view === "meeting" && (
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <section className="print:hidden">
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {[
                    { label: "Agenda items", value: items.length },
                    { label: "High priority", value: items.filter((item) => priorityFor(scoreFor(item)) === "High").length },
                    { label: "Approved", value: items.filter((item) => item.reviewStatus === "Approved").length },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-2xl font-semibold tracking-tight">{stat.value}</div>
                      <div className="mt-1 text-xs leading-4 text-slate-500">{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search agenda items"
                        aria-label="Search agenda items"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-2">
                    {filteredItems.map((item) => {
                      const score = scoreFor(item)
                      const priority = priorityFor(score)
                      const active = item.id === selected.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`mb-1 w-full rounded-xl border p-4 text-left transition ${
                            active
                              ? "border-blue-200 bg-blue-50 shadow-sm"
                              : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Item {item.number}</span>
                            <Badge variant="outline" className={priorityStyle(priority)}>{priority} · {score}/10</Badge>
                          </div>
                          <h3 className="text-[0.96rem] font-semibold leading-5 text-slate-900">{item.title}</h3>
                          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="truncate">{item.department}</span>
                            <ChevronRight className={`size-4 shrink-0 ${active ? "text-blue-600" : "text-slate-300"}`} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>

              <section className="min-w-0">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-5 sm:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">Item {selected.number}</Badge>
                          <Badge variant="outline" className={statusStyle(selected.reviewStatus)}>{selected.reviewStatus}</Badge>
                          <span className="text-sm text-slate-500">{selected.itemType}</span>
                        </div>
                        <h2 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{selected.title}</h2>
                        <p className="mt-2 text-sm text-slate-500">{selected.department}</p>
                      </div>
                      <div className={`min-w-[170px] rounded-xl border px-4 py-3 ${priorityStyle(selectedPriority)}`}>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em]">Preparation priority</span>
                          <CircleGauge className="size-4" />
                        </div>
                        <div className="mt-1 flex items-end gap-2">
                          <span className="text-2xl font-bold">{selectedPriority}</span>
                          <span className="pb-0.5 text-sm font-semibold">{selectedScore}/10</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Tabs value={briefTab} onValueChange={setBriefTab} className="gap-0">
                    <div className="overflow-x-auto border-b border-slate-100 px-5 sm:px-6 print:hidden">
                      <TabsList variant="line" className="h-12 gap-5">
                        <TabsTrigger value="briefing">Briefing</TabsTrigger>
                        <TabsTrigger value="priority">Priority factors</TabsTrigger>
                        <TabsTrigger value="evidence">Evidence <span className="rounded-full bg-slate-100 px-1.5 text-[0.7rem]">{selectedSources.length}</span></TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="briefing" className="p-5 sm:p-6">
                      <div className="mb-6 rounded-xl border-l-4 border-blue-600 bg-blue-50/70 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                          <Sparkles className="size-4" /> Source-grounded draft
                        </div>
                        <Textarea
                          value={selected.summary}
                          onChange={(event) => updateSelected({ summary: event.target.value })}
                          className="min-h-28 resize-y border-blue-100 bg-white/80 leading-6"
                          aria-label="Editable agenda item summary"
                        />
                      </div>

                      <div className="grid gap-6 lg:grid-cols-2">
                        <BriefingList title="Key facts" icon={CheckCircle2} items={selected.keyFacts} />
                        <BriefingList title="Historical context" icon={BookOpen} items={selected.historicalContext} empty="No historical context has been attached." />
                        <EditableList
                          title="Likely questions"
                          icon={FileSearch}
                          items={selected.likelyQuestions}
                          onChange={(likelyQuestions) => updateSelected({ likelyQuestions })}
                        />
                        <BriefingList title="Suggested talking points" icon={ListChecks} items={selected.talkingPoints} />
                      </div>

                      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
                          <AlertTriangle className="size-4" /> Verification needed
                        </div>
                        <ul className="space-y-1.5 text-sm leading-5 text-amber-900/80">
                          {selected.missingInformation.map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 print:hidden">
                        <p className="max-w-xl text-xs leading-5 text-slate-500">
                          Prototype output. Verify all claims against the original agenda packet before leadership use.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
                          <Button variant="outline" onClick={downloadBriefing}><Download /> Export JSON</Button>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              updateSelected({ reviewStatus: "Approved" })
                              toast.success("Briefing marked approved for this demonstration.")
                            }}
                          >
                            <Check /> Approve briefing
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="priority" className="p-5 sm:p-6">
                      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-semibold">Transparent provisional rubric</h3>
                          <p className="mt-1 text-sm leading-5 text-slate-500">Adjust the evidence-based factors. This measures preparation effort, not public opinion.</p>
                        </div>
                        <div className="min-w-44">
                          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                            <span>{selectedPriority}</span><span>{selectedScore}/10</span>
                          </div>
                          <Progress value={selectedScore * 10} className="bg-slate-200 [&_[data-slot=progress-indicator]]:bg-blue-600" />
                        </div>
                      </div>

                      <div className="space-y-4">
                        {selected.factors.map((factor) => (
                          <div key={factor.key} className="rounded-xl border border-slate-200 p-4">
                            <div className="mb-4 flex items-start justify-between gap-5">
                              <div>
                                <h4 className="font-semibold">{factor.label}</h4>
                                <p className="mt-1 text-sm leading-5 text-slate-500">{factor.description}</p>
                              </div>
                              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#0b1f33] text-sm font-bold text-white">{factor.score}</div>
                            </div>
                            <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                              <Slider
                                min={0}
                                max={2}
                                step={1}
                                value={[factor.score]}
                                onValueChange={(value) => updateFactor(factor.key, value[0])}
                                aria-label={`${factor.label} score`}
                                className="[&_[data-slot=slider-range]]:bg-blue-600 [&_[data-slot=slider-thumb]]:border-blue-600"
                              />
                              <span className="text-xs text-slate-500">0 · 1 · 2</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="evidence" className="p-5 sm:p-6">
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Supporting evidence</h3>
                          <p className="mt-1 text-sm text-slate-500">Important claims should trace back to an approved source.</p>
                        </div>
                        <Button variant="outline" onClick={() => setSourceOpen(true)}><Plus /> Add source</Button>
                      </div>
                      {selectedSources.length > 0 ? (
                        <div className="space-y-3">
                          {selectedSources.map((source) => <SourceCard key={source.id} source={source} />)}
                        </div>
                      ) : (
                        <EmptySection>No supporting sources are attached yet. Add a source before treating the briefing as grounded.</EmptySection>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </section>
            </div>
          )}

          {view === "sources" && (
            <section className="mx-auto max-w-6xl">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Evidence library</p>
                  <h2 className="text-2xl font-semibold tracking-tight">Approved and candidate sources</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">This demonstration uses official public records. Uploaded files remain in the current browser session.</p>
                </div>
                <Button onClick={() => setSourceOpen(true)} className="bg-blue-600 hover:bg-blue-700"><Plus /> Add source</Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {sources.map((source) => <SourceCard key={source.id} source={source} expanded />)}
              </div>
            </section>
          )}

          {view === "evaluation" && (
            <section className="mx-auto max-w-6xl">
              <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Retrospective test</p>
                <h2 className="text-2xl font-semibold tracking-tight">Agenda-only versus grounded briefing</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Demonstration values show the planned evaluation method. Replace them with measured results from repeated test cases.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard label="Traceable claims" agenda="2 of 8" grounded="8 of 8" note="Claims linked to source evidence" />
                <MetricCard label="Useful City sources" agenda="0" grounded="4" note="Records surfaced for reviewer inspection" />
                <MetricCard label="Priority explanation" agenda="No" grounded="5 factors" note="Repeatable, reviewable rationale" />
              </div>

              <Card className="mt-6 border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="size-5 text-blue-600" /> Validation checklist</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[660px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.08em] text-slate-500">
                          <th className="px-3 py-3 font-semibold">Test</th>
                          <th className="px-3 py-3 font-semibold">Method</th>
                          <th className="px-3 py-3 font-semibold">Provisional pass condition</th>
                          <th className="px-3 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          ["Agenda extraction", "Compare parsed items with source PDF", "All selected item numbers and titles match", "Ready"],
                          ["Evidence retrieval", "Check top results against reviewer-selected records", "Relevant evidence appears in top results", "Planned"],
                          ["Citation coverage", "Audit factual briefing claims", "Every material factual claim has a source", "Ready"],
                          ["Priority consistency", "Three reviewers score the same items", "Disagreements are documented and resolved", "Planned"],
                          ["Usefulness", "Staff reviews generated briefing", "Threshold requires City confirmation", "Blocked"],
                        ].map((row) => (
                          <tr key={row[0]}>
                            <td className="px-3 py-4 font-medium">{row[0]}</td>
                            <td className="px-3 py-4 text-slate-600">{row[1]}</td>
                            <td className="px-3 py-4 text-slate-600">{row[2]}</td>
                            <td className="px-3 py-4"><Badge variant="outline" className={row[3] === "Blocked" ? "border-amber-200 bg-amber-50 text-amber-700" : row[3] === "Ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>{row[3]}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
        </main>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a Council agenda</DialogTitle>
            <DialogDescription>Choose a text-based PDF or TXT file. Extracted items will be added as provisional drafts for manual review.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Upload className="mx-auto mb-3 size-7 text-blue-600" />
            <Input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(event) => setAgendaFile(event.target.files?.[0] ?? null)}
              aria-label="Choose agenda file"
              className="bg-white"
            />
            <p className="mt-3 text-xs text-slate-500">Scanned PDFs may require OCR before upload.</p>
          </div>
          {agendaFile && <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800"><FileText className="size-4" /> {agendaFile.name}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={processAgenda} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing ? <Loader2 className="animate-spin" /> : <FileSearch />}
              Extract agenda items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add supporting source</DialogTitle>
            <DialogDescription>Attach a public record to Item {selected.number}. The file is processed only for this demonstration session.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              Source title
              <Input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="FY27 proposed budget" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Public source URL <span className="font-normal text-slate-400">optional</span>
              <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Document <span className="font-normal text-slate-400">optional PDF or text</span>
              <Input type="file" accept=".pdf,.txt,.md" onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSourceOpen(false)}>Cancel</Button>
            <Button onClick={addSource} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing ? <Loader2 className="animate-spin" /> : <Link2 />} Attach source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BriefingList({
  title,
  icon: Icon,
  items,
  empty = "No information available.",
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: string[]
  empty?: string
}) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-4 text-blue-600" /> {title}</h3>
      {items.length > 0 ? (
        <ul className="space-y-2.5 text-sm leading-6 text-slate-700">
          {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-500" /> <span>{item}</span></li>)}
        </ul>
      ) : <EmptySection>{empty}</EmptySection>}
    </div>
  )
}

function EditableList({
  title,
  icon: Icon,
  items,
  onChange,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-4 text-blue-600" /> {title}</h3>
      <Textarea
        value={items.join("\n")}
        onChange={(event) => onChange(event.target.value.split("\n").filter(Boolean))}
        className="min-h-40 resize-y leading-6"
        aria-label={`Editable ${title.toLowerCase()}`}
      />
    </div>
  )
}

function SourceCard({ source, expanded = false }: { source: SourceRecord; expanded?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{source.type}</Badge>
            <span className="text-xs text-slate-400">{source.date}</span>
          </div>
          <h4 className="font-semibold leading-5">{source.title}</h4>
        </div>
        {source.url && (
          <Button size="icon-sm" variant="ghost" asChild>
            <a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.title}`}><ExternalLink /></a>
          </Button>
        )}
      </div>
      <p className={`mt-3 text-sm leading-6 text-slate-600 ${expanded ? "" : "line-clamp-3"}`}>{source.excerpt}</p>
      {source.fileName && <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><FileText className="size-3.5" /> {source.fileName}</p>}
    </div>
  )
}

function MetricCard({ label, agenda, grounded, note }: { label: string; agenda: string; grounded: string; note: string }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-100 p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Agenda only</p>
            <p className="mt-1 text-xl font-semibold">{agenda}</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-blue-600">Grounded</p>
            <p className="mt-1 text-xl font-semibold text-blue-800">{grounded}</p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">{note}</p>
      </CardContent>
    </Card>
  )
}
