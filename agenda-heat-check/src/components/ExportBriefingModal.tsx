import React, { useState } from 'react';
import { AgendaItem } from '../types';

interface ExportBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  agendaItems: AgendaItem[];
}

export const ExportBriefingModal: React.FC<ExportBriefingModalProps> = ({
  isOpen,
  onClose,
  agendaItems
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const criticalCount = agendaItems.filter((i) => i.heatTier === 'critical').length;
  const moderateCount = agendaItems.filter((i) => i.heatTier === 'moderate').length;
  const calmCount = agendaItems.filter((i) => i.heatTier === 'calm').length;

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const text = `CITY OF COLLEGE STATION - EXECUTIVE COUNCIL BRIEFING
SESSION #2024-21 • OCTOBER 24, 2024
8 Total Legislative Items Evaluated (${criticalCount} Critical, ${moderateCount} Moderate, ${calmCount} Calm)

TOP PRIORITY BRIEFINGS:
${agendaItems
  .slice(0, 3)
  .map(
    (item) => `
[${item.heatTier.toUpperCase()} • ${item.heatScore}/100] ${item.title}
Confidence: ${item.confidence}% | Docket: ${item.docketCode}
Status: ${item.status}
${
  item.primaryDrivers && item.primaryDrivers.length > 0
    ? `Drivers:\n${item.primaryDrivers.map((d) => `  - ${d}`).join('\n')}`
    : ''
}
${
  item.daisTalkingPoints && item.daisTalkingPoints.length > 0
    ? `Talking Points:\n${item.daisTalkingPoints.map((tp) => `  * ${tp}`).join('\n')}`
    : ''
}
`
  )
  .join('\n----------------------------------------\n')}

Grounded in College Station City Secretary official archive & CJIS compliant cluster.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/60 backdrop-blur-xs">
      <div className="bg-surface-container-lowest w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-outline-variant/40 flex flex-col overflow-hidden animate-scale-up">
        {/* Modal Header */}
        <div className="p-5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-secondary text-on-secondary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[20px]">description</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-primary font-bold text-base sm:text-lg">
                Official Council Briefing Pack
              </h2>
              <span className="font-label-mono text-xs text-on-surface-variant">
                City of College Station • Session #2024-21 Dossier
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-xs font-semibold flex items-center gap-1 transition-colors border border-outline-variant/30 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied ? 'check' : 'content_copy'}
              </span>
              <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs hover:bg-on-secondary-container cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print Briefing</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors ml-1"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Document Body */}
        <div className="p-6 overflow-y-auto space-y-6 font-body-sm text-on-surface">
          {/* Document Masthead */}
          <div className="text-center pb-4 border-b border-outline-variant/30 space-y-1">
            <span className="font-label-mono text-xs text-secondary font-bold uppercase tracking-widest">
              Executive Council Briefing Dossier
            </span>
            <h1 className="font-headline-lg text-headline-lg text-primary font-bold text-xl sm:text-2xl">
              Regular Meeting of the College Station City Council
            </h1>
            <p className="font-label-mono text-xs text-on-surface-variant">
              October 24, 2024 • 6:00 PM • Council Chambers, 1101 Texas Avenue
            </p>
          </div>

          {/* Executive Overview Stats */}
          <div className="grid grid-cols-3 gap-3 text-center font-label-mono text-xs">
            <div className="p-3 rounded-lg bg-error-container text-on-error-container border border-error/30">
              <span className="text-[10px] block uppercase font-medium">Critical Attention</span>
              <span className="text-lg font-bold">{criticalCount} Item</span>
            </div>
            <div className="p-3 rounded-lg bg-secondary-fixed text-on-secondary-fixed-variant border border-secondary/30">
              <span className="text-[10px] block uppercase font-medium">Moderate Debate</span>
              <span className="text-lg font-bold">{moderateCount} Items</span>
            </div>
            <div className="p-3 rounded-lg bg-primary-fixed text-on-primary-fixed-variant border border-primary/30">
              <span className="text-[10px] block uppercase font-medium">Consent Routine</span>
              <span className="text-lg font-bold">{calmCount} Items</span>
            </div>
          </div>

          {/* Agenda Items Dossier Breakdown */}
          <div className="space-y-4">
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold text-sm uppercase tracking-wider pb-1 border-b border-outline-variant/20">
              Legislative Line-Item Friction Analysis
            </h3>

            {agendaItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/50 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-label-mono text-xs font-bold ${
                        item.heatTier === 'critical'
                          ? 'bg-error-container text-on-error-container'
                          : item.heatTier === 'moderate'
                          ? 'bg-secondary-fixed text-on-secondary-fixed'
                          : 'bg-primary-fixed text-on-primary-fixed'
                      }`}
                    >
                      {item.heatTier.toUpperCase()} • {item.heatScore}/100
                    </span>
                    <span className="font-label-mono text-xs text-on-surface-variant font-medium">
                      {item.docketCode}
                    </span>
                  </div>
                  <span className="font-label-mono text-xs text-primary font-semibold">
                    Signoff Status: {item.status}
                  </span>
                </div>

                <h4 className="font-headline-sm text-headline-sm text-primary font-bold text-sm">
                  {item.title}
                </h4>

                {item.primaryDrivers && item.primaryDrivers.length > 0 && (
                  <div className="text-xs space-y-1">
                    <strong className="text-on-surface">Primary Friction Points:</strong>
                    <ul className="list-disc pl-4 space-y-0.5 text-on-surface-variant">
                      {item.primaryDrivers.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.anticipatedQuestions && item.anticipatedQuestions.length > 0 && (
                  <div className="text-xs space-y-1 p-2.5 rounded bg-surface-container border border-outline-variant/20">
                    <strong className="text-primary font-semibold">Anticipated Questions ({item.anticipatedQuestions.length}):</strong>
                    <ol className="list-decimal pl-4 space-y-1 text-on-surface">
                      {item.anticipatedQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {item.daisTalkingPoints && item.daisTalkingPoints.length > 0 && (
                  <div className="p-3 bg-primary-container text-on-primary rounded-lg text-xs space-y-1">
                    <strong className="text-tertiary-fixed">Recommended Dais Talking Points:</strong>
                    <ul className="list-disc pl-4 space-y-1">
                      {item.daisTalkingPoints.map((tp, i) => (
                        <li key={i}>{tp}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Legal Certification Footnote */}
          <div className="pt-4 border-t border-outline-variant/30 flex items-center justify-between text-[11px] font-label-mono text-on-surface-variant">
            <span>Prepared for Mayor John Nichols, City Council, &amp; City Manager Office</span>
            <span>CJIS Certified Encrypted Dais Pack</span>
          </div>
        </div>
      </div>
    </div>
  );
};
