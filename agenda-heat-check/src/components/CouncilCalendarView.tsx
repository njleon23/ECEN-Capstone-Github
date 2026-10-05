import React from 'react';
import { COUNCIL_CALENDAR } from '../data/mockData';
import { CouncilMeeting } from '../types';

interface CouncilCalendarViewProps {
  onSelectMeeting: (meeting: CouncilMeeting) => void;
}

export const CouncilCalendarView: React.FC<CouncilCalendarViewProps> = ({
  onSelectMeeting
}) => {
  return (
    <div className="flex flex-col w-full px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2 font-label-mono text-label-mono text-on-surface-variant text-xs uppercase tracking-wider">
            <span className="material-symbols-outlined text-[16px] text-secondary">calendar_month</span>
            <span>City Council Legislative Schedule</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-primary font-bold text-2xl sm:text-3xl mt-1">
            College Station City Council Calendar
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant text-sm mt-1">
            Upcoming regular meetings, special workshops, and joint Planning &amp; Zoning hearings with automated briefing readiness.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container font-label-mono text-xs text-on-surface font-semibold border border-outline-variant/20">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
            Fiscal Year 2024–2025 Active
          </span>
        </div>
      </div>

      {/* Calendar List */}
      <div className="grid grid-cols-1 gap-4">
        {COUNCIL_CALENDAR.map((meeting) => {
          const isReady = meeting.status === 'Ready';

          return (
            <div
              key={meeting.id}
              className={`p-6 rounded-xl border transition-all ${
                isReady
                  ? 'bg-surface-container-lowest border-secondary/40 shadow-xs ring-1 ring-secondary/20'
                  : 'bg-surface-container-lowest border-outline-variant/25 hover:border-outline-variant/40'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-label-mono text-xs font-bold text-secondary uppercase tracking-wider">
                      {meeting.date} • {meeting.time}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-label-mono text-[11px] font-semibold ${
                        isReady
                          ? 'bg-[#ecfdf5] text-[#059669]'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {isReady ? 'Briefing Ready' : meeting.status}
                    </span>
                  </div>

                  <h3 className="font-headline-md text-headline-md text-primary font-bold text-lg sm:text-xl">
                    {meeting.title}
                  </h3>

                  <p className="font-body-sm text-body-sm text-on-surface-variant text-xs sm:text-sm flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-surface-tint">location_on</span>
                    {meeting.location}
                  </p>
                </div>

                {/* Telemetry pill & Actions */}
                <div className="flex items-center flex-wrap gap-4 shrink-0">
                  <div className="flex items-center gap-2 bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant/20 font-label-mono text-xs text-on-surface-variant">
                    <span className="font-bold text-primary">{meeting.docketCount} Dockets</span>
                    <span>•</span>
                    <span className="text-error font-semibold">{meeting.criticalCount} Critical</span>
                    <span>•</span>
                    <span className="text-secondary font-semibold">{meeting.moderateCount} Attention</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectMeeting(meeting)}
                    className={`px-4 py-2 rounded-lg font-label-md text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isReady
                        ? 'bg-secondary text-on-secondary hover:bg-on-secondary-container shadow-xs'
                        : 'bg-primary text-on-primary hover:bg-primary-container shadow-xs'
                    }`}
                  >
                    <span>{isReady ? 'View Executive Briefing' : 'Prepare Docket Ingestion'}</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
