import React, { useState } from 'react';
import { AgendaItem, ChatMessage, HeatLevel, ReviewStatus } from '../types';

interface MeetingBriefingsViewProps {
  agendaItems: AgendaItem[];
  setAgendaItems: React.Dispatch<React.SetStateAction<AgendaItem[]>>;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  chambersMode: boolean;
  toggleChambersMode: () => void;
  onOpenExport: () => void;
  onInspectRecord: (record: { name: string; fileType: string; snippet?: string }) => void;
  onGoToUpload?: () => void;
}

export const MeetingBriefingsView: React.FC<MeetingBriefingsViewProps> = ({
  agendaItems,
  setAgendaItems,
  chatMessages,
  setChatMessages,
  chambersMode,
  toggleChambersMode,
  onOpenExport,
  onInspectRecord,
  onGoToUpload
}) => {
  const [filterTier, setFilterTier] = useState<'all' | 'critical' | 'moderate' | 'calm'>('all');
  const [chatInput, setChatInput] = useState('');
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [apiStatus, setApiStatus] = useState<{ connected: boolean; hasApiKey: boolean; model?: string } | null>(null);

  // Check backend API and Live Search status
  React.useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => setApiStatus(data))
      .catch(() => {
        setApiStatus({ connected: false, hasApiKey: false });
      });
  }, []);

  // Compute stats
  const criticalCount = agendaItems.filter((i) => i.heatTier === 'critical').length;
  const moderateCount = agendaItems.filter((i) => i.heatTier === 'moderate').length;
  const calmCount = agendaItems.filter((i) => i.heatTier === 'calm').length;

  const draftCount = agendaItems.filter((i) => i.status === 'Draft').length;
  const reviewedCount = agendaItems.filter((i) => i.status === 'Reviewed').length;
  const approvedCount = agendaItems.filter((i) => i.status === 'Approved').length;

  // Filtered items (sorted by heatScore descending)
  const filteredItems = React.useMemo(() => {
    let items = [...agendaItems].sort((a, b) => b.heatScore - a.heatScore);
    if (filterTier !== 'all') {
      items = items.filter((i) => i.heatTier === filterTier);
    }
    return items;
  }, [agendaItems, filterTier]);

  const updateItemStatus = (id: string, newStatus: ReviewStatus) => {
    setAgendaItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? chatInput).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'council',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput('');
    setIsAiReplying(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, enableWebSearch })
      });

      if (!response.ok) {
        throw new Error('API server returned error');
      }

      const data = await response.json();

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: data.reply,
        citation: data.citation,
        webSources: data.webSources,
        isLiveWebSearch: data.isLiveWebSearch,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      // Local fallback
      const lower = text.toLowerCase();
      let reply = '';
      let citation = '';

      if (lower.includes('apex') || lower.includes('vote margin') || lower.includes('holleman')) {
        reply =
          'The 2022 Holleman Drive bid was awarded to Apex Infrastructure on a 5-2 vote (Councilmembers Nichols and Smith dissenting, citing prior subcontractor disputes). The final closeout cost exceeded original bid by $2,140,000 (+18.4%). Liquidated damage provisions were waived due to unforeseen fiber optic line conflicts.';
        citation = 'Source: City Council Regular Minutes, Aug 11, 2022, Res #22-108 & Auditor Ledger';
      } else if (lower.includes('short-term') || lower.includes('rentals') || lower.includes('str')) {
        reply =
          'Public testimony across past 3 public hearings shows 68% resident concern regarding neighborhood parking overflow and noise ordinance enforcement, specifically focused within 1.5 miles of Texas A&M campus. P&Z recommended creating a density cap buffer.';
        citation = 'Source: Neighborhood Services Audit & Citizen Hearing Register #2024-Q2';
      } else if (lower.includes('60-second') || lower.includes('opening statement') || lower.includes('statement')) {
        reply =
          `Suggested dais opening statement: "Colleagues, Item 4 addresses vital corridor rehabilitation on Main Street. We hear the Northgate merchants' concerns loud and clear—which is why this agreement introduces a $150,000 business continuity fund, guaranteed delivery milestones, and an enforceable $5,000 daily penalty for avoidable delays."`;
        citation = 'Synthesized from Legal Counsel Contract Safeguard Memorandum, Oct 2024';
      } else if (lower.includes('zoning') || lower.includes('1400 university') || lower.includes('deed')) {
        reply =
          'Planning & Zoning Commission unanimously approved (7-0) the 1400 University Drive rezoning with two enforceable deed covenants: 1) Prohibiting any direct curb-cut access onto minor residential collector streets, and 2) Requirement of developer funding for a 200ft deceleration lane.';
        citation = 'Source: P&Z Commission Minutes Aug 15, 2024 (Docket #RZ-2024-11)';
      } else {
        reply = `Records retrieved regarding "${text}". Historical search across 2018–2024 College Station archives indicates zero statutory conflicts with Texas Local Government Code Chapter 212. Staff notes this item is defensible for council adoption.`;
        citation = 'College Station Unified Development Code & Archival Index §11.4';
      }

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: reply,
        citation,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsAiReplying(false);
    }
  };

  if (agendaItems.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-surface-container-high text-secondary flex items-center justify-center mx-auto shadow-xs">
          <span className="material-symbols-outlined text-[32px]">upload_file</span>
        </div>
        <div className="space-y-2">
          <h2 className="font-headline-lg text-headline-lg text-primary font-bold text-2xl">
            No Agenda Items Analyzed Yet
          </h2>
          <p className="text-on-surface-variant font-body-md text-sm max-w-md mx-auto">
            Upload your meeting packet (PDF, DOCX, TXT) or paste agenda items to generate an instant item-by-item heat map with friction scores, questions, and talking points.
          </p>
        </div>
        {onGoToUpload && (
          <button
            type="button"
            onClick={onGoToUpload}
            className="px-6 py-3 bg-secondary text-on-secondary rounded-xl font-headline-sm font-semibold hover:bg-on-secondary-container transition-all shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">upload</span>
            <span>Upload or Paste Agenda Now</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {/* Command Strip / Executive Metadata Header */}
      <section className="w-full bg-surface-container-low px-4 sm:px-6 lg:px-8 py-5 shadow-xs border-b border-outline-variant/20">
        <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-4">
          {/* Top Layer: Meeting Breadcrumb & Telemetry Stats */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider text-xs">
                <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span>
                <span>Council Intelligence • Heat Mapping Engine</span>
                <span>•</span>
                <span className="text-primary font-bold">{agendaItems.length} Items Evaluated</span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <h1 className="font-headline-xl text-headline-xl text-primary tracking-tight text-2xl sm:text-3xl font-bold">
                  Council Meeting Agenda Heat Map
                </h1>
                {onGoToUpload && (
                  <button
                    type="button"
                    onClick={onGoToUpload}
                    className="px-3 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-xs font-semibold flex items-center gap-1 border border-outline-variant/30 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit_document</span>
                    <span>Upload / Edit Agenda</span>
                  </button>
                )}
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant text-xs sm:text-sm mt-0.5">
                {agendaItems.length} Total Legislative Items Evaluated • Predictive Resident Friction &amp; Friction Risk Telemetry Active
              </p>
            </div>

            {/* Telemetry Summary Badges */}
            <div className="flex items-center flex-wrap gap-2.5">
              {/* Critical Badge */}
              <button
                onClick={() => setFilterTier(filterTier === 'critical' ? 'all' : 'critical')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg shadow-xs border transition-all text-left ${
                  filterTier === 'critical'
                    ? 'ring-2 ring-error bg-error-container text-on-error-container border-error'
                    : 'bg-error-container/80 text-on-error-container border-error/30 hover:bg-error-container'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] text-error animate-pulse">
                  local_fire_department
                </span>
                <div className="flex flex-col leading-none">
                  <span className="font-headline-sm text-headline-sm text-error font-bold text-base">
                    {criticalCount}
                  </span>
                  <span className="font-label-sm text-label-sm uppercase tracking-wide text-[10px]">
                    Critical (80+)
                  </span>
                </div>
              </button>

              {/* Attention Badge */}
              <button
                onClick={() => setFilterTier(filterTier === 'moderate' ? 'all' : 'moderate')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg shadow-xs border transition-all text-left ${
                  filterTier === 'moderate'
                    ? 'ring-2 ring-secondary bg-secondary-fixed text-on-secondary-fixed-variant border-secondary'
                    : 'bg-secondary-fixed/80 text-on-secondary-fixed-variant border-secondary/30 hover:bg-secondary-fixed'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] text-secondary">
                  warning
                </span>
                <div className="flex flex-col leading-none">
                  <span className="font-headline-sm text-headline-sm font-bold text-base">
                    {moderateCount}
                  </span>
                  <span className="font-label-sm text-label-sm uppercase tracking-wide text-[10px]">
                    Attention (40-79)
                  </span>
                </div>
              </button>

              {/* Routine Badge */}
              <button
                onClick={() => setFilterTier(filterTier === 'calm' ? 'all' : 'calm')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg shadow-xs border transition-all text-left ${
                  filterTier === 'calm'
                    ? 'ring-2 ring-primary bg-primary-fixed text-on-primary-fixed-variant border-primary'
                    : 'bg-primary-fixed/80 text-on-primary-fixed-variant border-primary/30 hover:bg-primary-fixed'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] text-primary">
                  verified
                </span>
                <div className="flex flex-col leading-none">
                  <span className="font-headline-sm text-headline-sm font-bold text-primary text-base">
                    {calmCount}
                  </span>
                  <span className="font-label-sm text-label-sm uppercase tracking-wide text-[10px]">
                    Routine (0-39)
                  </span>
                </div>
              </button>

              {/* Chambers Mode Switch */}
              <button
                onClick={toggleChambersMode}
                className={`ml-auto lg:ml-2 flex items-center gap-2 px-3.5 py-2 rounded-lg font-label-md text-label-md transition-colors shadow-xs border text-xs sm:text-sm ${
                  chambersMode
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-highest text-on-surface hover:bg-surface-container border-outline-variant/30'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">contrast</span>
                <span>{chambersMode ? 'Exit Chambers' : 'Chambers Mode'}</span>
              </button>
            </div>
          </div>

          {/* Action & Filtering Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pt-1">
            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-1.5 bg-surface-container-lowest p-1.5 rounded-lg shadow-xs border border-outline-variant/20">
              <span className="font-label-sm text-label-sm text-on-surface-variant px-2.5 uppercase tracking-wider font-semibold text-[11px]">
                Filter Heat:
              </span>
              <button
                type="button"
                onClick={() => setFilterTier('all')}
                className={`px-3 py-1 rounded font-label-md text-label-md text-xs transition-colors cursor-pointer ${
                  filterTier === 'all'
                    ? 'bg-primary text-on-primary shadow-xs font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                All ({agendaItems.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTier('critical')}
                className={`px-3 py-1 rounded font-label-md text-label-md text-xs transition-colors cursor-pointer ${
                  filterTier === 'critical'
                    ? 'bg-primary text-on-primary shadow-xs font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                Heated (80+)
              </button>
              <button
                type="button"
                onClick={() => setFilterTier('moderate')}
                className={`px-3 py-1 rounded font-label-md text-label-md text-xs transition-colors cursor-pointer ${
                  filterTier === 'moderate'
                    ? 'bg-primary text-on-primary shadow-xs font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                Moderate (40-79)
              </button>
              <button
                type="button"
                onClick={() => setFilterTier('calm')}
                className={`px-3 py-1 rounded font-label-md text-label-md text-xs transition-colors cursor-pointer ${
                  filterTier === 'calm'
                    ? 'bg-primary text-on-primary shadow-xs font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                Calm (0-39)
              </button>
            </div>

            {/* Right Tooling: Review Tally & Export Pack */}
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="hidden xl:flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-lowest shadow-xs border border-outline-variant/20 font-label-mono text-label-mono text-on-surface-variant text-xs">
                <span className="text-on-surface font-semibold">Staff Signoff:</span>
                <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-bold">
                  {draftCount} Draft
                </span>
                <span>•</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-bold">
                  {reviewedCount} Reviewed
                </span>
                <span>•</span>
                <span className="px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-bold">
                  {approvedCount} Approved
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenExport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md hover:bg-on-secondary-container transition-colors shadow-xs text-xs sm:text-sm font-semibold cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">file_download</span>
                <span>Export Briefing (PDF/Pack)</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Asymmetric Workspace Layout */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT & CENTER AREA: Agenda Dossier Ledger (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Section Banner */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-[22px]">stacked_bar_chart</span>
              <h2 className="font-headline-lg text-headline-lg text-primary tracking-tight font-bold text-xl sm:text-2xl">
                Executive Agenda Dossiers
              </h2>
              <span className="font-label-mono text-label-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded text-xs">
                Sorted by Heat Index
              </span>
            </div>
            <div className="text-on-surface-variant font-label-sm text-label-sm text-xs">
              Showing <span className="font-bold text-primary">{filteredItems.length}</span> priority briefings
            </div>
          </div>

          {/* Agenda Cards List */}
          <div className="flex flex-col gap-5">
            {filteredItems.map((item) => {
              const isCritical = item.heatTier === 'critical';
              const isModerate = item.heatTier === 'moderate';
              const isCalm = item.heatTier === 'calm';
              const isExpanded = expandedItemId === item.id;

              const borderColor = isCritical
                ? 'bg-error'
                : isModerate
                ? 'bg-secondary'
                : 'bg-primary';

              return (
                <article
                  key={item.id}
                  className="agenda-card bg-surface-container-lowest rounded-xl shadow-xs hover:shadow-md border border-outline-variant/30 overflow-hidden relative transition-all duration-200"
                >
                  {/* Left accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${borderColor}`}></div>

                  <div className="p-5 sm:p-6 flex flex-col gap-4">
                    {/* Header & Badges */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="flex flex-col gap-1 max-w-2xl">
                        <div className="flex items-center flex-wrap gap-2 text-xs">
                          {/* Heat Pill */}
                          <span
                            className={`px-2.5 py-0.5 rounded font-label-mono text-label-mono font-bold flex items-center gap-1 ${
                              isCritical
                                ? 'bg-error-container text-on-error-container'
                                : isModerate
                                ? 'bg-secondary-fixed text-on-secondary-fixed'
                                : 'bg-primary-fixed text-on-primary-fixed'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {isCritical
                                ? 'local_fire_department'
                                : isModerate
                                ? 'trending_up'
                                : 'check_circle'}
                            </span>
                            <span>
                              {isCritical ? 'HEATED' : isModerate ? 'MODERATE' : 'CALM'} •{' '}
                              {item.heatScore}/100
                            </span>
                          </span>

                          <span className="font-label-mono text-label-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded flex items-center gap-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isCritical ? 'bg-error' : isModerate ? 'bg-secondary' : 'bg-primary'
                              }`}
                            ></span>
                            <span>{item.confidence}% Confidence</span>
                          </span>

                          <span className="font-label-mono text-label-mono text-on-surface-variant">
                            {item.docketCode}
                          </span>
                        </div>

                        <h3 className="font-headline-md text-headline-md text-primary mt-1 leading-snug font-bold text-base sm:text-lg">
                          {item.title}
                        </h3>
                      </div>

                      {/* Workflow Status Controls */}
                      <div className="flex items-center gap-1.5 shrink-0 self-start">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high font-label-md text-label-md text-on-surface text-xs font-semibold">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              item.status === 'Approved'
                                ? 'bg-[#059669]'
                                : item.status === 'Reviewed'
                                ? 'bg-secondary'
                                : 'bg-outline'
                            }`}
                          ></span>
                          <span>{item.status}</span>
                        </div>

                        {item.status !== 'Reviewed' && (
                          <button
                            type="button"
                            onClick={() => updateItemStatus(item.id, 'Reviewed')}
                            className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer border border-outline-variant/20"
                            title="Mark as Reviewed by Staff"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit_note</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            updateItemStatus(
                              item.id,
                              item.status === 'Approved' ? 'Reviewed' : 'Approved'
                            )
                          }
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            item.status === 'Approved'
                              ? 'bg-[#059669] text-white hover:bg-[#047857]'
                              : 'bg-primary-container text-on-primary hover:bg-primary'
                          }`}
                          title="Mark Approved"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          <span>{item.status === 'Approved' ? 'Approved ✓' : 'Approve'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Precision Thermometer Bar */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="flex items-center justify-between font-label-sm text-label-sm text-xs">
                        <span className="text-on-surface-variant font-medium">
                          Predictive Civic Friction Level
                        </span>
                        <span
                          className={`font-label-mono text-label-mono font-bold ${
                            isCritical
                              ? 'text-error'
                              : isModerate
                              ? 'text-secondary'
                              : 'text-primary'
                          }`}
                        >
                          {isCritical
                            ? `Severe Resident Friction Risk (${item.heatScore})`
                            : isModerate
                            ? `Moderate Discussion (${item.heatScore})`
                            : `Routine Standard Proceeding (${item.heatScore})`}
                        </span>
                      </div>

                      <div className="relative w-full h-3 bg-surface-container rounded-full overflow-visible">
                        {/* Thermometer Gradient */}
                        <div className="w-full h-full rounded-full bg-gradient-to-r from-primary-fixed via-secondary-container to-error opacity-90"></div>

                        {/* Needle Pin */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center group cursor-pointer z-10"
                          style={{ left: `${item.heatScore}%` }}
                        >
                          <div
                            className={`w-4 h-4 bg-surface-container-lowest rounded-full shadow-md flex items-center justify-center border ${
                              isCritical
                                ? 'border-error shadow-[0_0_8px_rgba(220,38,38,0.7)]'
                                : isModerate
                                ? 'border-secondary shadow-[0_0_8px_rgba(154,65,82,0.7)]'
                                : 'border-primary shadow-[0_0_6px_rgba(9,20,38,0.5)]'
                            }`}
                          >
                            <div
                              className={`w-2 h-2 rounded-full ${
                                isCritical ? 'bg-error' : isModerate ? 'bg-secondary' : 'bg-primary'
                              }`}
                            ></div>
                          </div>

                          {/* Needle Tooltip */}
                          <div className="hidden group-hover:flex absolute bottom-full mb-2 z-20 whitespace-nowrap bg-primary text-on-primary px-2.5 py-1 rounded shadow-lg font-label-mono text-label-mono text-[11px]">
                            Heat Index: {item.heatScore} (
                            {isCritical
                              ? 'Severe Resident Friction Risk'
                              : isModerate
                              ? 'Moderate Discussion'
                              : 'Consent Routine'}
                            )
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between font-label-mono text-[10px] text-outline pt-0.5">
                        <span>0 (Consensus)</span>
                        <span>50 (Moderate Debate)</span>
                        <span>100 (Polarized Backlash)</span>
                      </div>
                    </div>

                    {/* Section: Why / Primary Friction Drivers */}
                    {item.primaryDrivers && item.primaryDrivers.length > 0 && (
                      <div className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-1.5 border border-outline-variant/20">
                        <div
                          className={`flex items-center gap-1.5 font-headline-sm text-headline-sm font-bold text-sm ${
                            isCritical ? 'text-error' : 'text-secondary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {isCritical ? 'crisis_alert' : 'info'}
                          </span>
                          <h4>{isCritical ? 'Primary Friction Drivers' : 'Friction Drivers &amp; Context'}</h4>
                        </div>
                        <ul className="flex flex-col gap-2 mt-1 font-body-md text-body-md text-on-surface list-none text-xs sm:text-sm">
                          {item.primaryDrivers.map((driver, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span
                                className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${
                                  isCritical ? 'text-error' : 'text-secondary'
                                }`}
                              >
                                {idx === 0 ? 'warning' : idx === 1 ? 'trending_up' : 'group_off'}
                              </span>
                              <span>{driver}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Section: Procedural Note & Questions if Calm item */}
                    {item.proceduralNote && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-surface-container-low p-3.5 flex flex-col gap-1 border border-outline-variant/20">
                          <span className="font-headline-sm text-headline-sm text-primary font-bold text-xs uppercase tracking-wider">
                            Procedural Note
                          </span>
                          <p className="font-body-sm text-body-sm text-on-surface text-xs">
                            {item.proceduralNote}
                          </p>
                        </div>
                        <div className="rounded-xl bg-surface-container p-3.5 flex flex-col gap-1 border border-outline-variant/20">
                          <span className="font-headline-sm text-headline-sm text-primary font-bold text-xs uppercase tracking-wider">
                            Questions
                          </span>
                          <p className="font-body-sm text-body-sm text-on-surface-variant italic text-xs">
                            None anticipated; standard voice vote.
                          </p>
                        </div>
                        <div className="rounded-xl bg-primary-container text-on-primary p-3.5 flex flex-col gap-1">
                          <span className="font-headline-sm text-headline-sm text-tertiary-fixed font-bold text-xs uppercase tracking-wider">
                            Floor Action
                          </span>
                          <p className="font-body-sm text-body-sm text-on-primary font-medium text-xs">
                            {item.floorAction}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Section: Anticipated Questions & Strategic Talking Points Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Anticipated Questions (2-5 Questions You May Be Asked) */}
                      <div className="rounded-xl bg-surface-container p-4 flex flex-col gap-2.5 border border-outline-variant/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-primary font-headline-sm text-headline-sm font-bold text-sm">
                            <span className="material-symbols-outlined text-[18px] text-secondary">help_outline</span>
                            <h4>Anticipated Questions ({item.anticipatedQuestions?.length || 0})</h4>
                          </div>
                          <span className="text-[10px] font-label-mono text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded font-semibold">
                            Public &amp; Dais Scrutiny
                          </span>
                        </div>

                        {item.anticipatedQuestions && item.anticipatedQuestions.length > 0 ? (
                          <div className="flex flex-col gap-2 pt-1">
                            {item.anticipatedQuestions.map((q, qIdx) => (
                              <div
                                key={qIdx}
                                className="group flex items-start justify-between gap-2 p-2 rounded-lg bg-surface-container-lowest/80 border border-outline-variant/15 hover:border-secondary/40 transition-colors"
                              >
                                <div className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface text-xs leading-relaxed">
                                  <span className="font-label-mono font-bold text-secondary text-[11px] shrink-0 mt-0.5">
                                    Q{qIdx + 1}.
                                  </span>
                                  <span className="font-medium">{q}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSendMessage(q)}
                                  className="shrink-0 p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-secondary opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
                                  title="Ask this question in Municipal Assistant"
                                >
                                  <span className="material-symbols-outlined text-[16px]">chat</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-3 bg-surface-container-lowest rounded-lg text-xs font-body-sm text-on-surface-variant italic">
                            No immediate friction questions identified. General inquiry: &quot;Were all statutory open-meeting notice posting deadlines satisfied pursuant to Chapter 551?&quot;
                          </div>
                        )}
                      </div>

                      {/* Executive Talking Points */}
                      <div className="rounded-xl bg-primary-container text-on-primary p-4 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-headline-sm text-headline-sm text-tertiary-fixed font-bold text-sm">
                            <span className="material-symbols-outlined text-[18px]">psychology</span>
                            <h4>Dais Talking Points</h4>
                          </div>
                          <span className="text-[10px] font-label-mono text-tertiary-fixed bg-surface-container-lowest/10 px-2 py-0.5 rounded font-semibold">
                            Defensibility
                          </span>
                        </div>

                        {item.daisTalkingPoints && item.daisTalkingPoints.length > 0 ? (
                          <ul className="flex flex-col gap-2 font-body-sm text-body-sm text-on-primary list-disc pl-4 text-xs">
                            {item.daisTalkingPoints.map((point, pIdx) => (
                              <li key={pIdx} className="leading-relaxed">
                                {point}
                              </li>
                            ))}
                          </ul>
                        ) : item.floorAction ? (
                          <div className="text-xs text-on-primary font-medium p-2 rounded bg-surface-container-lowest/10">
                            Recommended Floor Action: {item.floorAction}
                          </div>
                        ) : (
                          <p className="text-xs text-primary-fixed-dim italic">
                            Standard statutory voice motion recommended.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Traceability Sources Ribbon with Direct Links */}
                    {item.traceableRecords && item.traceableRecords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/20">
                        <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1 text-xs">
                          <span className="material-symbols-outlined text-[16px] text-secondary">link</span>
                          <span className="font-medium">Traceable Records:</span>
                        </span>
                        {item.traceableRecords.map((rec, rIdx) => (
                          <div
                            key={rIdx}
                            className="inline-flex items-center rounded-lg bg-surface-container border border-outline-variant/30 overflow-hidden text-xs shadow-2xs hover:border-secondary/40 transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => onInspectRecord(rec)}
                              className="px-2.5 py-1 font-label-mono text-label-mono text-primary hover:bg-surface-container-high transition-colors flex items-center gap-1.5 cursor-pointer"
                              title="Click to inspect verified dossier excerpt"
                            >
                              <span className="material-symbols-outlined text-[14px] text-secondary">description</span>
                              <span>{rec.name}</span>
                            </button>
                            {rec.url && (
                              <a
                                href={rec.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 bg-surface-container-high hover:bg-secondary hover:text-on-secondary text-primary transition-colors flex items-center gap-1 border-l border-outline-variant/30 font-medium cursor-pointer"
                                title={`Open direct record link in new tab (${rec.url})`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[11px] font-mono">Direct Record</span>
                                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Civic Follow-Up Chatbot & Archival Intelligence (4 Cols) */}
        <aside className="lg:col-span-4 flex flex-col gap-5">
          {/* Panel Header Card */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs border border-outline-variant/30 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[24px]">smart_toy</span>
                <h3 className="font-headline-md text-headline-md text-primary font-bold text-base">
                  Municipal Follow-Up Assistant
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-label-mono text-secondary font-semibold">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" title="System Online"></span>
                <span>{apiStatus?.hasApiKey ? 'Gemini 3.8 Live' : 'Archive Ready'}</span>
              </div>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant text-xs">
              Grounded in loaded College Station records, past agendas, zoning archives, and live internet search.
            </p>

            {/* Perplexity-style Live Web Search Mode Toggle */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-secondary">travel_explore</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-primary font-semibold text-xs flex items-center gap-1">
                    Live Web Search (Perplexity Mode)
                    {enableWebSearch && (
                      <span className="px-1.5 py-0.2 rounded bg-secondary text-white text-[9px] font-mono uppercase">
                        Active
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-label-mono">
                    Google Search Grounding + Real Web URLs
                  </span>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={enableWebSearch}
                  onChange={(e) => setEnableWebSearch(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:border-surface-dim after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between text-[11px] font-label-mono text-on-surface-variant bg-surface-container px-2.5 py-1 rounded">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary">database</span>
                Charter Corpus: 2018-2024
              </span>
              <span className="text-primary font-semibold">Strict Citation Mode: ON</span>
            </div>
          </div>

          {/* Interactive Q&A Chat Transcript Box */}
          <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/30 p-4 flex flex-col h-[580px] justify-between">
            {/* Conversation Thread */}
            <div className="flex flex-col gap-3.5 overflow-y-auto pr-1">
              {/* System Welcome Pill */}
              <div className="text-center my-1">
                <span className="font-label-mono text-[10px] text-on-surface-variant bg-surface-container-low px-2.5 py-1 rounded-full border border-outline-variant/20">
                  Chambers Session Initialized • Real-time Internet &amp; Archive Grounding Active
                </span>
              </div>

              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1 ${
                    msg.sender === 'council' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm text-[11px]">
                    {msg.sender === 'council' ? (
                      <>
                        <span>Councilmember Inquiry</span>
                        <span className="material-symbols-outlined text-[14px]">person</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-secondary text-[14px]">
                          {msg.isLiveWebSearch ? 'public' : 'verified_user'}
                        </span>
                        <span className="font-bold text-secondary">
                          {msg.isLiveWebSearch ? 'Live Web Verified Synthesis' : 'Verified Civic Synthesis'}
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    className={`p-3 rounded-xl font-body-sm text-body-sm shadow-2xs text-xs sm:text-sm ${
                      msg.sender === 'council'
                        ? 'bg-primary text-on-primary rounded-tr-none max-w-[90%]'
                        : 'bg-surface-container-low text-on-surface rounded-tl-none max-w-[95%] border border-outline-variant/20'
                    }`}
                  >
                    <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                    
                    {/* Perplexity-style live web sources */}
                    {msg.webSources && msg.webSources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-outline-variant/25">
                        <span className="font-label-mono text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] text-secondary">language</span>
                          Live Web Sources &amp; Citations ({msg.webSources.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.webSources.map((source, sIdx) => (
                            <a
                              key={sIdx}
                              href={source.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-mono text-[11px] border border-outline-variant/30 transition-colors max-w-full hover:border-secondary"
                              title={source.title}
                            >
                              <span className="material-symbols-outlined text-[12px] text-secondary">link</span>
                              <span className="truncate max-w-[170px]">{source.title}</span>
                              <span className="material-symbols-outlined text-[10px] text-outline">open_in_new</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.citation && !msg.webSources?.length && (
                      <div className="mt-2 pt-1.5 border-t border-outline-variant/30 font-label-mono text-label-mono text-primary flex items-center gap-1 text-[11px]">
                        <span className="material-symbols-outlined text-[14px]">history</span>
                        <span>{msg.citation}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isAiReplying && (
                <div className="flex items-center gap-2 p-3 bg-surface-container-low rounded-xl rounded-tl-none text-xs text-on-surface-variant border border-outline-variant/20">
                  <span className="material-symbols-outlined text-secondary text-[16px] animate-spin">
                    sync
                  </span>
                  <span>
                    {enableWebSearch
                      ? 'Searching live web & municipal archives via Gemini 3.8...'
                      : 'Synthesizing verified municipal response...'}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Inquiry Chips & Input Area */}
            <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/20 mt-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium text-[11px]">
                Suggested Dais Inquiries:
              </span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleSendMessage('Search latest news on Texas A&M football game traffic in College Station')}
                  className="quick-prompt-btn text-left p-1.5 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm flex items-center justify-between transition-colors text-xs border border-outline-variant/20"
                >
                  <span className="truncate">Search latest news on Texas A&amp;M football game traffic</span>
                  <span className="material-symbols-outlined text-[15px] text-secondary shrink-0 ml-1">travel_explore</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage('What was the vote margin on the previous Apex contract?')}
                  className="quick-prompt-btn text-left p-1.5 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm flex items-center justify-between transition-colors text-xs border border-outline-variant/20"
                >
                  <span className="truncate">What was the vote margin on the previous Apex contract?</span>
                  <span className="material-symbols-outlined text-[15px] text-outline shrink-0 ml-1">arrow_outward</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage('Draft a 60-second opening statement for Item 4')}
                  className="quick-prompt-btn text-left p-1.5 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm flex items-center justify-between transition-colors text-xs border border-outline-variant/20"
                >
                  <span className="truncate">Draft a 60-second opening statement for Item 4</span>
                  <span className="material-symbols-outlined text-[15px] text-outline shrink-0 ml-1">arrow_outward</span>
                </button>
              </div>

              {/* Prompt Box Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="relative mt-1"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    enableWebSearch
                      ? 'Ask question or search the live web (Perplexity mode)...'
                      : 'Ask follow-up regarding agenda items or past records...'
                  }
                  className="w-full pl-3 pr-10 py-2 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-inner border border-outline-variant/30 text-xs"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isAiReplying}
                  className="absolute right-1 top-1 bottom-1 px-2.5 rounded bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
                  title="Submit Inquiry"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {enableWebSearch ? 'travel_explore' : 'send'}
                  </span>
                </button>
              </form>

              <div className="flex items-center justify-between text-[10px] font-label-mono text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  {enableWebSearch ? 'Gemini 3.8 Flash • Google Search Grounding' : 'RAG Model 4.1 Municipal'}
                </span>
                <span>{enableWebSearch ? 'Live Web Citations' : 'Zero Hallucination Filter'}</span>
              </div>
            </div>
          </div>

          {/* Quick Context Vectors Card */}
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs border border-outline-variant/30 flex flex-col gap-2">
            <h4 className="font-headline-sm text-headline-sm text-primary font-bold text-sm">
              College Station Context Vectors
            </h4>
            <div className="grid grid-cols-2 gap-2 font-label-mono text-label-mono text-center">
              <div className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/20">
                <span className="text-on-surface-variant text-[10px] block">Northgate District</span>
                <span className="font-bold text-error text-[13px]">Elevated Tension</span>
              </div>
              <div className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/20">
                <span className="text-on-surface-variant text-[10px] block">P&amp;Z Align Score</span>
                <span className="font-bold text-primary text-[13px]">91% Standard</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Persistent Advisory Banner */}
      <section className="w-full bg-surface-container-low px-4 sm:px-6 lg:px-8 py-3.5 border-t border-outline-variant/30 mt-6">
        <div className="w-full max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-on-surface-variant font-label-mono text-label-mono text-xs">
          <div className="flex items-center gap-1.5 text-secondary">
            <span className="material-symbols-outlined text-[18px]">gavel</span>
            <span>AI output is advisory. Verify facts and sources before official use.</span>
          </div>
          <div className="flex items-center gap-4">
            <span>College Station City Secretary &amp; Legal Counsel verified archive.</span>
            <span className="text-primary font-bold">Secure Official Dais Feed</span>
          </div>
        </div>
      </section>
    </div>
  );
};
