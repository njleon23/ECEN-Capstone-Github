// App.tsx
//
// The main screen of the Council Brief website. It holds all of the page's data ("state") and lays out:
//   - the left sidebar (navigation + backend connection status)
//   - the top header (meeting name/date + Sign in, Add source, Analyze, Upload buttons)
//   - three views: Meeting workspace, Source library, Evaluation
//   - the pop-up dialogs (sign in, upload agenda, add source)
//
// Talking to the backend happens in other files:
//   api.ts          -> agendas, sources, error handling
//   analysisApi.ts  -> running analyses, follow-up questions, reviews, adjustments
// Pieces of the screen that live in their own files:
//   BriefingParts.tsx  -> Key facts / Concerns / Likely questions / Talking points lists
//   EvaluationView.tsx -> the Evaluation page
//   FollowUpBox.tsx    -> "Ask a follow-up question"
//   ReviewPanels.tsx   -> review history, factor adjuster, attach-source picker (Quan's Package 2)

// ---- Imports ------------------------------------------------------------------------------------

// React hooks: useState stores data, useEffect runs code when something changes, useMemo caches a calculation.
import { useMemo, useState, useEffect } from "react"
// URL of the PDF.js worker script, used to read text out of uploaded PDF sources.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
// Icons (lucide-react icon library).
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
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
  Lock,
  LogIn,
  LogOut,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react"
// toast() shows the small pop-up messages in the top-right corner ("Analysis complete", errors...).
import { toast } from "sonner"

// Reusable UI building blocks (buttons, inputs, dialogs, tabs...) from src/components/ui.
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"

// Our own frontend files (see the list at the top of this file).
import { fetchAgendas, uploadAgendaPdf, fetchSources, addSourceRecord, formatMeetingDate, API_BASE_URL, ApiError, readErrorMessage } from "./api"
import { ClaimList, QuestionList } from "./BriefingParts"
import { EvaluationView } from "./EvaluationView"
import { AgendaItem, SourceRecord } from "./api"
import {
  analyzeItem, attachSource, categoryLabel, detachSource, listAdjustments, listAttachedSourceIds, restoreSavedItem,
  saveAdjustment, saveBriefingReview, scoreLabel, setSourceApproval, withAnalysisDefaults, writerLabel,
} from "./analysisApi"
import type { AdjustmentRecord, ReviewRecord } from "./analysisApi"
import { FollowUpBox } from "./FollowUpBox"
import { appendFor, commentKey, factorControlKey, removeKey, setFor } from "./itemScoped"
import type { ByItem } from "./itemScoped"
import { AdjustmentHistory, AttachPicker, FactorAdjuster, ReviewHistory } from "./ReviewPanels"

// ---- Types and settings used by the screen -------------------------------------------------------

// Which page is showing (chosen in the left sidebar).
type View = "meeting" | "sources" | "evaluation"
// How the agenda item list is ordered: as on the agenda, or highest priority first.
type SortOrder = "agenda" | "priority"
// Which filter button is selected above the agenda item list.
type ItemFilter = "all" | "not-analyzed" | "needs-review" | "approved"

// Used when sorting by priority: lower number = shown higher. Unscored items get 3 (shown last).
const PRIORITY_RANK: Record<string, number> = { High: 0, Moderate: 1, Low: 2 }

// The filter buttons above the agenda item list. Each has an id, the button text, and a
// `matches` function that decides whether an item is shown while that filter is selected.
const ITEM_FILTERS: Array<{ id: ItemFilter; label: string; matches: (item: any) => boolean }> = [
  { id: "all", label: "All", matches: () => true },
  { id: "not-analyzed", label: "Not analyzed", matches: (item) => !item.analysisState || item.analysisState === "idle" },
  { id: "needs-review", label: "Needs review", matches: (item) => item.reviewStatus !== "Approved" },
  { id: "approved", label: "Approved", matches: (item) => item.reviewStatus === "Approved" },
]

/**
 * Adds the saved analysis, briefing and review status to each item, so results are still there after a refresh.
 * Items with nothing saved keep their defaults. A failed lookup never blocks the page.
 */
async function hydrate(list: AgendaItem[]): Promise<any[]> {
  const restored = await Promise.all(list.map((item) => restoreSavedItem(item.id)))
  return list.map((item, index) => {
    const base = withAnalysisDefaults(item)
    const saved = restored[index]
    if (!saved) return base
    return { ...base, ...saved.fields, ...(saved.reviewStatus ? { reviewStatus: saved.reviewStatus } : {}) }
  })
}

// ---- Small helpers ----------------------------------------------------------------------------------

// Badge colors for a priority category: High = red, Moderate = amber, Low = green, anything else = gray.
function priorityStyle(priority: string | null) {
  if (priority === "High") return "border-rose-200 bg-rose-50 text-rose-700"
  if (priority === "Moderate") return "border-amber-200 bg-amber-50 text-amber-700"
  if (priority === "Low") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

// Badge colors for a review status: Approved = green, Needs review = blue.
function statusStyle(status: AgendaItem["reviewStatus"]) {
  if (status === "Approved") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "Needs review") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-600"
}

