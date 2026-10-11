/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DatabaseStatus } from '../types/database';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  status: DatabaseStatus | null;
  onNewScratchpad: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  status,
  onNewScratchpad,
}) => {
  const navItems = [
    { id: 'explorer', label: 'Repository Explorer' },
    { id: 'lmstudio', label: 'LM Studio & Gemma 12B' },
    { id: 'relational', label: 'Three-Table Layout' },
    { id: 'scratchpad', label: 'Scratchpad Upsert' },
    { id: 'blueprint', label: 'Schema Blueprint' },
    { id: 'helpers', label: 'Deployable Helpers' },
    { id: 'console', label: 'SQL & Benchmarks' },
  ];

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur sticky top-0 z-40 px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark (single line, no adjacent subtitle pills) */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700/60 flex items-center justify-center text-amber-400 font-mono font-bold text-sm shadow-inner">
            F5
          </div>
          <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
            SQLite FTS5 Scratchpad
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`transition-colors whitespace-nowrap py-1 relative cursor-pointer ${
                  isActive
                    ? 'text-amber-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action button & Coexistence Indicators */}
        <div className="flex items-center gap-4 shrink-0">
          {status && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 tabular-nums font-mono">
              <span>{status.docCount} docs</span>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <span className="text-cyan-300 font-medium">{status.tagsCount || 29} tags</span>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <span>32MB Cache</span>
              <span aria-hidden="true" className="text-slate-700">·</span>
              <span className="text-emerald-400 font-semibold">WAL</span>
            </div>
          )}
          <button
            onClick={onNewScratchpad}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 rounded-md transition-colors whitespace-nowrap shadow-sm cursor-pointer"
          >
            New Document
          </button>
        </div>
      </div>
    </header>
  );
};
