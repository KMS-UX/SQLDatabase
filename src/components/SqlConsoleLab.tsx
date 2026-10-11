/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BenchmarkResult, SqlQueryResult } from '../types/database';

interface SqlConsoleLabProps {
  onRefreshDocs: () => void;
}

export const SqlConsoleLab: React.FC<SqlConsoleLabProps> = ({ onRefreshDocs }) => {
  const [sqlQuery, setSqlQuery] = useState(
    `SELECT d.id, d.title, d.path, d.doc_type, d.version,
       snippet(documents_fts, 2, '<mark>', '</mark>', '...', 12) AS snippet,
       bm25(documents_fts, 5.0, 10.0, 1.0, 2.0) AS bm25_score
FROM documents_fts
JOIN documents d ON d.id = documents_fts.rowid
WHERE documents_fts MATCH 'TokenBucket OR rate_limiter OR cluster*'
ORDER BY bm25_score ASC
LIMIT 10;`
  );

  const [isRunning, setIsRunning] = useState(false);
  const [queryResult, setQueryResult] = useState<SqlQueryResult | null>(null);

  // Benchmarking state
  const [benchCount, setBenchCount] = useState<number>(100);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchResult, setBenchResult] = useState<BenchmarkResult | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const PRESETS = [
    {
      label: 'FTS5 BM25 Weighted Search',
      sql: `SELECT d.id, d.title, d.path, d.doc_type,
       snippet(documents_fts, 2, '<mark>', '</mark>', '...', 12) AS snippet,
       bm25(documents_fts, 5.0, 10.0, 1.0, 2.0) AS bm25_score
FROM documents_fts
JOIN documents d ON d.id = documents_fts.rowid
WHERE documents_fts MATCH 'TokenBucket OR rate_limiter OR cluster*'
ORDER BY bm25_score ASC
LIMIT 10;`,
    },
    {
      label: 'EXPLAIN QUERY PLAN: FTS5 MATCH',
      sql: `EXPLAIN QUERY PLAN
SELECT d.title, snippet(documents_fts, 2, '<mark>', '</mark>', '...', 10)
FROM documents_fts
JOIN documents d ON d.id = documents_fts.rowid
WHERE documents_fts MATCH 'auth_token';`,
    },
    {
      label: 'EXPLAIN QUERY PLAN: B-Tree Path Scan',
      sql: `EXPLAIN QUERY PLAN
SELECT * FROM documents WHERE path = 'src/middleware/rate_limiter.ts';`,
    },
    {
      label: 'Taxonomy Aggregate & Byte Distribution',
      sql: `SELECT doc_type, COUNT(*) AS count, SUM(byte_size) AS total_bytes,
       ROUND(AVG(byte_size), 1) AS avg_bytes, MAX(version) AS max_version
FROM documents
GROUP BY doc_type;`,
    },
    {
      label: 'PRAGMA Integrity & WAL Status',
      sql: `PRAGMA journal_mode;
PRAGMA synchronous;
PRAGMA page_count;
PRAGMA freelist_count;`,
    },
    {
      label: 'Recent Modification Log',
      sql: `SELECT id, title, path, version, content_hash,
       datetime(updated_at, 'unixepoch') AS last_modified
FROM documents
ORDER BY updated_at DESC
LIMIT 10;`,
    },
  ];

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) return;
    setIsRunning(true);
    setQueryResult(null);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlQuery.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setQueryResult({
          rows: [],
          columns: [],
          rowCount: 0,
          latencyMs: data.latencyMs || 0,
          error: data.error || 'Execution failed',
        });
      } else {
        setQueryResult(data);
      }
    } catch (err: any) {
      setQueryResult({
        rows: [],
        columns: [],
        rowCount: 0,
        latencyMs: 0,
        error: err.message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchResult(null);

    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: benchCount }),
      });

      const data = await res.json();
      if (res.ok) {
        setBenchResult(data);
        onRefreshDocs();
      }
    } catch (err: any) {
      console.error('Benchmark failed:', err);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleSeedReset = async () => {
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      if (res.ok) {
        setSeedMsg('Demo documents successfully restored.');
        onRefreshDocs();
        setTimeout(() => setSeedMsg(null), 3000);
      }
    } catch (err: any) {
      setSeedMsg(`Seed error: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>SQL Execution Console &amp; Synchronous FTS5 Stress Benchmarks</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Execute arbitrary SQL, inspect EXPLAIN QUERY PLAN execution pipelines, and run synchronous upsert stress tests to measure indexing throughput and search response times.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {seedMsg && (
            <span className="text-xs text-emerald-400 font-mono">{seedMsg}</span>
          )}
          <button
            onClick={handleSeedReset}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer"
          >
            Re-seed Initial Data
          </button>
        </div>
      </div>

      {/* SQL Editor Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col gap-4">
        {/* Presets Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-500">Query Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setSqlQuery(p.sql)}
              className="px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-amber-300 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* SQL Input Area */}
        <div className="relative">
          <textarea
            rows={7}
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            placeholder="Write arbitrary SQL (e.g. SELECT * FROM documents_fts WHERE documents_fts MATCH 'keyword')..."
            className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 resize-y leading-relaxed"
          />
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-slate-500">
            Target Engine: SQLite 3.45+ (FTS5 Enabled)
          </span>

          <button
            onClick={handleExecuteSql}
            disabled={isRunning}
            className="px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-50 rounded-md transition-colors cursor-pointer shadow-sm flex items-center gap-2"
          >
            {isRunning ? 'Executing SQL...' : 'Run SQL Query'}
          </button>
        </div>

        {/* Query Results Display */}
        {queryResult && (
          <div className="mt-2 pt-4 border-t border-slate-800/80 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">
                {queryResult.error ? (
                  <span className="text-rose-400 font-semibold">Execution Error</span>
                ) : (
                  <span>
                    Returned {queryResult.rowCount} {queryResult.rowCount === 1 ? 'row' : 'rows'}
                  </span>
                )}
              </span>
              <span className="text-slate-400 tabular-nums">
                Latency: {queryResult.latencyMs} ms
              </span>
            </div>

            {queryResult.error ? (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 font-mono text-xs">
                {queryResult.error}
              </div>
            ) : queryResult.rows.length === 0 ? (
              <div className="p-4 bg-slate-950 rounded border border-slate-800/80 text-center text-slate-500 text-xs font-mono">
                Query executed successfully. 0 rows returned.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-800 rounded-md bg-slate-950">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 sticky top-0">
                      {queryResult.columns.map((col) => (
                        <th key={col} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {queryResult.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                        {queryResult.columns.map((col) => {
                          const val = row[col];
                          const strVal =
                            typeof val === 'object' && val !== null
                              ? JSON.stringify(val)
                              : String(val ?? '');
                          return (
                            <td
                              key={col}
                              className="py-2 px-3 whitespace-nowrap max-w-md truncate"
                              title={strVal}
                            >
                              {col.includes('snippet') ? (
                                <span dangerouslySetInnerHTML={{ __html: strVal }} />
                              ) : (
                                strVal
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stress Benchmark Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Synchronous Upsert &amp; FTS5 Indexing Stress Benchmark</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Measures real-time SQLite write throughput while synchronously generating inverted indexes on each commit.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-slate-400">Batch Size:</span>
            {[50, 100, 250].map((num) => (
              <button
                key={num}
                onClick={() => setBenchCount(num)}
                className={`px-2.5 py-1 text-xs font-mono rounded cursor-pointer transition-colors ${
                  benchCount === num
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                {num}
              </button>
            ))}

            <button
              onClick={handleRunBenchmark}
              disabled={isBenchmarking}
              className="ml-2 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded transition-colors cursor-pointer"
            >
              {isBenchmarking ? 'Running Benchmark...' : 'Run Benchmark'}
            </button>
          </div>
        </div>

        {/* Benchmark Results Display */}
        {benchResult && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80">
            <div className="bg-slate-950 p-3.5 rounded border border-slate-800 flex flex-col">
              <span className="text-xs text-slate-500 font-mono">Total Elapsed</span>
              <span className="text-base font-bold text-slate-100 font-mono tabular-nums mt-1">
                {benchResult.totalTimeMs} ms
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                {benchResult.upsertCount} documents
              </span>
            </div>

            <div className="bg-slate-950 p-3.5 rounded border border-slate-800 flex flex-col">
              <span className="text-xs text-slate-500 font-mono">Avg Upsert Latency</span>
              <span className="text-base font-bold text-amber-400 font-mono tabular-nums mt-1">
                {benchResult.avgUpsertTimeMs} ms
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                per atomic write &amp; sync
              </span>
            </div>

            <div className="bg-slate-950 p-3.5 rounded border border-slate-800 flex flex-col">
              <span className="text-xs text-slate-500 font-mono">Write Throughput</span>
              <span className="text-base font-bold text-emerald-400 font-mono tabular-nums mt-1">
                {benchResult.opsPerSec} ops/sec
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                synchronous FTS5 indexing
              </span>
            </div>

            <div className="bg-slate-950 p-3.5 rounded border border-slate-800 flex flex-col">
              <span className="text-xs text-slate-500 font-mono">FTS5 Search Query</span>
              <span className="text-base font-bold text-sky-400 font-mono tabular-nums mt-1">
                {benchResult.searchQueryTimeMs} ms
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                {benchResult.searchResultsCount} matches returned
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
