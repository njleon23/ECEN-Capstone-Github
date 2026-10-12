import React, { useState } from 'react';
import { CIVIC_LOGO_URL } from '../data/mockData';

interface HeaderProps {
  activeTab: 'new-analysis' | 'live-pipeline' | 'meeting-briefings' | 'municipal-datasets-records' | 'city-council-calendar';
  setActiveTab: (tab: 'new-analysis' | 'live-pipeline' | 'meeting-briefings' | 'municipal-datasets-records' | 'city-council-calendar') => void;
  isAnalyzing: boolean;
  chambersMode: boolean;
  toggleChambersMode: () => void;
  onOpenExport: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isAnalyzing,
  chambersMode,
  toggleChambersMode,
  onOpenExport
}) => {
  const [logoError, setLogoError] = useState(false);
  const [currentRole, setCurrentRole] = useState<'City Manager Office' | 'Mayor Nichols' | 'Councilmember Place 4'>('City Manager Office');
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/20 transition-colors">
      <div className="h-20 w-full px-4 sm:px-6 lg:px-8 mx-auto flex items-center justify-between gap-4">
        {/* Brand Lockup */}
        <div
          onClick={() => setActiveTab('meeting-briefings')}
          className="flex items-center gap-3 shrink-0 cursor-pointer group"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setActiveTab('meeting-briefings')}
        >
          {!logoError ? (
            <img
              alt="Agenda Heat Check Civic Logo"
              className="h-9 w-auto object-contain transition-transform group-hover:scale-105"
              src={CIVIC_LOGO_URL}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-primary text-secondary flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-secondary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                <circle cx="16" cy="16" r="3" fill="#DC2626" />
              </svg>
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-primary tracking-tight font-bold">
              Agenda Heat Check
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">
              City of College Station • Executive Council Intelligence
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav
          className="hidden md:flex items-center gap-1 p-1 bg-surface-container-low rounded-lg"
          aria-label="Executive Navigation"
        >
          <button
            onClick={() => setActiveTab('new-analysis')}
            className={`px-3.5 py-1.5 rounded transition-all text-xs sm:text-sm font-medium cursor-pointer ${
              activeTab === 'new-analysis'
                ? 'bg-surface-container text-primary font-bold shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Upload / Type Agenda
          </button>

          {isAnalyzing && (
            <button
              onClick={() => setActiveTab('live-pipeline')}
              className={`px-3.5 py-1.5 rounded transition-all text-xs sm:text-sm font-medium flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'live-pipeline'
                  ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                  : 'text-secondary hover:bg-secondary-fixed/50'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-error animate-ping"></span>
              <span>Analyzing...</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('meeting-briefings')}
            className={`px-3.5 py-1.5 rounded transition-all text-xs sm:text-sm font-medium cursor-pointer ${
              activeTab === 'meeting-briefings'
                ? 'bg-surface-container text-primary font-bold shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Heat Map Dossiers
          </button>

          <button
            onClick={() => setActiveTab('municipal-datasets-records')}
            className={`px-3.5 py-1.5 rounded transition-all text-xs sm:text-sm font-medium cursor-pointer ${
              activeTab === 'municipal-datasets-records'
                ? 'bg-surface-container text-primary font-bold shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Records
          </button>

          <button
            onClick={() => setActiveTab('city-council-calendar')}
            className={`px-3.5 py-1.5 rounded transition-all text-xs sm:text-sm font-medium cursor-pointer ${
              activeTab === 'city-council-calendar'
                ? 'bg-surface-container text-primary font-bold shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Calendar
          </button>
        </nav>

        {/* Right Action Ribbon */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden 2xl:flex items-center gap-2 px-3 py-1 bg-surface-container-high rounded text-on-surface-variant font-label-sm text-label-sm">
            <span className="w-2 h-2 rounded-full bg-secondary shrink-0 animate-pulse"></span>
            <span>Upcoming: Regular Meeting – Oct 24, 2024</span>
          </div>

          {/* Role & Dais Mode Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="hidden lg:flex flex-col text-right px-2 py-0.5 border-r border-outline-variant/30 pr-3 hover:opacity-80 transition-opacity text-left"
              title="Click to switch Council Role"
            >
              <span className="font-label-md text-label-md text-on-surface font-semibold flex items-center justify-end gap-1">
                {currentRole}
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_drop_down</span>
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant text-[11px]">
                {chambersMode ? 'Chambers Dark Mode Active' : 'Chambers Standard Mode'}
              </span>
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl py-2 z-50">
                <div className="px-3 py-1.5 text-xs text-on-surface-variant font-label-mono uppercase tracking-wider border-b border-outline-variant/20">
                  Switch Active Dais View
                </div>
                {(['City Manager Office', 'Mayor Nichols', 'Councilmember Place 4'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => {
                      setCurrentRole(role);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-surface-container transition-colors ${
                      currentRole === role ? 'font-bold text-secondary bg-surface-container-low' : 'text-on-surface'
                    }`}
                  >
                    <span>{role}</span>
                    {currentRole === role && <span className="material-symbols-outlined text-[16px]">check</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Chambers Mode button */}
          <button
            onClick={toggleChambersMode}
            className={`p-2 rounded-lg transition-colors border ${
              chambersMode
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/30'
            }`}
            title="Toggle Low-Light Chambers Mode (Dais Display)"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">contrast</span>
          </button>

          {/* Export Briefing Pack Button */}
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-secondary text-on-secondary rounded font-label-md text-label-md hover:bg-on-secondary-container transition-colors shadow-xs active:scale-[0.98]"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span className="hidden sm:inline">Export Briefing Pack</span>
            <span className="sm:hidden">Export</span>
          </button>

          {/* User Avatar */}
          <div
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 cursor-pointer shadow-xs hover:ring-2 hover:ring-secondary/40 transition-all"
            title="Dais Profile"
          >
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>
    </header>
  );
};
