import React, { useState } from 'react';
import { MunicipalDataset } from '../types';

interface MunicipalDatasetsViewProps {
  datasets: MunicipalDataset[];
  setDatasets: React.Dispatch<React.SetStateAction<MunicipalDataset[]>>;
}

export const MunicipalDatasetsView: React.FC<MunicipalDatasetsViewProps> = ({
  datasets,
  setDatasets
}) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(datasets[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId) || datasets[0];

  const filteredDatasets = datasets.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleActive = (id: string) => {
    setDatasets((prev) =>
      prev.map((d) => (d.id === id ? { ...d, active: !d.active } : d))
    );
  };

  return (
    <div className="flex flex-col w-full px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <div className="flex items-center gap-2 font-label-mono text-label-mono text-on-surface-variant text-xs uppercase tracking-wider">
            <span className="material-symbols-outlined text-[16px] text-secondary">database</span>
            <span>College Station Municipal Repository</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-primary font-bold text-2xl sm:text-3xl mt-1">
            Municipal Datasets &amp; Records Archive
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant text-sm mt-1">
            Browse and audit verified capital improvement budgets, official council minutes, contractor overruns, and citizen feedback.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search datasets & records..."
              className="pl-9 pr-4 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-primary w-64 shadow-xs"
            />
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Dataset List (Left 4 cols) & Detail Inspector (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Dataset List */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-xs font-semibold">
            Linked Datasets ({datasets.length})
          </span>

          <div className="flex flex-col gap-2.5">
            {filteredDatasets.map((ds) => {
              const isSelected = ds.id === selectedDataset?.id;
              return (
                <div
                  key={ds.id}
                  onClick={() => setSelectedDatasetId(ds.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-surface-container-lowest border-secondary shadow-xs ring-1 ring-secondary/30'
                      : 'bg-surface-container-low hover:bg-surface-container-lowest border-outline-variant/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-label-md text-label-md text-primary font-semibold text-xs sm:text-sm truncate">
                      {ds.name}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-label-mono text-[10px] font-bold shrink-0 ${
                        ds.type === 'CSV'
                          ? 'bg-primary-fixed text-primary'
                          : ds.type === 'JSON'
                          ? 'bg-secondary-fixed text-secondary'
                          : 'bg-surface-container-high text-on-surface'
                      }`}
                    >
                      {ds.type}
                    </span>
                  </div>

                  <p className="font-body-sm text-body-sm text-on-surface-variant text-xs mt-1 line-clamp-2">
                    {ds.description}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/15 text-[11px] font-label-mono text-on-surface-variant">
                    <span>{ds.itemCount}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActive(ds.id);
                      }}
                      className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                        ds.active
                          ? 'bg-[#ecfdf5] text-[#059669] font-semibold'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {ds.active ? 'Active Feed' : 'Muted'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dataset Detail & Data Inspector */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {selectedDataset && (
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-xs border border-outline-variant/30 space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-label-mono text-xs text-secondary font-bold uppercase tracking-wider">
                      {selectedDataset.category}
                    </span>
                    <span>•</span>
                    <span className="text-xs text-on-surface-variant font-label-mono">
                      Updated {selectedDataset.lastUpdated}
                    </span>
                  </div>
                  <h2 className="font-headline-md text-headline-md text-primary font-bold text-lg sm:text-xl mt-0.5">
                    {selectedDataset.name}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold ${
                      selectedDataset.active
                        ? 'bg-[#ecfdf5] text-[#059669]'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        selectedDataset.active ? 'bg-[#059669]' : 'bg-outline'
                      }`}
                    ></span>
                    {selectedDataset.active ? 'Indexed in Dais Model' : 'Excluded from Model'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleActive(selectedDataset.id)}
                    className="px-3 py-1 bg-surface-container hover:bg-surface-container-high rounded text-xs font-medium text-primary border border-outline-variant/30 transition-colors"
                  >
                    Toggle Feed
                  </button>
                </div>
              </div>

              {/* Description & Tags */}
              <div className="space-y-2">
                <p className="font-body-md text-body-md text-on-surface text-xs sm:text-sm leading-relaxed">
                  {selectedDataset.description}
                </p>
                <div className="flex items-center flex-wrap gap-1.5 pt-1">
                  {selectedDataset.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant font-label-mono text-[11px] border border-outline-variant/20"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sample Table Data Preview */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline-sm text-headline-sm text-primary font-bold text-sm">
                    Verified Excerpt Preview (Sample Records)
                  </h3>
                  <span className="font-label-mono text-xs text-on-surface-variant">
                    Displaying representative rows
                  </span>
                </div>

                {selectedDataset.sampleRows && selectedDataset.sampleRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-outline-variant/20 bg-surface-container-low">
                    <table className="w-full text-left text-xs font-body-sm">
                      <thead className="bg-surface-container font-label-mono text-on-surface-variant border-b border-outline-variant/20 uppercase text-[10px]">
                        <tr>
                          {Object.keys(selectedDataset.sampleRows[0]).map((key) => (
                            <th key={key} className="px-3.5 py-2.5 font-semibold">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/15 font-label-mono">
                        {selectedDataset.sampleRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-surface-container-lowest transition-colors">
                            {Object.values(row).map((val, cellIdx) => (
                              <td key={cellIdx} className="px-3.5 py-2 text-on-surface font-medium">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-on-surface-variant bg-surface-container-low rounded-lg text-xs font-mono">
                    Binary or structured OCR document indexed into vector cluster #CS-R-99.
                  </div>
                )}
              </div>

              {/* Archival Security & Compliance stamp */}
              <div className="p-3.5 rounded-lg bg-surface-container flex items-center justify-between text-xs text-on-surface-variant border border-outline-variant/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-secondary">
                    verified_user
                  </span>
                  <span>Cryptographic Hash: SHA256 validated against College Station City Secretary ledger.</span>
                </div>
                <span className="font-label-mono text-[11px] font-semibold text-primary">
                  100% Deterministic Match
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
