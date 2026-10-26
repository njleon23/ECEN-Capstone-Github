import { useMemo, useState, useEffect } from "react"
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

// Import our FastAPI backend service layer instead of static mock data
import { fetchAgendas, uploadAgendaPdf, fetchSources, addSourceRecord } from "./api"
import { AgendaItem, SourceRecord } from "./api"

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

function EmptySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
      {children}
    </div>
  )
}

export default function App() {
  // State management for agendas and sources fetched from FastAPI
  const [items, setItems] = useState<AgendaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<SourceRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
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

  // Fetch live agendas and sources from FastAPI backend on initial component mount
  useEffect(() => {
    async function loadBackendData() {
      setIsLoading(true)
      setError(null)
      try {
        const [agendaData, sourceData] = await Promise.all([fetchAgendas(), fetchSources()])
        if (agendaData && agendaData.length > 0) {
          setItems(agendaData)
          setSelectedId(agendaData[0].id)
        }
        if (sourceData) {
          setSources(sourceData)
        }
      } catch (err) {
        console.error("Failed to connect to FastAPI backend:", err)
        setError("Could not connect to the backend database. The Python server may be offline.")
        toast.error("Could not connect to FastAPI backend on port 8000.")
      } finally {
        setIsLoading(false)
      }
    }
    loadBackendData()
  }, [])

  // === TODO: DEMO ONLY - DELETE THIS FUNCTION WHEN BACKEND IS CONNECTED ===
  const loadMockData = () => {
    const mockItem = {
      id: "mock-1",
      number: "8.1",
      title: "Approve vendor contract for traffic analysis",
      department: "Public Works",
      itemType: "Regular Agenda",
      reviewStatus: "Needs review",
      summary: "Example summary based on Quan's planned backend schema. The project was competitively bid.",
      keyFacts: ["Project cost: $1.2M", "Traffic impact expected on HWY 6"],
      historicalContext: [],
      likelyQuestions: ["Why was this vendor selected?", "How long will lane closures last?"],
      talkingPoints: ["The project was competitively bid.", "Funds are allocated in the FY26 budget."],
      missingInformation: ["Exact timeline for lane closures"],
      factors: [
        { key: "f1", label: "Financial Impact", description: "Cost exceeding $1M", score: 2 },
        { key: "f2", label: "Public Interest", description: "High traffic area", score: 2 }
      ],
      sourceIds: []
    }
    
    setItems([mockItem as any])
    setSelectedId("mock-1")
    setError(null) 
    toast.success("Loaded demo mock data.")
  }
  // === END DEMO ONLY ===

  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const selectedScore = selected ? scoreFor(selected) : 0
  const selectedPriority = priorityFor(selectedScore)
  const selectedSources = sources.filter((source) => selected?.sourceIds?.includes(source.id))

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
    if (!selected) return
    updateSelected({
      factors: selected.factors.map((factor) =>
        factor.key === key ? { ...factor, score } : factor,
      ),
    })
  }

  // Handle Agenda Upload via FastAPI endpoint
  const processAgenda = async () => {
    if (!agendaFile) {
      toast.error("Choose an agenda PDF or text file first.")
      return
    }
    setProcessing(true)
    try {
      // Send file to FastAPI backend upload endpoint
      await uploadAgendaPdf(agendaFile)
      // Refresh items list from backend after processing
      const updatedAgendas = await fetchAgendas()
      setItems(updatedAgendas)
      if (updatedAgendas.length > 0) {
        setSelectedId(updatedAgendas[0].id)
      }
      setView("meeting")
      setBriefTab("priority")
      setUploadOpen(false)
      toast.success("Agenda packet successfully uploaded and processed by FastAPI.")
    } catch (error) {
      console.error(error)
      toast.error("The file could not be processed by the backend server.")
    } finally {
      setProcessing(false)
    }
  }

  // Handle Source Addition via FastAPI endpoint
  const addSource = async () => {
    if (!sourceFile && !sourceTitle.trim()) {
      toast.error("Add a title or choose a source document.")
      return
    }
    setProcessing(true)
    try {
      const text = sourceFile ? await extractFileText(sourceFile) : ""
      const newSource = {
        title: sourceTitle.trim() || sourceFile?.name || "Untitled source",
        type: sourceFile?.type === "application/pdf" ? "Uploaded PDF" : "Uploaded record",
        date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        url: sourceUrl.trim(),
        excerpt: text.replace(/\s+/g, " ").trim().slice(0, 500) || "No text excerpt was supplied.",
        fileName: sourceFile?.name,
      }

      // Save source via FastAPI endpoint
      const savedSource = await addSourceRecord(newSource)
      setSources((current) => [savedSource, ...current])
      if (selected) {
        updateSelected({ sourceIds: [...selected.sourceIds, savedSource.id] })
      }
      setSourceOpen(false)
      setSourceTitle("")
      setSourceUrl("")
      setSourceFile(null)
      toast.success("Source successfully registered with backend.")
    } catch (error) {
      console.error(error)
      toast.error("The source could not be saved to the backend.")
    } finally {
      setProcessing(false)
    }
  }

  const downloadBriefing = () => {
    if (!selected) return
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
              FastAPI Connected
            </div>
            <p className="text-sm leading-5 text-slate-300">
              Connected to backend API on port 8000.
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
              <p className="text-sm text-slate-500">August 27, 2026 · FastAPI Live Integration</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 print:hidden">
              <Badge variant="outline" className="hidden border-blue-200 bg-blue-50 text-blue-700 sm:inline-flex">
                FastAPI Active
              </Badge>
              <Button variant="outline" onClick={() => setSourceOpen(true)} className="hidden sm:inline-flex">
                <Plus /> Add source
              </Button>
              <Button onClick={() => setUploadOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Upload /> <span className="hidden sm:inline">Upload agenda</span><span className="sm:hidden">Upload</span>
              </Button>
            </div>
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
                    
                    {isLoading && (
                      <div className="flex flex-col items-center justify-center p-10 text-slate-500">
                        <Loader2 className="mb-3 size-6 animate-spin text-blue-600" />
                        <p className="text-sm font-medium">Loading agenda items...</p>
                      </div>
                    )}

                    {error && !isLoading && (
                      <div className="mx-4 my-8 flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
                        <AlertTriangle className="mb-2 size-6" />
                        <p className="font-semibold">Connection Failed</p>
                        <p className="mt-1 text-sm">{error}</p>
                        
                        {/* === TODO: DEMO ONLY - DELETE THIS BUTTON WHEN BACKEND IS CONNECTED === */}
                        <Button 
                          onClick={loadMockData} 
                          variant="outline" 
                          className="mt-4 border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                        >
                          <Sparkles className="mr-2 size-4" /> Load Demo Data
                        </Button>
                        {/* === END DEMO ONLY === */}

                      </div>
                    )}

                    {!isLoading && !error && items.length === 0 && (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                        <p className="font-medium text-slate-700">No agendas found.</p>
                        <p className="mt-1 text-sm">Please upload a sample agenda to begin your review.</p>

                        {/* === TODO: DEMO ONLY - DELETE THIS BUTTON WHEN BACKEND IS CONNECTED === */}
                        <Button 
                          onClick={loadMockData} 
                          variant="outline" 
                          className="mt-4 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          <Sparkles className="mr-2 size-4 text-blue-600" /> Load Demo Data
                        </Button>
                        {/* === END DEMO ONLY === */}

                      </div>
                    )}

                    {!isLoading && !error && filteredItems.map((item) => {
                      const score = scoreFor(item)
                      const priority = priorityFor(score)
                      const active = selected && item.id === selected.id
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
                {selected && !error && !isLoading ? (
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
                            <Sparkles className="size-4" /> Source-grounded draft (FastAPI AI)
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
                            {selected.missingInformation?.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        </div>

                        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 print:hidden">
                          <h3 className="mb-4 text-sm font-semibold text-slate-900">Staff Review & Sign-off</h3>
                          
                          <div className="mb-5">
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Reviewer Comments
                            </label>
                            <Textarea
                              placeholder="Add internal notes, concerns, or requested edits here..."
                              className="min-h-20 resize-y border-slate-200 bg-white text-sm"
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 size-4" /> Print</Button>
                              <Button variant="outline" onClick={downloadBriefing}><Download className="mr-2 size-4" /> Export</Button>
                            </div>
                            
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                                onClick={() => {
                                  updateSelected({ reviewStatus: "Needs review" })
                                  toast.error("Flagged for further review.")
                                }}
                              >
                                Reject / Flag
                              </Button>
                              <Button
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => {
                                  updateSelected({ reviewStatus: "Approved" })
                                  toast.success("Briefing marked as approved!")
                                }}
                              >
                                <Check className="mr-2 size-4" /> Approve Briefing
                              </Button>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="priority" className="p-5 sm:p-6">
                        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-semibold">Transparent rubric</h3>
                            <p className="mt-1 text-sm leading-5 text-slate-500">Adjust the evidence-based factors.</p>
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
                            <p className="mt-1 text-sm text-slate-500">Important claims trace back to approved backend sources.</p>
                          </div>
                          <Button variant="outline" onClick={() => setSourceOpen(true)}><Plus /> Add source</Button>
                        </div>
                        {selectedSources.length > 0 ? (
                          <div className="space-y-3">
                            {selectedSources.map((source) => <SourceCard key={source.id} source={source} />)}
                          </div>
                        ) : (
                          <EmptySection>No supporting sources attached yet.</EmptySection>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : (
                  <EmptySection>
                    {error ? "Backend is currently unavailable." : "Select an agenda item to view its briefing."}
                  </EmptySection>
                )}
              </section>
            </div>
          )}

          {view === "sources" && (
            <section className="mx-auto max-w-6xl">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Evidence library</p>
                  <h2 className="text-2xl font-semibold tracking-tight">Backend sources</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Official public records retrieved from FastAPI.</p>
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">System Evaluation</p>
                <h2 className="text-2xl font-semibold tracking-tight">FastAPI Integration Status</h2>
              </div>
            </section>
          )}
        </main>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a Council agenda</DialogTitle>
            <DialogDescription>Choose a PDF or text file to send to FastAPI.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Upload className="mx-auto mb-3 size-7 text-blue-600" />
            <Input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(event) => setAgendaFile(event.target.files?.[0] ?? null)}
              className="bg-white"
            />
          </div>
          {agendaFile && <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800"><FileText className="size-4" /> {agendaFile.name}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={processAgenda} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing ? <Loader2 className="animate-spin" /> : <FileSearch />}
              Upload to FastAPI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add supporting source</DialogTitle>
            <DialogDescription>Attach a public record to the backend.</DialogDescription>
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

function BriefingList({ title, icon: Icon, items, empty = "No information available." }: { title: string; icon: React.ComponentType<{ className?: string }>; items: string[]; empty?: string }) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-4 text-blue-600" /> {title}</h3>
      {items && items.length > 0 ? (
        <ul className="space-y-2.5 text-sm leading-6 text-slate-700">
          {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-500" /> <span>{item}</span></li>)}
        </ul>
      ) : <EmptySection>{empty}</EmptySection>}
    </div>
  )
}

function EditableList({ title, icon: Icon, items, onChange }: { title: string; icon: React.ComponentType<{ className?: string }>; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-4 text-blue-600" /> {title}</h3>
      <Textarea
        value={items ? items.join("\n") : ""}
        onChange={(event) => onChange(event.target.value.split("\n").filter(Boolean))}
        className="min-h-40 resize-y leading-6"
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
            <a href={source.url} target="_blank" rel="noreferrer"><ExternalLink /></a>
          </Button>
        )}
      </div>
      <p className={`mt-3 text-sm leading-6 text-slate-600 ${expanded ? "" : "line-clamp-3"}`}>{source.excerpt}</p>
      {source.fileName && <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><FileText className="size-3.5" /> {source.fileName}</p>}
    </div>
  )
}