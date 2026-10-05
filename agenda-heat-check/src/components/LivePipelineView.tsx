import React, { useState, useEffect, useRef } from 'react';

interface LivePipelineViewProps {
  onComplete: () => void;
  onCancel: () => void;
}

const INITIAL_LOGS = [
  '[AGENT-LEGAL] Validated Chapter 212 conformance for Item 2 plat.',
  '[CIP-AGENT] Correlating Item 4 (Main St redevelopment) with 2023 Phase 1 budget variance...',
  '[SENTIMENT] Ingested 14 public comments from Northgate Merchants Association re: construction window.',
  '[FINANCE-LLM] Apex Infrastructure historical delta: +$420,000 on asphalt escalation clause.',
  '[VOICE-ANALYZER] Transcribing pre-meeting public hearing submissions...'
];

const STREAMING_LOGS = [
  '[SIMULATOR] Calibrating 7 typical opposition questions regarding detours...',
  '[POLICY-VECTOR] Correlating parking meter revenue loss ($18k/mo estimate)...',
  '[SPEECH-PREP] Formatting dais soundbites for Mayor & Council Place 4...',
  '[COMPILATION] Binding legal attachments, CIP ledgers, & transcript citations...',
  '[CHARTER-CHECK] Verified open meetings act §551 posting requirement satisfied.',
  '[CIVIC-VECTORS] Computed high friction index (92) on Item 4 contractor award.'
];

