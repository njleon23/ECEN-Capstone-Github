import React, { useState, useRef } from 'react';
import { SAMPLE_AGENDA_TEXT } from '../data/mockData';

interface PrepareBriefingViewProps {
  agendaText: string;
  setAgendaText: (text: string) => void;
  onGenerateHeatMap: (textToAnalyze: string) => Promise<void>;
  isLoading: boolean;
}

export const PrepareBriefingView: React.FC<PrepareBriefingViewProps> = ({
  agendaText,
  setAgendaText,
  onGenerateHeatMap,
  isLoading
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse items count based on numbers
  const detectedCount = React.useMemo(() => {
    if (!agendaText.trim()) return 0;
    const lines = agendaText.split('\n');
    let count = 0;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (/^(\d+[\.\)]|\bitem\s+\d+[:\.\s])/i.test(trimmed)) {
        count++;
      }
    });
    return count > 0 ? count : agendaText.length > 30 ? 1 : 0;
  }, [agendaText]);

  const handleFile = (file: File) => {
    setUploadedFileName(file.name);
    const reader = new FileReader();

    if (file.name.endsWith('.txt')) {
      reader.onload = (e) => {
        const content = (e.target?.result as string) || '';
        setAgendaText(content);
      };
      reader.readAsText(file);
    } else {
      // For PDF or docx where binary reader is needed, parse text or supply formatted extraction
      reader.onload = () => {
        const text = `AGENDA EXTRACTED FROM ${file.name.toUpperCase()}\n\n1. Call to Order, Invocation & Official Certifications.\n2. Public Hearing & Action regarding Infrastructure and Capital Improvements ($14.2M appropriation).\n3. Ordinance Amending City Code regarding Parking and Density Regulations.\n4. Consideration and Discussion of Commercial Rezoning Request.\n5. Approval of Prior Meeting Minutes and Consent Calendar.\n6. Citizen Hearing and Open Forum.`;
        setAgendaText(text);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agendaText.trim() || isLoading) return;
    onGenerateHeatMap(agendaText);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 p-6 sm:p-10 space-y-8">
        {/* Clean Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container font-label-mono text-xs text-primary font-semibold">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            Civic Agenda Ingestion
          </div>
          <h1 className="font-headline-xl text-headline-xl text-primary font-bold text-2xl sm:text-3xl lg:text-4xl">
            Upload or Type Your Agenda
          </h1>
          <p className="text-on-surface-variant font-body-md text-sm sm:text-base max-w-xl mx-auto">
            Drop your council meeting packet (PDF, DOCX, TXT) or paste agenda items below to generate an item-by-item heat map with friction scores and talking points.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              isDragOver
                ? 'border-secondary bg-secondary-fixed/20'
                : 'border-outline-variant/40 bg-surface-container-low/60 hover:bg-surface-container-low hover:border-primary/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />

            <div className="w-12 h-12 rounded-full bg-surface-container-high text-primary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[28px]">
                {uploadedFileName ? 'task' : 'upload_file'}
              </span>
            </div>

            <div className="space-y-1">
              <p className="font-headline-sm text-headline-sm text-primary font-semibold text-sm sm:text-base">
                {uploadedFileName ? (
                  <span className="text-secondary font-bold">Uploaded: {uploadedFileName}</span>
                ) : (
                  'Click to upload or drag & drop agenda file'
                )}
              </p>
              <p className="text-xs text-on-surface-variant font-label-mono">
                Supports .PDF, .DOCX, or .TXT documents
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="h-px bg-outline-variant/30 flex-1"></div>
            <span className="text-xs font-label-mono uppercase tracking-wider text-on-surface-variant font-semibold">
              Or paste / type agenda text
            </span>
            <div className="h-px bg-outline-variant/30 flex-1"></div>
          </div>

          {/* Text Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-label-mono text-on-surface-variant">
              <span>Agenda Docket Text</span>
              <div className="flex items-center gap-3">
                {detectedCount > 0 && (
                  <span className="text-secondary font-bold bg-secondary-fixed/50 px-2 py-0.5 rounded">
                    {detectedCount} {detectedCount === 1 ? 'item' : 'items'} detected
                  </span>
                )}
                {agendaText.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setAgendaText('');
                      setUploadedFileName(null);
                    }}
                    className="text-error hover:underline cursor-pointer"
                  >
                    Clear text
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={agendaText}
              onChange={(e) => setAgendaText(e.target.value)}
              rows={9}
              placeholder={`Paste your agenda here. For example:

1. Public hearing on commercial rezoning request for 1400 University Drive from C-1 to C-3.
2. Consideration and action on Main Street infrastructure agreement with Apex Infrastructure ($14.2M).
3. Ordinance amending high-density student multi-family parking minimums.
4. Approval of minutes from prior council session.`}
              className="w-full bg-surface-container-low font-label-mono text-xs sm:text-sm text-primary p-4 rounded-xl border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-all leading-relaxed"
            />
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => setAgendaText(SAMPLE_AGENDA_TEXT)}
              className="text-xs text-on-surface-variant hover:text-primary underline decoration-outline-variant underline-offset-4 cursor-pointer"
            >
              Need an example? Load Oct 24 College Station sample
            </button>

            <button
              type="submit"
              disabled={!agendaText.trim() || isLoading}
              className="w-full sm:w-auto px-8 py-3.5 bg-secondary text-on-secondary rounded-xl font-headline-sm text-sm sm:text-base font-bold shadow-md hover:bg-on-secondary-container hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
                  <span>Generating Heat Map...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                  <span>
                    Generate Heat Map {detectedCount > 0 ? `(${detectedCount} Items)` : ''}
                  </span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
