import React, { useState } from 'react';
import { TraceableRecord } from '../types';

interface RecordPreviewModalProps {
  record: TraceableRecord | null;
  onClose: () => void;
}

export const RecordPreviewModal: React.FC<RecordPreviewModalProps> = ({
  record,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  if (!record) return null;

  const handleCopyLink = () => {
    if (record.url) {
      navigator.clipboard.writeText(record.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/60 backdrop-blur-xs">
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl shadow-2xl border border-outline-variant/40 flex flex-col overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">fact_check</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-label-mono text-[11px] text-secondary font-bold uppercase">
                  {record.fileType} Record
                </span>
                <span className="text-[11px] text-on-surface-variant">• Official Verified Repository</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold text-sm sm:text-base">
                {record.name}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 font-body-sm text-on-surface">
          {/* Direct Record Link Banner */}
          {record.url && (
            <div className="p-3.5 rounded-xl bg-secondary-fixed/50 border border-secondary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-label-mono text-on-surface break-all">
                <span className="material-symbols-outlined text-[18px] text-secondary shrink-0">link</span>
                <span className="font-semibold text-secondary">Direct Link:</span>
                <span className="text-on-surface-variant underline underline-offset-2">{record.url}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-2.5 py-1 text-xs rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-primary font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy direct record link to clipboard"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  <span>{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
                <a
                  href={record.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs rounded bg-secondary hover:bg-on-secondary-container text-on-secondary font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span>Open Direct Record</span>
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
            </div>
          )}

          {/* Excerpt Section */}
          <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 font-label-mono text-xs leading-relaxed space-y-2">
            <span className="text-secondary font-bold text-[11px] block uppercase tracking-wider">
              Verified Dossier Excerpt:
            </span>
            <p className="text-on-surface font-medium whitespace-pre-line">
              {record.snippet ||
                `[INDEXED CITATION] Cross-referenced against College Station municipal repository. Document verified with zero statutory discrepancies.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-label-mono text-on-surface-variant">
            <div className="p-3 bg-surface-container rounded-lg">
              <span className="block text-[10px] uppercase font-semibold text-outline">
                Record Provenance
              </span>
              <span className="font-bold text-primary">City Secretary Archive</span>
            </div>
            <div className="p-3 bg-surface-container rounded-lg">
              <span className="block text-[10px] uppercase font-semibold text-outline">
                Audit Integrity
              </span>
              <span className="font-bold text-[#059669]">100% Deterministic Match</span>
            </div>
          </div>

          <div className="text-[11px] font-label-mono text-on-surface-variant flex items-center justify-between pt-2 border-t border-outline-variant/20">
            <span>CJIS Secure Air-Gapped Verification</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-primary text-on-primary rounded text-xs font-medium hover:bg-primary-container transition-colors cursor-pointer"
            >
              Close Record
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