export const LivePipelineView: React.FC<LivePipelineViewProps> = ({
  onComplete,
  onCancel
}) => {
  const [progress, setProgress] = useState(74);
  const [secondsRemaining, setSecondsRemaining] = useState(4);
  const [elapsedSeconds, setElapsedSeconds] = useState(8.41);
  const [notifyAlert, setNotifyAlert] = useState(true);
  const [logs, setLogs] = useState<string[]>(INITIAL_LOGS);
  const [currentStage, setCurrentStage] = useState(3);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Clock & Progress interval
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setElapsedSeconds((prev) => +(prev + 0.1).toFixed(2));
    }, 100);

    let logIdx = 0;
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        const next = prev + 1;
        setSecondsRemaining((sec) => Math.max(0, +(sec - 0.15).toFixed(1)));

        // Advance stages
        if (next > 84 && currentStage === 3) {
          setCurrentStage(4);
        }
        if (next > 94 && currentStage === 4) {
          setCurrentStage(5);
        }

        // Add streaming logs
        if (next % 4 === 0 && logIdx < STREAMING_LOGS.length) {
          setLogs((curr) => [...curr, STREAMING_LOGS[logIdx]]);
          logIdx++;
        }

        return next;
      });
    }, 320);

    return () => {
      clearInterval(clockInterval);
      clearInterval(progressInterval);
    };
  }, [currentStage]);

  // Format elapsed time string 00:08.41
  const formattedElapsed = React.useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = (elapsedSeconds % 60).toFixed(2);
    return `${String(mins).padStart(2, '0')}:${secs.padStart(5, '0')} elapsed`;
  }, [elapsedSeconds]);

  return (
    <div className="flex flex-col w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
      {/* Top Session Breadcrumb & Status Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-primary font-label-mono text-label-mono uppercase text-xs">
            <span className="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
            Docket #CS-2024-10-24
          </span>
          <span className="text-on-surface-variant font-label-md text-label-md">•</span>
          <span className="text-on-surface-variant font-label-md text-label-md text-xs sm:text-sm">
            Autonomous Synthesis Engine v4.2
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low rounded-lg shadow-2xs border border-outline-variant/20">
            <span className="material-symbols-outlined text-primary text-[18px]">lock</span>
            <span className="font-label-sm text-label-sm text-on-surface text-xs font-medium">
              Municipal CJIS Air-Gapped Cluster
            </span>
          </div>
          <span className="text-on-surface-variant font-label-mono text-label-mono text-xs">
            {formattedElapsed}
          </span>
        </div>
      </div>

      {/* Primary Intelligence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Hero Column: Executive Mission Control (8 cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          {/* Central Intelligence Command Core */}
          <div className="relative bg-primary text-on-primary rounded-xl p-6 sm:p-8 shadow-xl overflow-hidden border border-primary-container">
            {/* Ambient decorative pulses */}
            <div className="absolute -right-16 -top-16 w-80 h-80 bg-secondary/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-tertiary-fixed-dim/15 rounded-full blur-2xl pointer-events-none"></div>

            <div className="relative z-10 flex flex-col space-y-5">
              {/* Mission Meta & Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-lowest/10 backdrop-blur-md rounded-full text-secondary-fixed font-label-sm text-label-sm text-xs">
                  <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  <span className="font-semibold tracking-wide">LIVE AI REASONING PIPELINE</span>
                </div>
                <div className="flex items-center gap-1 text-primary-fixed-dim font-label-mono text-label-mono text-xs">
                  <span>MODEL:</span>
                  <span className="text-on-primary font-bold">CIVIC-DEEP-REASON-70B</span>
                </div>
              </div>

              {/* Main Executive Header */}
              <div className="space-y-1">
                <h1 className="font-headline-xl text-headline-xl text-on-primary tracking-tight font-bold text-2xl sm:text-3xl lg:text-4xl">
                  {progress < 100
                    ? 'Analyzing agenda, searching records & public discussion…'
                    : 'Analysis Complete: Executive Briefing Ready'}
                </h1>
                <p className="font-body-lg text-body-lg text-primary-fixed-dim flex items-center gap-1.5 text-sm sm:text-base">
                  <span className="material-symbols-outlined text-secondary text-[20px]">account_balance</span>
                  City of College Station City Council — Regular Meeting (Oct 24, 2024)
                </p>
              </div>

              {/* Synthetic Gauge / Progress Rail */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between font-label-md text-label-md text-primary-fixed text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-primary font-bold text-xl">
                      {progress}%
                    </span>
                    <span className="text-primary-fixed-dim uppercase tracking-wider font-label-sm text-label-sm font-semibold text-xs">
                      {progress < 100 ? 'Synthesized' : 'Synthesis Complete'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-secondary-fixed font-label-mono text-label-mono text-xs">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    <span>
                      {progress < 100
                        ? `Approx. ${Math.ceil(secondsRemaining)} seconds remaining`
                        : 'Ready for Dais presentation'}
                    </span>
                  </div>
                </div>

                {/* Dynamic Multi-segment Bar */}
                <div className="w-full h-3 bg-surface-container-highest/20 rounded-full overflow-hidden p-0.5 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-secondary to-secondary-container rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center font-label-mono text-label-mono text-primary-fixed-dim text-xs">
                  <div className="bg-surface-container-lowest/10 py-1.5 px-2 rounded border border-white/5">
                    8 / 8 DOCKET ITEMS
                  </div>
                  <div className="bg-surface-container-lowest/10 py-1.5 px-2 rounded border border-white/5">
                    14 ARCHIVAL OVERLAYS
                  </div>
                  <div className="bg-surface-container-lowest/10 py-1.5 px-2 rounded border border-white/5">
                    4,120 CITIZEN PULSES
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Stage Pipeline Status Tracker */}
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-xs border border-outline-variant/30 space-y-4">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">flowsheet</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold text-base sm:text-lg">
                  Multi-Agent Verification Pipeline
                </h2>
              </div>
              <span className="font-label-mono text-label-mono text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded text-xs font-semibold">
                STAGE {currentStage} OF 5
              </span>
            </div>

            <div className="space-y-3">
              {/* Step 1: Complete */}
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/20 transition-all">
                <div className="w-7 h-7 rounded-full bg-surface-container-lowest shadow-xs flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[18px] text-[#059669]">check_circle</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold text-sm">
                      Parsing 8 agenda items &amp; extracting legal references
                    </span>
                    <span className="font-label-mono text-label-mono text-[#059669] bg-[#ecfdf5] px-2 py-0.5 rounded font-bold text-xs">
                      Complete
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 text-xs">
                    Indexed all 8 items, including zoning ordinances, consent motions, and legal charter citations (TX Local Gov Code Sec. 212).
                  </p>
                </div>
              </div>

              {/* Step 2: Complete */}
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/20 transition-all">
                <div className="w-7 h-7 rounded-full bg-surface-container-lowest shadow-xs flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[18px] text-[#059669]">check_circle</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold text-sm">
                      Cross-referencing CIP &amp; Vendor Cost Overrun Ledger
                    </span>
                    <span className="font-label-mono text-label-mono text-secondary bg-secondary-fixed px-2 py-0.5 rounded font-bold text-xs">
                      1 Critical Correlation
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 text-xs">
                    Found 1 historical overrun match: <span className="font-semibold text-on-surface">Apex Infrastructure Corp</span> incurred an 18.4% budget amendment in 2022 Holleman Drive widening.
                  </p>
                </div>
              </div>

              {/* Step 3: Scanning public discussion */}
              <div
                className={`flex items-start gap-3 p-3.5 rounded-lg transition-all relative overflow-hidden border ${
                  currentStage === 3
                    ? 'bg-surface-container shadow-xs border-secondary/40'
                    : 'bg-surface-container-low border-outline-variant/20'
                }`}
              >
                {currentStage === 3 && (
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary animate-pulse"></div>
                )}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    currentStage > 3
                      ? 'bg-surface-container-lowest text-[#059669]'
                      : 'bg-secondary-fixed text-secondary'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {currentStage > 3 ? 'check_circle' : 'refresh'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-headline-sm text-headline-sm text-primary font-bold text-sm">
                        Scanning public discussion &amp; social listening spikes
                      </span>
                      {currentStage === 3 && (
                        <span className="w-2 h-2 rounded-full bg-error animate-ping"></span>
                      )}
                    </div>
                    <span
                      className={`font-label-mono text-label-mono px-2 py-0.5 rounded font-bold text-xs ${
                        currentStage > 3
                          ? 'text-[#059669] bg-[#ecfdf5]'
                          : 'text-error bg-error-container text-on-error-container'
                      }`}
                    >
                      {currentStage > 3 ? 'Complete' : 'Processing Live'}
                    </span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface mt-1 font-medium text-xs sm:text-sm">
                    Detected <span className="text-error font-bold font-label-mono">+300% sentiment surge</span> regarding Downtown Detour &amp; Northgate parking modifications.
                  </p>

                  {/* Sentiment Micro-Bar */}
                  <div className="mt-2.5 pt-1">
                    <div className="flex items-center justify-between font-label-sm text-label-sm mb-1 text-on-surface-variant text-xs">
                      <span>Sentiment Distribution on Detour (N=842 comments)</span>
                      <span className="font-label-mono text-error font-bold">68% Opposed</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-highest flex overflow-hidden">
                      <div className="h-full bg-error transition-all" style={{ width: '68%' }}></div>
                      <div className="h-full bg-outline-variant transition-all" style={{ width: '22%' }}></div>
                      <div className="h-full bg-[#059669] transition-all" style={{ width: '10%' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4: Simulating resident questions */}
              <div
                className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all ${
                  currentStage === 4
                    ? 'bg-surface-container shadow-xs border-secondary/40'
                    : currentStage > 4
                    ? 'bg-surface-container-low border-outline-variant/20'
                    : 'bg-surface-container-low opacity-60 border-outline-variant/20'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    currentStage > 4
                      ? 'bg-surface-container-lowest text-[#059669]'
                      : currentStage === 4
                      ? 'bg-secondary-fixed text-secondary'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {currentStage > 4
                      ? 'check_circle'
                      : currentStage === 4
                      ? 'refresh'
                      : 'radio_button_unchecked'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold text-sm">
                      Simulating anticipated resident questions &amp; talking points
                    </span>
                    <span className="font-label-mono text-label-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded text-xs">
                      {currentStage > 4 ? 'Complete' : currentStage === 4 ? 'Synthesizing...' : 'Queued'}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 text-xs">
                    Synthesizing Dais rebuttal defensibility matrix for Councilmembers and staff.
                  </p>
                </div>
              </div>

              {/* Step 5: Synthesizing heat index */}
              <div
                className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all ${
                  currentStage === 5
                    ? 'bg-surface-container shadow-xs border-secondary/40'
                    : 'bg-surface-container-low opacity-60 border-outline-variant/20'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    progress === 100
                      ? 'bg-surface-container-lowest text-[#059669]'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {progress === 100 ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold text-sm">
                      Synthesizing heat index &amp; traceability citations
                    </span>
                    <span className="font-label-mono text-label-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded text-xs">
                      {progress === 100 ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 text-xs">
                    Compiling final Council Executive Briefing dossier with direct source document deep links.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/30">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyAlert}
                  onChange={(e) => setNotifyAlert(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:border-surface-container-high after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                <span className="font-label-md text-label-md text-on-surface text-xs sm:text-sm">
                  Push alert upon brief readiness
                </span>
              </label>
            </div>
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-auto px-4 py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors flex items-center justify-center gap-1.5 border border-outline-variant/30 text-xs sm:text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
                <span>Cancel Analysis</span>
              </button>
              <button
                type="button"
                onClick={onComplete}
                className="w-full sm:w-auto px-5 py-2 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-xs flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
                <span>{progress === 100 ? 'View Final Dossier' : 'View Draft Dossier'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Telemetry & Inspector Feed (4 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          {/* Live Agent Stream Terminal */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-xs border border-outline-variant/30 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold text-sm sm:text-base">
                  Live Agent Stream
                </span>
              </div>
              <span className="font-label-mono text-label-mono text-on-surface-variant text-xs">
                420 msg/sec
              </span>
            </div>

            {/* Terminal Feed Box */}
            <div
              ref={terminalRef}
              className="bg-primary text-primary-fixed-dim rounded-lg p-3 font-label-mono text-label-mono space-y-2 h-72 overflow-y-auto shadow-inner border border-primary-container text-xs"
            >
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-secondary select-none font-bold">&gt;</span>
                  <span className={i === logs.length - 1 ? 'text-on-primary font-medium' : 'text-primary-fixed-dim'}>
                    {log}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm text-[11px]">
              <span>Vector Cluster ID: #CS-R-99</span>
              <span className="text-secondary font-semibold">100% Deterministic Verification</span>
            </div>
          </div>

          {/* Dais Preview Card: Agenda Heatmap Snapshot */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-xs border border-outline-variant/30 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold text-sm">
                Preliminary Heat Check
              </h3>
              <span className="font-label-mono text-label-mono px-2 py-0.5 rounded bg-error-container text-on-error-container font-bold text-[11px]">
                1 HEATED ITEM
              </span>
            </div>

            <div className="space-y-2 font-label-sm text-label-sm">
              <div className="p-2.5 rounded bg-surface-container-low flex items-center justify-between gap-2 border border-outline-variant/20">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-label-mono text-on-surface-variant shrink-0 text-xs">ITM 01</span>
                  <span className="text-on-surface truncate text-xs">Consent Agenda - Minutes</span>
                </div>
                <span className="font-label-mono text-[#059669] font-bold shrink-0 text-xs">
                  Score 12 • Calm
                </span>
              </div>

              <div className="p-2.5 rounded bg-surface-container-low flex items-center justify-between gap-2 border border-outline-variant/20">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-label-mono text-on-surface-variant shrink-0 text-xs">ITM 02</span>
                  <span className="text-on-surface truncate text-xs">Wellborn Rd Rezoning (C-3)</span>
                </div>
                <span className="font-label-mono text-[#d97706] font-bold shrink-0 text-xs">
                  Score 48 • Moderate
                </span>
              </div>

              <div className="p-2.5 rounded bg-secondary-fixed/50 flex items-center justify-between gap-2 border border-secondary/30">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-label-mono text-secondary font-bold shrink-0 text-xs">ITM 04</span>
                  <span className="text-on-surface font-semibold truncate text-xs">
                    Main St Redevelopment Phase II
                  </span>
                </div>
                <span className="font-label-mono text-secondary font-extrabold shrink-0 text-xs">
                  Score 89 • Heated
                </span>
              </div>
            </div>

            {/* Metric Pulse visualization */}
            <div className="pt-1 flex flex-col space-y-1">
              <div className="flex justify-between font-label-mono text-label-mono text-on-surface-variant text-[11px]">
                <span>COUNCIL DISCORD PROBABILITY</span>
                <span className="text-secondary font-bold">HIGH (82%)</span>
              </div>
              <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full bg-secondary rounded-full" style={{ width: '82%' }}></div>
              </div>
            </div>
          </div>

          {/* Municipal Context Metadata Card */}
          <div className="bg-surface-container rounded-xl p-4 space-y-1 text-on-surface-variant font-body-sm text-body-sm border border-outline-variant/20 text-xs">
            <div className="flex items-center gap-1.5 text-primary font-label-md text-label-md font-semibold">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>College Station Intelligence Shield</span>
            </div>
            <p className="leading-relaxed">
              Analysis cross-references 12 years of Brazos County property appraisals, College Station City Council vote histories (2018–2024), and live civic social feeds.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
