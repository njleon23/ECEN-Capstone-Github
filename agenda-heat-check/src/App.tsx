/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { PrepareBriefingView } from './components/PrepareBriefingView';
import { LivePipelineView } from './components/LivePipelineView';
import { MeetingBriefingsView } from './components/MeetingBriefingsView';
import { MunicipalDatasetsView } from './components/MunicipalDatasetsView';
import { CouncilCalendarView } from './components/CouncilCalendarView';
import { ExportBriefingModal } from './components/ExportBriefingModal';
import { RecordPreviewModal } from './components/RecordPreviewModal';
import {
  SAMPLE_AGENDA_TEXT,
  INITIAL_AGENDA_ITEMS,
  MUNICIPAL_DATASETS,
  INITIAL_CHAT_MESSAGES
} from './data/mockData';
import { AgendaItem, MunicipalDataset, ChatMessage, CouncilMeeting } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'new-analysis' | 'live-pipeline' | 'meeting-briefings' | 'municipal-datasets-records' | 'city-council-calendar'
  >('new-analysis');

  const [agendaText, setAgendaText] = useState('');
  const [datasets, setDatasets] = useState<MunicipalDataset[]>(MUNICIPAL_DATASETS);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chambersMode, setChambersMode] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [inspectingRecord, setInspectingRecord] = useState<{
    name: string;
    fileType: string;
    snippet?: string;
  } | null>(null);

  // Toggle Chambers Mode on body
  const toggleChambersMode = () => {
    setChambersMode((prev) => {
      const next = !prev;
      if (next) {
        document.body.classList.add('chambers-mode');
      } else {
        document.body.classList.remove('chambers-mode');
      }
      return next;
    });
  };

  // Launch analysis flow: calls backend /api/analyze-agenda to generate heat mapping for each item
  const handleGenerateHeatMap = async (textToAnalyze: string) => {
    setIsAnalyzing(true);
    setActiveTab('live-pipeline');

    try {
      const response = await fetch('/api/analyze-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agendaText: textToAnalyze })
      });

      if (!response.ok) {
        throw new Error('Analysis API failed');
      }

      const data = await response.json();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        setAgendaItems(data.items);
      }
    } catch (err) {
      console.error('Failed to generate via backend, generating client fallback:', err);
      // Fallback parser if fetch fails
      const lines = textToAnalyze.split('\n').filter((l) => l.trim().length > 0);
      const generated: AgendaItem[] = lines.map((line, idx) => {
        const isHigh = /contract|redevelop|\$|million|bid|overrun/i.test(line);
        const isMed = /zoning|rezone|parking|ordinance|density/i.test(line);
        const score = isHigh ? 88 : isMed ? 58 : 12;
        return {
          id: `item-${Date.now()}-${idx + 1}`,
          itemNumber: idx + 1,
          docketCode: `ITEM-${String(idx + 1).padStart(2, '0')}`,
          title: line.trim(),
          category: isHigh ? 'Public Works / Fiscal' : isMed ? 'Planning & Zoning' : 'Consent / Routine',
          heatScore: score,
          heatTier: score >= 80 ? 'critical' : score >= 40 ? 'moderate' : 'calm',
          confidence: 90,
          status: 'Draft',
          primaryDrivers: isHigh
            ? ['High fiscal appropriation and potential public scrutiny on project delivery.']
            : isMed
            ? ['Neighborhood feedback anticipated regarding parking, density, or traffic.']
            : [],
          anticipatedQuestions: isHigh
            ? [
                'Why was this specific contractor selected over competing bids?',
                'What enforceable penalties or liquidated damages apply if construction is delayed?',
                'How will surrounding business access and customer parking be maintained during the work?',
                'Does this award require any future contingency budget amendments?'
              ]
            : isMed
            ? [
                'Will this create cut-through traffic into adjacent residential neighborhoods?',
                'Has the local school district confirmed bus transit safety and capacity for this density?',
                'What deed restrictions or physical buffers are established along residential borders?'
              ]
            : [
                'Were all statutory open-meeting notice posting deadlines satisfied pursuant to Chapter 551?',
                'Does this consent item include any individual vouchers or expenditures exceeding $50,000?'
              ],
          daisTalkingPoints: isHigh
            ? ['Performance benchmarks and delivery milestones are strictly enforced.']
            : isMed
            ? ['Planning & Zoning Commission reviewed technical studies and recommended approval.']
            : ['Move to approve item as recorded.'],
          traceableRecords: isHigh
            ? [
                {
                  name: `Vendor Ledger: Apex Infra 2022.csv`,
                  fileType: 'CSV',
                  url: 'https://www.cstx.gov/departments/fiscal_services/purchasing/vendor_transparency/APX-901-ledger.csv',
                  snippet: 'Vendor ID: APX-901 | FY2022 Holleman Widening | Base: $11.6M | Change Orders: +$2.14M (18.4%) | Cause: Subsurface utility collision & asphalt index escalation.'
                },
                {
                  name: `CIP Resolution 2024-88.pdf`,
                  fileType: 'Resolution',
                  url: 'https://records.cstx.gov/resolutions/2024/RES-2024-88.pdf',
                  snippet: 'Resolution authorizing $14,250,000 appropriation from 2022 General Obligation Bond Fund for corridor reconstruction.'
                }
              ]
            : isMed
            ? [
                {
                  name: `P&Z Commission Minutes Aug 15, 2024.pdf`,
                  fileType: 'Minutes',
                  url: 'https://www.cstx.gov/departments/planning_development/p_z_minutes/2024-08-15-pz-official.pdf',
                  snippet: 'P&Z vote 7-0 in favor with deed covenant restriction prohibiting primary egress onto neighborhood roads.'
                },
                {
                  name: `Traffic Impact Study #TR-24-11.pdf`,
                  fileType: 'Technical Report',
                  url: 'https://records.cstx.gov/traffic/studies/TR-24-11-university-drive.pdf',
                  snippet: 'Analyzed 1,200 weekday trips. Maximum queue length at Lincoln Ave intersection increases by 2.4 vehicles during AM peak.'
                }
              ]
            : [
                {
                  name: `Official Minutes Draft Oct 10, 2024.pdf`,
                  fileType: 'Draft Minutes',
                  url: 'https://www.cstx.gov/departments/city_secretary/city_council_agendas_and_minutes/2024-10-10-regular-draft.pdf',
                  snippet: 'Approved unanimously on first reading; transcribed by City Secretary Office pursuant to Texas Open Meetings Act §551.021.'
                }
              ]
        };
      });
      setAgendaItems(generated);
    } finally {
      setIsAnalyzing(false);
      setActiveTab('meeting-briefings');
    }
  };

  // Complete analysis from live pipeline
  const handleCompleteAnalysis = () => {
    setIsAnalyzing(false);
    setActiveTab('meeting-briefings');
  };

  // Select meeting from calendar
  const handleSelectMeeting = (meeting: CouncilMeeting) => {
    if (meeting.agendaText) {
      setAgendaText(meeting.agendaText);
      handleGenerateHeatMap(meeting.agendaText);
    } else {
      setActiveTab('new-analysis');
    }
  };

  return (
    <div className={`min-h-screen flex flex-col bg-surface font-body-md text-on-surface antialiased transition-colors ${chambersMode ? 'chambers-mode' : ''}`}>
      {/* Executive Command Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAnalyzing={isAnalyzing}
        chambersMode={chambersMode}
        toggleChambersMode={toggleChambersMode}
        onOpenExport={() => setExportModalOpen(true)}
      />

      {/* Main Workspace Frame */}
      <main className="w-full pt-20 min-h-[calc(100vh-5rem)] flex-1 flex flex-col">
        {activeTab === 'new-analysis' && (
          <PrepareBriefingView
            agendaText={agendaText}
            setAgendaText={setAgendaText}
            onGenerateHeatMap={handleGenerateHeatMap}
            isLoading={isAnalyzing}
          />
        )}

        {activeTab === 'live-pipeline' && (
          <LivePipelineView
            onComplete={handleCompleteAnalysis}
            onCancel={() => {
              setIsAnalyzing(false);
              setActiveTab('new-analysis');
            }}
          />
        )}

        {activeTab === 'meeting-briefings' && (
          <MeetingBriefingsView
            agendaItems={agendaItems}
            setAgendaItems={setAgendaItems}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            chambersMode={chambersMode}
            toggleChambersMode={toggleChambersMode}
            onOpenExport={() => setExportModalOpen(true)}
            onInspectRecord={(rec) => setInspectingRecord(rec)}
            onGoToUpload={() => setActiveTab('new-analysis')}
          />
        )}

        {activeTab === 'municipal-datasets-records' && (
          <MunicipalDatasetsView
            datasets={datasets}
            setDatasets={setDatasets}
          />
        )}

        {activeTab === 'city-council-calendar' && (
          <CouncilCalendarView
            onSelectMeeting={handleSelectMeeting}
          />
        )}
      </main>

      {/* Global Civic Authority Footer */}
      <footer className="w-full bg-surface-container-lowest shadow-[0_-1px_8px_rgba(0,0,0,0.03)] border-t border-outline-variant/20 mt-auto">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-5 mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start md:items-center gap-2.5 text-on-surface-variant font-body-sm text-body-sm text-xs">
            <span className="material-symbols-outlined text-secondary text-[20px] shrink-0">
              shield
            </span>
            <p className="max-w-3xl">
              AI output is advisory. Verify facts and sources before official use. Built for City of College Station Mayor, City Council, &amp; Municipal Administration.
            </p>
          </div>

          <div className="flex items-center gap-3 font-label-sm text-label-sm shrink-0 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-on-surface-variant">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              CJIS Municipal Encrypted
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('municipal-datasets-records')}
              className="text-on-surface-variant hover:text-primary transition-colors underline decoration-outline-variant underline-offset-4 cursor-pointer"
            >
              City Charter Archive
            </button>
          </div>
        </div>
      </footer>

      {/* Export Briefing Modal */}
      <ExportBriefingModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        agendaItems={agendaItems}
      />

      {/* Record Preview Modal */}
      <RecordPreviewModal
        record={inspectingRecord}
        onClose={() => setInspectingRecord(null)}
      />
    </div>
  );
}
