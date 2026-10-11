/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CodeFragmentRow, MarkdownNoteRow, JsonDraftRow } from '../types/database';

interface RelationalTablesViewProps {
  onSelectForEdit: (doc: any) => void;
}

export const RelationalTablesView: React.FC<RelationalTablesViewProps> = ({ onSelectForEdit }) => {
  const [activeTable, setActiveTable] = useState<'code' | 'markdown' | 'json'>('code');
  const [codeRows, setCodeRows] = useState<CodeFragmentRow[]>([]);
  const [mdRows, setMdRows] = useState<MarkdownNoteRow[]>([]);
  const [jsonRows, setJsonRows] = useState<JsonDraftRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<any | null>(null);

  useEffect(() => {
    fetchTableData();
  }, [activeTable]);

  const fetchTableData = async () => {
    setIsLoading(true);
    try {
      if (activeTable === 'code') {
        const res = await fetch('/api/tables/code');
        if (res.ok) {
          const data = await res.json();
          setCodeRows(data.rows || []);
          if (data.rows?.length > 0) setSelectedRow(data.rows[0]);
        }
      } else if (activeTable === 'markdown') {
        const res = await fetch('/api/tables/markdown');
        if (res.ok) {
          const data = await res.json();
          setMdRows(data.rows || []);
          if (data.rows?.length > 0) setSelectedRow(data.rows[0]);
        }
      } else {
        const res = await fetch('/api/tables/json');
        if (res.ok) {
          const data = await res.json();
          setJsonRows(data.rows || []);
          if (data.rows?.length > 0) setSelectedRow(data.rows[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load table data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
              OODA-PDCA Architecture Audit
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-xs text-slate-400 font-mono">
              Three-Table Relational Schema
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-100">
            Relational Domain Tables &amp; Foreign Key Inspector
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Normalized relational storage separating code fragments, markdown notes, and JSON drafts into typed tables with strict foreign keys (<code className="text-slate-300 font-mono">ON DELETE CASCADE</code>) and synchronous companion FTS5 index triggers.
          </p>
        </div>

        {/* Table Selector Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md shrink-0">
          <button
            onClick={() => setActiveTable('code')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
              activeTable === 'code'
                ? 'bg-slate-800 text-amber-300 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            code_fragments ({codeRows.length})
          </button>
          <button
            onClick={() => setActiveTable('markdown')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
              activeTable === 'markdown'
                ? 'bg-slate-800 text-amber-300 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            markdown_notes ({mdRows.length})
          </button>
          <button
            onClick={() => setActiveTable('json')}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
              activeTable === 'json'
                ? 'bg-slate-800 text-amber-300 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            json_drafts ({jsonRows.length})
          </button>
        </div>
      </div>

      {/* Main Grid: Left Table View / Right Payload Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Table View (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-semibold">
              TABLE {activeTable === 'code' ? 'code_fragments' : activeTable === 'markdown' ? 'markdown_notes' : 'json_drafts'}
            </span>
            <span className="text-slate-500">
              Foreign Key: REFERENCES documents(id) ON DELETE CASCADE
            </span>
          </div>

          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 sticky top-0">
                  <th className="py-2.5 px-3">Doc ID</th>
                  <th className="py-2.5 px-3">Path</th>
                  {activeTable === 'code' && (
                    <>
                      <th className="py-2.5 px-3">Language</th>
                      <th className="py-2.5 px-3">Lines</th>
                    </>
                  )}
                  {activeTable === 'markdown' && (
                    <>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Checklists</th>
                    </>
                  )}
                  {activeTable === 'json' && (
                    <>
                      <th className="py-2.5 px-3">Schema</th>
                      <th className="py-2.5 px-3">Valid</th>
                    </>
                  )}
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {activeTable === 'code' &&
                  codeRows.map((row) => (
                    <tr
                      key={row.document_id}
                      onClick={() => setSelectedRow(row)}
                      className={`hover:bg-slate-800/50 transition-colors cursor-pointer ${
                        selectedRow?.document_id === row.document_id ? 'bg-slate-800/80 text-white' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-amber-300 font-bold tabular-nums">#{row.document_id}</td>
                      <td className="py-2 px-3 truncate max-w-[180px]" title={row.path}>{row.path}</td>
                      <td className="py-2 px-3 text-slate-400">{row.language}</td>
                      <td className="py-2 px-3 tabular-nums">{row.line_count}</td>
                      <td className="py-2 px-3 tabular-nums">{row.byte_size} B</td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectForEdit({ ...row, id: row.document_id, doc_type: 'code' });
                          }}
                          className="text-amber-400 hover:text-amber-300 font-mono text-[11px] cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}

                {activeTable === 'markdown' &&
                  mdRows.map((row) => (
                    <tr
                      key={row.document_id}
                      onClick={() => setSelectedRow(row)}
                      className={`hover:bg-slate-800/50 transition-colors cursor-pointer ${
                        selectedRow?.document_id === row.document_id ? 'bg-slate-800/80 text-white' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-amber-300 font-bold tabular-nums">#{row.document_id}</td>
                      <td className="py-2 px-3 truncate max-w-[180px]" title={row.path}>{row.path}</td>
                      <td className="py-2 px-3 text-slate-400">{row.category}</td>
                      <td className="py-2 px-3 text-slate-400 truncate max-w-[100px]">{row.checklist_summary || 'N/A'}</td>
                      <td className="py-2 px-3 tabular-nums">{row.byte_size} B</td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectForEdit({ ...row, id: row.document_id, doc_type: 'markdown' });
                          }}
                          className="text-amber-400 hover:text-amber-300 font-mono text-[11px] cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}

                {activeTable === 'json' &&
                  jsonRows.map((row) => (
                    <tr
                      key={row.document_id}
                      onClick={() => setSelectedRow(row)}
                      className={`hover:bg-slate-800/50 transition-colors cursor-pointer ${
                        selectedRow?.document_id === row.document_id ? 'bg-slate-800/80 text-white' : ''
                      }`}
                    >
                      <td className="py-2 px-3 text-amber-300 font-bold tabular-nums">#{row.document_id}</td>
                      <td className="py-2 px-3 truncate max-w-[180px]" title={row.path}>{row.path}</td>
                      <td className="py-2 px-3 text-slate-400">{row.schema_version}</td>
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${row.is_valid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {row.is_valid ? 'VALID' : 'INVALID'}
                        </span>
                      </td>
                      <td className="py-2 px-3 tabular-nums">{row.byte_size} B</td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectForEdit({ ...row, id: row.document_id, doc_type: 'json' });
                          }}
                          className="text-amber-400 hover:text-amber-300 font-mono text-[11px] cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Relational Record Inspector (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
              Relational Payload Attributes
            </h3>
            {selectedRow && (
              <span className="text-xs text-amber-400 font-mono">
                Document #{selectedRow.document_id}
              </span>
            )}
          </div>

          {selectedRow ? (
            <div className="space-y-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Title:</span>
                  <span className="text-slate-200 font-sans font-semibold">{selectedRow.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Canonical Path:</span>
                  <span className="text-slate-300 truncate max-w-[200px]">{selectedRow.path}</span>
                </div>
                {activeTable === 'code' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Language:</span>
                      <span className="text-amber-300">{selectedRow.language}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Indexed Symbols:</span>
                      <span className="text-slate-300 truncate max-w-[200px]">{selectedRow.symbols || 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Line Count:</span>
                      <span className="text-slate-200 tabular-nums">{selectedRow.line_count}</span>
                    </div>
                  </>
                )}
                {activeTable === 'markdown' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Category:</span>
                      <span className="text-amber-300">{selectedRow.category}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Checklist State:</span>
                      <span className="text-slate-300">{selectedRow.checklist_summary || 'No tasks'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tags:</span>
                      <span className="text-slate-300">{selectedRow.tags}</span>
                    </div>
                  </>
                )}
                {activeTable === 'json' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Schema Version:</span>
                      <span className="text-amber-300">{selectedRow.schema_version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Root Object Keys:</span>
                      <span className="text-slate-300 truncate max-w-[200px]">{selectedRow.root_keys}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Validation Status:</span>
                      <span className={selectedRow.is_valid ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {selectedRow.is_valid ? 'Strictly Valid' : 'Syntax Malformed'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Raw Payload Preview */}
              <div>
                <span className="text-slate-500 block mb-1">Payload Content:</span>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 max-h-[220px] overflow-y-auto text-slate-300 text-[11px] leading-relaxed">
                  <pre className="whitespace-pre-wrap">{selectedRow.content}</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500 text-xs">
              Select a row from the relational table to inspect attributes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