// Reads the text out of an uploaded source file in the browser. PDFs are read page by page with PDF.js;
// .txt/.md files are read directly. Used by "Add source" to save a text excerpt with the source.
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

// Dashed gray box used for "nothing here yet" messages.
function EmptySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
      {children}
    </div>
  )
}

// ==================================================================================================
// The App component: everything below is the main screen.
// ==================================================================================================
export default function App() {
  // ---- State: the data this screen remembers. Calling a set...() function updates it and redraws the page. ----

  // Data loaded from the backend.
  const [items, setItems] = useState<any[]>([])                       // every agenda item (plus analysis results)
  const [isLoading, setIsLoading] = useState(true)                    // true while the first load is running
  const [error, setError] = useState<string | null>(null)             // set when the backend can't be reached
  const [sources, setSources] = useState<SourceRecord[]>([])          // every source in the Source Library

  // What the user is currently looking at.
  const [selectedId, setSelectedId] = useState<string>("")            // id of the agenda item that is open
  const [view, setView] = useState<View>("meeting")                   // which sidebar page is showing
  const [briefTab, setBriefTab] = useState("briefing")                // Briefing / Priority factors / Evidence tab
  const [query, setQuery] = useState("")                              // text typed in "Search agenda items"
  const [sortOrder, setSortOrder] = useState<SortOrder>("agenda")     // the sort dropdown above the item list
  const [itemFilter, setItemFilter] = useState<ItemFilter>("all")     // the filter buttons above the item list

  // Sign-in. The token is the proof of sign-in sent with every protected request. It is kept only in
  // memory (not saved in the browser), so refreshing the page signs the user out.
  const [token, setToken] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)                   // is the Sign in dialog open?
  const [loginUser, setLoginUser] = useState("")                      // username typed in the dialog
  const [loginPass, setLoginPass] = useState("")                      // password typed in the dialog
  const [loginLoading, setLoginLoading] = useState(false)             // true while signing in

  // Dialogs and busy indicators.
  const [uploadOpen, setUploadOpen] = useState(false)                 // is the Upload agenda dialog open?
  const [sourceOpen, setSourceOpen] = useState(false)                 // is the Add source dialog open?
  const [processing, setProcessing] = useState(false)                 // true while uploading an agenda or source
  const [analyzing, setAnalyzing] = useState(false)                   // true while "Analyze this item" runs
  // Unsaved comments, loaded histories and in-flight saves are all kept per item, so switching items while
  // something is still saving or loading can never show or submit one item's data under another.
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({})
  const [reviewsByItem, setReviewsByItem] = useState<ByItem<ReviewRecord[]>>({})
  const [adjustmentsByItem, setAdjustmentsByItem] = useState<ByItem<AdjustmentRecord[]>>({})
  const [savingReviewFor, setSavingReviewFor] = useState<string[]>([])
  // What the user has typed or chosen in the Upload agenda / Add source dialogs.
  const [agendaFile, setAgendaFile] = useState<File | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceTitle, setSourceTitle] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")

  // ---- First load: when the page opens, fetch agendas and sources from the backend ----
  // The empty [] at the end means "run once, when the page first appears".
  useEffect(() => {
    async function loadBackendData() {
      setIsLoading(true)
      setError(null)
      try {
        const [agendaData, sourceData] = await Promise.all([fetchAgendas(), fetchSources()])
        if (agendaData && agendaData.length > 0) {
          setItems(await hydrate(agendaData))
          setSelectedId(agendaData[0].id)
        }
        if (sourceData) {
          setSources(sourceData)
        }
      } catch (err) {
        console.error("Failed to connect to FastAPI backend:", err)
        setError("Could not connect to the backend database. The Python server may be offline.")
        toast.error("Could not connect to FastAPI backend.")
      } finally {
        setIsLoading(false)
      }
    }
    loadBackendData()
  }, [])

  // ---- Sign-in, sign-out and error handling ----------------------------------------------------------

  // Shared error handler for actions that need sign-in.
  // 401 = session expired -> sign out and reopen the Sign in dialog. 429 = too many requests -> ask to wait.
  // Anything else -> show the error message as a red toast.
  const handleProtectedActionError = (error: unknown, fallbackMsg: string) => {
    if (error instanceof ApiError && error.status === 401) {
      setToken(null)
      setLoginOpen(true)
      toast.error("Your session has expired. Please sign in again.")
      return
    }
    if (error instanceof ApiError && error.status === 429) {
      toast.error(error.message || "Too many requests. Please wait a moment and try again.")
      return
    }
    toast.error(error instanceof Error ? error.message : fallbackMsg)
  }

  // Runs when the Sign in form is submitted: sends the username and password to the backend
  // and keeps the returned access token.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      })
      
      if (!res.ok) {
        const errorMsg = await readErrorMessage(res, "Login failed. Please check your credentials.")
        if (res.status === 401) {
          setToken(null)
          setLoginOpen(true)
        }
        throw new Error(errorMsg)
      }
      
      const data = await res.json()
      setToken(data.access_token)
      setLoginOpen(false)
      setLoginUser("")
      setLoginPass("")
      toast.success("Successfully logged in.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setLoginLoading(false)
    }
  }

  // Signs out: tells the backend to end the session, then forgets the token either way.
  const handleLogout = async () => {
    if (token) {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (!res.ok) {
          toast.warning(
            res.status === 401
              ? "Your session had already expired. You are signed out."
              : "Signed out on this device, but the server did not confirm the logout."
          )
          setToken(null)
          return
        }
      } catch (err) {
        console.error("Logout request failed", err)
        toast.warning("Signed out on this device, but the server did not confirm the logout.")
        setToken(null)
        return
      }
    }
    setToken(null)
    toast.success("Logged out successfully.")
  }

  // Called at the start of every protected action. If not signed in, opens the Sign in dialog and returns false.
  const checkAuth = () => {
    if (!token) {
      setLoginOpen(true)
      toast.error("Please sign in to perform this action.")
      return false
    }
    return true
  }

  // ---- Values worked out from the state (recalculated every time the page redraws) --------------------

  // The open agenda item (falls back to the first item), and its attached / not-attached sources.
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const selectedSources = sources.filter((source) => selected?.sourceIds?.includes(source.id))
  const unattachedSources = sources.filter((source) => !selected?.sourceIds?.includes(source.id))
  // "Real" items come from the backend; ids starting with "mock" are local demo data that can't be saved.
  const isReal = Boolean(selected) && !String(selected.id).startsWith("mock")
  // Review history, adjustment history and the unsaved reviewer comment for the open item.
  const reviews =(selected && reviewsByItem[selected.id]) || []
  const adjustments = (selected && adjustmentsByItem[selected.id]) || []
  const reviewKey = selected ? commentKey(selected.id, selected.briefingId) : ""
  const reviewComment = reviewDrafts[reviewKey] ?? ""
  const savingReview = Boolean(selected) && savingReviewFor.includes(selected.id)
  const factorLabels: Record<string, string> = Object.fromEntries((selected?.priority?.factors ?? []).map((f: any) => [f.key, f.label]))

  // When an item is opened, load what is saved for it: attached sources, review history and adjustments.
  useEffect(() => {
    if (!selectedId || selectedId.startsWith("mock")) return
    let cancelled = false
    ;(async () => {
      const [ids, adjustmentList, saved] = await Promise.all([
        listAttachedSourceIds(selectedId).catch(() => null),
        listAdjustments(selectedId).catch(() => [] as AdjustmentRecord[]),
        restoreSavedItem(selectedId),
      ])
      if (cancelled) return
      setAdjustmentsByItem((current) => setFor(current, selectedId, adjustmentList))
      setReviewsByItem((current) => setFor(current, selectedId, saved?.reviews ?? []))
      if (ids) setItems((current) => current.map((item) => (item.id === selectedId ? { ...item, sourceIds: ids } : item)))
    })()
    return () => { cancelled = true }
  }, [selectedId])

  // The agenda items shown in the left list after applying the search box, the filter buttons and the sort
  // dropdown. useMemo only recalculates this when one of the values in the [...] list at the end changes.
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    // The `matches` function of the selected filter button (see ITEM_FILTERS near the top of the file).
    const matchesFilter = ITEM_FILTERS.find((f) => f.id === itemFilter)?.matches ?? (() => true)
    // Keep items that pass the filter AND contain the search text (if any) in their number, title or department.
    const visible = items.filter((item) =>
      matchesFilter(item) &&
      (!normalized || `${item.number} ${item.title} ${item.department}`.toLowerCase().includes(normalized)),
    )
    if (sortOrder === "agenda") return visible
    // Highest priority first (High, Moderate, Low, then unscored); within the same category, higher score first.
    // Items that are still tied keep their agenda order (Array.sort is stable).
    return [...visible].sort((a, b) =>
      (PRIORITY_RANK[a.category] ?? 3) - (PRIORITY_RANK[b.category] ?? 3) || (b.score ?? -1) - (a.score ?? -1),
    )
  }, [items, query, itemFilter, sortOrder])

  // The header shows the meeting of the item being viewed, as parsed from its agenda by the backend.
  // If the agenda had no title, it falls back to "College Station City Council".
  // meetingDate is null when the agenda had no date; the header then says so instead of showing a wrong date.
  const meetingItem = selected ?? items[0]
  const meetingTitle = meetingItem?.meetingTitle || "College Station City Council"
  const meetingDate = formatMeetingDate(meetingItem?.meetingDate)

  // ---- Actions (run when the user clicks a button) ---------------------------------------------------

  // Changes some fields of one agenda item in the list, for example its review status.
  const updateItem = (itemId: string, update: Partial<any>) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...update } : item)),
    )
  }

  const updateSelected = (update: Partial<any>) => updateItem(selected.id, update)

  // "Analyze this item": asks the backend to score and brief the open item, waits for the result,
  // then reloads the item's saved review history and adjustments.
  const runAnalysisForSelected = async () => {
    if (!checkAuth()) return;
    if (!selected || analyzing) return
    const itemId = selected.id
    setAnalyzing(true)
    try {
      const result = await analyzeItem(itemId, token)
      setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...result } : item)))
      if (result.analysisState === "failed") toast.error("This item could not be analyzed. See Verification needed below.")
      else if (result.analysisState === "degraded") toast.warning("The analysis finished with a problem. See Verification needed below.")
      else toast.success("Analysis complete. Review the draft before use.")
      const saved = await restoreSavedItem(itemId)
      const adjustmentList = await listAdjustments(itemId).catch(() => [] as AdjustmentRecord[])
      setReviewsByItem((current) => setFor(current, itemId, saved?.reviews ?? []))
      setAdjustmentsByItem((current) => setFor(current, itemId, adjustmentList))
      if (saved) setItems((current) => current.map((item) => (item.id === itemId ? { ...item, reviewStatus: saved.reviewStatus ?? "Needs review" } : item)))
    } catch (error) {
      handleProtectedActionError(error, "Failed to run analysis. Check permissions.")
    } finally {
      setAnalyzing(false)
    }
  }

  // "Approve source" / "Withdraw approval": only approved sources are used by the analysis.
  const toggleApproval = async (source: SourceRecord) => {
    if (!checkAuth()) return;
    const next = !source.approved
    try {
      await setSourceApproval(source.id, next, token)
      setSources((current) => current.map((s) => (s.id === source.id ? { ...s, approved: next } : s)))
      toast.success(next ? "Source approved. Run the analysis again to use it." : "Source approval withdrawn.")
    } catch (error) {
      handleProtectedActionError(error, "The approval could not be saved.")
    }
  }

  // Evidence tab: link an existing source to the open item (saved on the backend).
  const attachToSelected = async (source: SourceRecord) => {
    if (!selected || !checkAuth()) return
    try {
      await attachSource(selected.id, source.id, token)
      updateSelected({ sourceIds: [...(selected.sourceIds ?? []), source.id] })
      toast.success(source.approved ? "Source attached. Run the analysis again to use it." : "Source attached. It is not approved yet, so it will not be used until it is.")
    } catch (err) {
      handleProtectedActionError(err, "The source could not be attached.")
    }
  }

  // Evidence tab: "Detach from this item" (the source stays in the library).
  const detachFromSelected = async (source: SourceRecord) => {
    if (!selected || !checkAuth()) return
    try {
      await detachSource(selected.id, source.id, token)
      updateSelected({ sourceIds: (selected.sourceIds ?? []).filter((id: string) => id !== source.id) })
      toast.success("Source detached from this item.")
    } catch (err) {
      handleProtectedActionError(err, "The source could not be detached.")
    }
  }

  // "Approve Briefing" / "Reject / Flag": saves the decision and the reviewer comment on the backend
  // under the signed-in account, then adds it to the review history.
  const submitReview = async (status: "approved" | "rejected") => {
    if (!checkAuth()) return
    if (!selected?.briefingId) {
      toast.error("Analyze this item first, so there is a briefing to review.")
      return
    }
    // Everything this save needs is read now. The reviewer may open another item before it finishes.
    const itemId = selected.id
    const briefingId = selected.briefingId
    const key = commentKey(itemId, briefingId)
    const comment = reviewComment.trim()
    setSavingReviewFor((current) => [...current, itemId])
    try {
      const saved = await saveBriefingReview(briefingId, status, comment, token)
      setReviewsByItem((current) => appendFor(current, itemId, saved))
      updateItem(itemId, { reviewStatus: status === "approved" ? "Approved" : "Needs review" })
      setReviewDrafts((current) => removeKey(current, key))
      if (status === "approved") toast.success("Review saved: briefing approved.")
      else toast.error("Review saved: flagged for further review.")
    } catch (err) {
      handleProtectedActionError(err, "The review could not be saved.")
    } finally {
      setSavingReviewFor((current) => current.filter((id) => id !== itemId))
    }
  }

  // Priority factors tab: saves a reviewer's change to one factor (a reason is required), then reloads
  // the item's score and adjustment history from the backend.
  const submitAdjustment = async (itemId: string, factorKey: string, newRawValue: number, reason: string) => {
    if (!checkAuth()) throw new Error("Sign in to adjust a factor.")
    try {
      if (!reason.trim()) throw new Error("A reason is required to adjust a factor.")
      await saveAdjustment(itemId, factorKey, newRawValue, reason.trim(), token)
      const saved = await restoreSavedItem(itemId)
      if (saved) updateItem(itemId, saved.fields)
      const adjustmentList = await listAdjustments(itemId)
      setAdjustmentsByItem((current) => setFor(current, itemId, adjustmentList))
      toast.success("Adjustment saved under your account, with your reason.")
    } catch (err) {
      handleProtectedActionError(err, "The adjustment could not be saved.")
      throw err
    }
  }

  // Upload agenda dialog: sends the file to the backend, which splits it into agenda items,
  // then reloads the full item list.
  const processAgenda = async () => {
    if (!checkAuth()) return;
    if (!agendaFile) {
      toast.error("Choose an agenda PDF or text file first.")
      return
    }
    setProcessing(true)
    try {
      await uploadAgendaPdf(agendaFile, token)
      const updatedAgendas = await fetchAgendas()
      setItems(await hydrate(updatedAgendas))
      if (updatedAgendas.length > 0) {
        setSelectedId(updatedAgendas[0].id)
      }
      setView("meeting")
      setBriefTab("priority")
      setUploadOpen(false)
      toast.success("Agenda packet successfully uploaded and processed by FastAPI.")
    } catch (error) {
      console.error(error)
      handleProtectedActionError(error, "The file could not be processed. Please check permissions.")
    } finally {
      setProcessing(false)
    }
  }

  // Add source dialog: reads the file's text (first 500 characters become the excerpt), saves the source on
  // the backend, and attaches it to the open item. New sources start as "Not approved".
  const addSource = async () => {
    if (!checkAuth()) return;
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

      const savedSource = await addSourceRecord(newSource, token)
      setSources((current) => [savedSource, ...current])
      if (selected) {
        if (isReal) {
          try {
            await attachSource(selected.id, savedSource.id, token)
            updateSelected({ sourceIds: [...(selected.sourceIds ?? []), savedSource.id] })
          } catch {
            toast.error("The source was saved but could not be attached to this item. Attach it from the Evidence tab.")
          }
        } else {
          updateSelected({ sourceIds: [...(selected.sourceIds ?? []), savedSource.id] })
        }
      }
      setSourceOpen(false)
      setSourceTitle("")
      setSourceUrl("")
      setSourceFile(null)
      toast.success("Source successfully registered with backend.")
    } catch (error) {
      console.error(error)
      handleProtectedActionError(error, "The source could not be saved to the backend.")
    } finally {
      setProcessing(false)
    }
  }

  // "Export" button: downloads the open item's briefing, priority and sources as a .json file.
  const downloadBriefing = () => {
    if (!selected) return
    const payload = {
      meeting: [meetingTitle, meetingDate].filter(Boolean).join(" — "),
      agendaItem: selected,
      preparationPriority: { score: selected.score, category: selected.category },
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

  // ==================================================================================================
  // What appears on the screen. Everything below is JSX (HTML-like markup); {curly braces} insert JavaScript.
  // `className` values are Tailwind CSS classes that set layout, spacing and colors.
  // ==================================================================================================
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      {/* Where toast pop-up messages appear. */}
      <Toaster position="top-right" richColors />

      {/* ===== LEFT SIDEBAR (only on large screens; hidden when printing) ===== */}
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

        {/* Navigation: one button per page. Clicking sets `view`, which decides what <main> shows below. */}
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
          {/* Backend connection status. Three states: still loading -> "Connecting…",
              load failed -> "Backend offline", load worked -> "Backend connected" with item and source counts.
              role="status" lets screen readers announce changes. */}
          <div className="rounded-xl bg-white/8 p-4" role="status">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">
                <Loader2 className="size-4 animate-spin" /> Connecting…
              </div>
            ) : error ? (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-300">
                  <ShieldAlert className="size-4" /> Backend offline
                </div>
                <p className="text-sm leading-5 text-slate-300">The backend could not be reached. Start it, then refresh.</p>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">
                  <ShieldCheck className="size-4" /> Backend connected
                </div>
                <p className="text-sm leading-5 text-slate-300">
                  {items.length} agenda item{items.length === 1 ? "" : "s"} · {sources.length} source{sources.length === 1 ? "" : "s"}
                </p>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Everything to the right of the sidebar. */}
      <div className="lg:pl-[248px]">
        {/* ===== TOP HEADER: meeting name and date on the left, action buttons on the right ===== */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:static">
          <div className="flex min-h-20 items-center justify-between gap-4 px-4 py-3 sm:px-7 xl:px-10">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 lg:hidden">
                <Landmark className="size-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Council Brief</span>
              </div>
              {/* Meeting title and date come from the uploaded agenda (see meetingTitle / meetingDate above). */}
              <h2 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                {meetingTitle}
              </h2>
              <p className="text-sm text-slate-500">{meetingDate ?? (items.length ? "Meeting date not listed on the agenda" : "No agenda loaded")}</p>
            </div>
            {/* Header buttons. "Sign in" turns into "Sign out" once a token exists. Add source and Upload
                agenda first check sign-in (checkAuth) and open their dialog only if signed in. */}
            <div className="flex shrink-0 items-center gap-2 print:hidden">
              {token ? (
                <Button variant="ghost" onClick={handleLogout} className="hidden sm:inline-flex text-slate-600">
                  <LogOut className="mr-2 size-4" /> Sign out
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setLoginOpen(true)} className="hidden sm:inline-flex text-slate-600">
                  <LogIn className="mr-2 size-4" /> Sign in
                </Button>
              )}
              
              <Button variant="outline" onClick={() => { if(checkAuth()) setSourceOpen(true); }} className="hidden sm:inline-flex">
                <Plus /> Add source
              </Button>
              <Button variant="outline" onClick={runAnalysisForSelected} disabled={analyzing || !selected}>
                {analyzing ? <Loader2 className="animate-spin" /> : <Sparkles />} {analyzing ? "Analyzing…" : "Analyze this item"}
              </Button>
              <Button onClick={() => { if(checkAuth()) setUploadOpen(true); }} className="bg-blue-600 hover:bg-blue-700">
                <Upload /> <span className="hidden sm:inline">Upload agenda</span><span className="sm:hidden">Upload</span>
              </Button>
            </div>
          </div>
        </header>

        {/* ===== MAIN AREA: shows one of the three pages depending on `view` ===== */}
        <main className="px-4 py-6 sm:px-7 xl:px-10">
          {/* ===== PAGE 1: MEETING WORKSPACE — item list on the left, the open item's briefing on the right ===== */}
          {view === "meeting" && (
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              {/* ----- Left column: summary counts, search, filters and the agenda item list ----- */}
              <section className="print:hidden">
                {/* Three small count cards above the list. */}
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {[
                    { label: "Agenda items", value: items.length },
                    { label: "High priority", value: items.filter((item) => item.category === "High").length },
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
                    {/* Filter buttons (All / Not analyzed / Needs review / Approved) and the sort dropdown.
                        aria-pressed tells screen readers which filter is on. */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter agenda items">
                        {ITEM_FILTERS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setItemFilter(f.id)}
                            aria-pressed={itemFilter === f.id}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                              itemFilter === f.id
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <select
                        value={sortOrder}
                        onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                        aria-label="Sort agenda items"
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="agenda">Agenda order</option>
                        <option value="priority">Highest priority first</option>
                      </select>
                    </div>
                  </div>
                  {/* The scrollable item list. Only one of these messages shows at a time:
                      loading, connection failed, no agendas, nothing matches the filter, or the list itself. */}
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
                      </div>
                    )}

                    {!isLoading && !error && items.length === 0 && (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                        <p className="font-medium text-slate-700">No agendas found.</p>
                        <p className="mt-1 text-sm">Please upload a sample agenda to begin your review.</p>
                      </div>
                    )}

                    {!isLoading && !error && items.length > 0 && filteredItems.length === 0 && (
                      <p className="p-6 text-center text-sm text-slate-500">No agenda items match this search or filter.</p>
                    )}

                    {/* One clickable card per agenda item. Clicking opens it on the right. */}
                    {!isLoading && !error && filteredItems.map((item) => {
                      const active = selected && item.id === selected.id
                      const displayScore = scoreLabel(item)
                      
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
                            <Badge variant="outline" className={priorityStyle(item.category)}>{categoryLabel(item)} · {displayScore}</Badge>
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

              {/* ----- Right column: the open agenda item ----- */}
              <section className="min-w-0">
                {selected && !error && !isLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {/* Item heading: number, review status, title, and the colored preparation-priority box. */}
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
                        <div className={`min-w-fit shrink-0 rounded-xl border px-4 py-3 ${priorityStyle(selected.category)}`}>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs font-semibold uppercase tracking-[0.12em]">Preparation priority</span>
                            <CircleGauge className="size-4" />
                          </div>
                          <div className="mt-1 flex items-end gap-2">
                            <span className="text-2xl font-bold">{categoryLabel(selected)}</span>
                            <span className="pb-0.5 text-sm font-semibold">{scoreLabel(selected)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Three tabs: Briefing, Priority factors, Evidence. `briefTab` remembers which is open. */}
                    <Tabs value={briefTab} onValueChange={setBriefTab} className="gap-0">
                      <div className="overflow-x-auto border-b border-slate-100 px-5 sm:px-6 print:hidden">
                        <TabsList variant="line" className="h-12 gap-5">
                          <TabsTrigger value="briefing">Briefing</TabsTrigger>
                          <TabsTrigger value="priority">Priority factors</TabsTrigger>
                          <TabsTrigger value="evidence">Evidence <span className="rounded-full bg-slate-100 px-1.5 text-[0.7rem]">{selectedSources.length}</span></TabsTrigger>
                        </TabsList>
                      </div>

                      {/* ===== TAB 1: BRIEFING ===== */}
                      <TabsContent value="briefing" className="p-5 sm:p-6">
                        {/* Summary box. The label says which writer produced it (rule-based stand-in or AI model).
                            The text can be edited here, but edits are not saved to the backend. */}
                        <div className="mb-6 rounded-xl border-l-4 border-blue-600 bg-blue-50/70 p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                            <Sparkles className="size-4" /> {writerLabel(selected.modelId)}
                          </div>
                          <Textarea
                            value={selected.summary}
                            onChange={(event) => updateSelected({ summary: event.target.value })}
                            className="min-h-28 resize-y border-blue-100 bg-white/80 leading-6"
                            aria-label="Editable agenda item summary"
                          />
                        </div>

                        {/* The four briefing sections in a 2x2 grid (one column on small screens).
                            These components are in BriefingParts.tsx. */}
                        <div className="grid gap-6 lg:grid-cols-2">
                          <ClaimList title="Key facts" icon={CheckCircle2} items={selected.key_facts} />
                          <ClaimList title="Concerns to check" icon={ShieldAlert} items={selected.concerns} empty="No concerns were raised from the approved sources." />
                          <QuestionList title="Likely questions" icon={FileSearch} items={selected.anticipated_questions} />
                          <ClaimList title="Suggested talking points" icon={ListChecks} items={selected.talking_points} />
                        </div>

                        {/* Yellow "Verification needed" box: warnings from the analysis (weak evidence, which writer
                            was used, errors...). The list is built in analysisApi.ts (jobToFields). */}
                        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
                            <AlertTriangle className="size-4" /> Verification needed
                          </div>
                          <ul className="space-y-1.5 text-sm leading-5 text-amber-900/80">
                            {selected.missingInformation?.map((item: string) => <li key={item}>{item}</li>)}
                          </ul>
                        </div>

                        {/* "Ask a follow-up question" (FollowUpBox.tsx). key={selected.id} gives each item a fresh box,
                            so one item's questions never show under another. */}
                        {!String(selected.id).startsWith("mock") && <div className="mt-6"><FollowUpBox key={selected.id} itemId={selected.id} token={token} onApiError={handleProtectedActionError} /></div>}

                        {/* Staff Review & Sign-off: reviewer comment, Print/Export, Reject/Approve, and the review history. */}
                        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 print:hidden">
                          <h3 className="mb-4 text-sm font-semibold text-slate-900">Staff Review & Sign-off</h3>
                          
                          <div className="mb-5">
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Reviewer Comments
                            </label>
                            <Textarea
                              value={reviewComment}
                              onChange={(event) => setReviewDrafts((current) => ({ ...current, [reviewKey]: event.target.value }))}
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
                                disabled={savingReview}
                                onClick={() => {
                                  if (!checkAuth()) return
                                  if (isReal) submitReview("rejected")
                                  else {
                                    updateSelected({ reviewStatus: "Needs review" })
                                    toast.error("Flagged for further review.")
                                  }
                                }}
                              >
                                Reject / Flag
                              </Button>
                              <Button
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={savingReview}
                                onClick={() => {
                                  if (!checkAuth()) return
                                  if (isReal) submitReview("approved")
                                  else {
                                    updateSelected({ reviewStatus: "Approved" })
                                    toast.success("Briefing marked as approved!")
                                  }
                                }}
                              >
                                <Check className="mr-2 size-4" /> Approve Briefing
                              </Button>
                            </div>
                          </div>
                          {isReal && <ReviewHistory reviews={reviews} />}
                        </div>
                      </TabsContent>

                      {/* ===== TAB 2: PRIORITY FACTORS — the score breakdown, the factor adjuster and adjustment history
                          (FactorAdjuster and AdjustmentHistory are in ReviewPanels.tsx) ===== */}
                      <TabsContent value="priority" className="p-5 sm:p-6">
                        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-semibold">Transparent rubric</h3>
                            <p className="mt-1 text-sm leading-5 text-slate-500">
                              {isReal ? "A reviewer can change one factor. A reason is required, and the change is saved under your account name." : "Adjust the evidence-based factors."}
                            </p>
                          </div>
                          <div className="min-w-44">
                            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                              <span>{categoryLabel(selected)}</span><span>{scoreLabel(selected)}</span>
                            </div>
                            <Progress value={(selected.score || 0) * 10} className="bg-slate-200 [&_[data-slot=progress-indicator]]:bg-blue-600" />
                          </div>
                        </div>

                        <div className="space-y-4">
                          {selected.priority?.factors?.map((factor: any) => (
                            <div key={factor.key} className="rounded-xl border border-slate-200 p-4">
                              <div className="mb-4 flex items-start justify-between gap-5">
                                <div>
                                  <h4 className="font-semibold">{factor.label}</h4>
                                  <p className="mt-1 text-sm leading-5 text-slate-500">{factor.explanation}</p>
                                </div>
                                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#0b1f33] text-sm font-bold text-white">{factor.points}</div>
                              </div>
                              <FactorAdjuster
                                key={factorControlKey(selected.id, selected.jobId, factor.key)}
                                factor={factor}
                                canAdjust={isReal && selected.score != null && !selected.procedural}
                                onSave={(factorKey, newRawValue, reason) => submitAdjustment(selected.id, factorKey, newRawValue, reason)}
                              />
                            </div>
                          ))}
                        </div>
                        {isReal && <AdjustmentHistory adjustments={adjustments} labels={factorLabels} />}
                      </TabsContent>

                      {/* ===== TAB 3: EVIDENCE — sources attached to this item, plus a picker to attach more ===== */}
                      <TabsContent value="evidence" className="p-5 sm:p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">Supporting evidence</h3>
                            <p className="mt-1 text-sm text-slate-500">Important claims trace back to approved backend sources.</p>
                          </div>
                          <Button variant="outline" onClick={() => { if (checkAuth()) setSourceOpen(true) }}><Plus /> Add source</Button>
                        </div>
                        {selectedSources.length > 0 ? (
                          <div className="space-y-3">
                            {selectedSources.map((source) => <SourceCard key={source.id} source={source} onToggleApproval={toggleApproval} onDetach={isReal ? detachFromSelected : undefined} />)}
                          </div>
                        ) : (
                          <EmptySection>No sources are attached to this item yet. Only approved sources attached to an item are used in its analysis.</EmptySection>
                        )}
                        {isReal && <AttachPicker available={unattachedSources} onAttach={attachToSelected} />}
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

          {/* ===== PAGE 2: SOURCE LIBRARY — every source, with Approve / Withdraw approval buttons ===== */}
          {view === "sources" && (
            <section className="mx-auto max-w-6xl">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Evidence library</p>
                  <h2 className="text-2xl font-semibold tracking-tight">Backend sources</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Official public records retrieved from FastAPI.</p>
                </div>
                <Button onClick={() => { if(checkAuth()) setSourceOpen(true); }} className="bg-blue-600 hover:bg-blue-700"><Plus /> Add source</Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {sources.map((source) => <SourceCard key={source.id} source={source} expanded onToggleApproval={toggleApproval} />)}
              </div>
            </section>
          )}

          {/* ===== PAGE 3: EVALUATION — summary numbers and charts (EvaluationView.tsx) ===== */}
          {view === "evaluation" && <EvaluationView items={items} sources={sources} />}
        </main>
      </div>

      {/* ===== POP-UP DIALOGS. Each is hidden until its `...Open` state is true. ===== */}

      {/* Sign in dialog: username + password form; submitting runs handleLogin. */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-5 text-blue-600" /> Staff Sign In
            </DialogTitle>
            <DialogDescription>
              Authentication is required to perform administrative actions.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleLogin} className="space-y-5 py-4">
            <label className="block space-y-2 text-sm font-medium">
              Username
              <Input 
                value={loginUser} 
                onChange={(e) => setLoginUser(e.target.value)} 
                placeholder="Enter username" 
                required 
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Password
              <Input 
                type="password" 
                value={loginPass} 
                onChange={(e) => setLoginPass(e.target.value)} 
                placeholder="••••••••" 
                required 
              />
            </label>
            
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setLoginOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loginLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                {loginLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogIn className="mr-2 size-4" />}
                Sign In
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upload agenda dialog: choose a file, then "Upload to FastAPI" runs processAgenda. */}
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
            <Button onClick={processAgenda} disabled={processing} className="bg-blue-600 hover:bg-blue-700 text-white">
              {processing ? <Loader2 className="animate-spin" /> : <FileSearch className="mr-2 size-4" />}
              Upload to FastAPI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add source dialog: title, optional URL, optional file; "Attach source" runs addSource. */}
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
            <Button onClick={addSource} disabled={processing} className="bg-blue-600 hover:bg-blue-700 text-white">
              {processing ? <Loader2 className="animate-spin" /> : <Link2 className="mr-2 size-4" />} Attach source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// One source card (used on the Evidence tab and in the Source Library): type, date, approval badge, title,
// a link to the original, the excerpt, and the Approve / Detach buttons when those actions are passed in.
// `expanded` shows the whole excerpt instead of the first 3 lines.
function SourceCard({ source, expanded = false, onToggleApproval, onDetach }: { source: SourceRecord; expanded?: boolean; onToggleApproval?: (source: SourceRecord) => void; onDetach?: (source: SourceRecord) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{source.type}</Badge>
            <span className="text-xs text-slate-400">{source.date}</span>
            {typeof source.approved === "boolean" && (
              <Badge variant="outline" className={source.approved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                {source.approved ? "Approved" : "Not approved"}
              </Badge>
            )}
          </div>
          <h4 className="font-semibold leading-5">{source.title}</h4>
        </div>
        {source.url && (
          <Button size="sm" variant="ghost" asChild>
            <a href={source.url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
          </Button>
        )}
      </div>
      <p className={`mt-3 text-sm leading-6 text-slate-600 ${expanded ? "" : "line-clamp-3"}`}>{source.excerpt}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onToggleApproval && typeof source.approved === "boolean" && (
          <Button size="sm" variant="outline" onClick={() => onToggleApproval(source)}>
            {source.approved ? "Withdraw approval" : "Approve source"}
          </Button>
        )}
        {onDetach && (
          <Button size="sm" variant="ghost" className="text-slate-600" onClick={() => onDetach(source)}>
            Detach from this item
          </Button>
        )}
      </div>
      {source.fileName && <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><FileText className="size-3.5" /> {source.fileName}</p>}
    </div>
  )
}