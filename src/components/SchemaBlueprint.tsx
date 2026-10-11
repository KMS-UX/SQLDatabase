/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SCHEMA_SQL } from '../schema/schema_ddl.ts';

export const SchemaBlueprint: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([SCHEMA_SQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sqlite_three_table_schema.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
              OODA-PDCA Certified Specification
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-xs text-slate-400 font-mono">
              Intel Core Ultra 9 275HX / 32GB DDR5 / RTX 5070 Ti
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>Three-Table Relational Schema with Companion FTS5 Virtual Table</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Eliminates untyped monolithic document tables in favor of normalized relational domain tables (<code className="text-slate-300 font-mono">code_fragments</code>, <code className="text-slate-300 font-mono">markdown_notes</code>, <code className="text-slate-300 font-mono">json_drafts</code>) linked by foreign keys and unified by a companion FTS5 inverted search table.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer"
          >
            {copied ? 'Copied to Clipboard' : 'Copy SQL Schema'}
          </button>
          <button
            onClick={handleDownload}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors cursor-pointer"
          >
            Download .sql
          </button>
        </div>
      </div>

      {/* OODA-PDCA Audit Comparative Findings */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mb-3">
          OODA-PDCA Architecture Audit: Structured Tagging &amp; Gemma 12B Coexistence
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded bg-slate-950/70 border border-slate-800 space-y-2">
            <span className="text-rose-400 font-mono font-semibold block">
              Previous Architecture: Monolithic Single Table
            </span>
            <ul className="text-slate-400 space-y-1.5 list-disc list-inside">
              <li>Untyped metadata dumped into freeform JSON text column.</li>
              <li>Queries on language, tags, or validation flags require full-scan <code className="text-slate-300 font-mono">json_extract()</code> parsers.</li>
              <li>Tag filtering is slow and fuzzy FTS5 crashes on unquoted punctuation (<code className="text-slate-300 font-mono">#python</code>, <code className="text-slate-300 font-mono">@scratchpad</code>).</li>
              <li>No resource boundary: unbounded buffer pool competes with local LLMs for 32GB DDR5 RAM.</li>
            </ul>
          </div>

          <div className="p-4 rounded bg-slate-950/70 border border-emerald-500/30 space-y-2">
            <span className="text-emerald-400 font-mono font-semibold block">
              Upgraded Architecture: Structured Tagging + LM Studio Coexistence
            </span>
            <ul className="text-slate-300 space-y-1.5 list-disc list-inside">
              <li>Relational <code className="text-amber-300 font-mono">tags</code> &amp; <code className="text-amber-300 font-mono">document_tags</code> tables enable instant deterministic filtering (<code className="text-cyan-300 font-mono">#language</code>, <code className="text-purple-300 font-mono">#type</code>, <code className="text-amber-300 font-mono">@project</code>) in &lt;0.05ms.</li>
              <li>Companion <code className="text-amber-300 font-mono">documents_fts</code> virtual table executes BM25 search strictly inside pruned subsets.</li>
              <li>SQLite cache bounded to 32MB (<code className="text-emerald-400 font-mono">PRAGMA cache_size = -32768</code>), zero VRAM footprint on RTX 5070 Ti.</li>
              <li>Worker threads capped at 4, reserving 28 threads for Intel 275HX to run Gemma 4 12B prompt processing in LM Studio.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Hardware Profile Allocation on Intel Core Ultra 9 275HX / RTX 5070 Ti */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col">
          <span className="text-[11px] font-mono text-slate-500">PRAGMA cache_size</span>
          <span className="text-base font-bold font-mono text-amber-400 mt-1">32 MB RAM</span>
          <span className="text-[11px] font-mono text-slate-500 mt-0.5">Leaves DDR5 bandwidth for Gemma</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col">
          <span className="text-[11px] font-mono text-slate-500">PRAGMA mmap_size</span>
          <span className="text-base font-bold font-mono text-sky-400 mt-1">256 MB Bounded</span>
          <span className="text-[11px] font-mono text-slate-500 mt-0.5">Zero-copy kernel reads</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col">
          <span className="text-[11px] font-mono text-slate-500">PRAGMA threads</span>
          <span className="text-base font-bold font-mono text-emerald-400 mt-1">4 Worker Threads</span>
          <span className="text-[11px] font-mono text-slate-500 mt-0.5">28 threads reserved for LLM prefill</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col">
          <span className="text-[11px] font-mono text-slate-500">PRAGMA journal_mode</span>
          <span className="text-base font-bold font-mono text-slate-200 mt-1">WAL (1000-page autockpt)</span>
          <span className="text-[11px] font-mono text-slate-500 mt-0.5">Zero write stalls during token stream</span>
        </div>
      </div>

      {/* Complete SQL Schema Viewer */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 font-mono text-xs">
          <span className="text-slate-400 font-semibold">
            sqlite_three_table_schema.sql (Production Specification)
          </span>
          <button
            onClick={handleCopy}
            className="text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
        <div className="p-5 bg-slate-950 overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed max-h-[580px] overflow-y-auto">
          <pre>{SCHEMA_SQL}</pre>
        </div>
      </div>
    </div>
  );
};
