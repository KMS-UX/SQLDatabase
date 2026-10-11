/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { DocumentRecord, SearchResultItem, TagRecord } from '../types/database';

interface RepositoryExplorerProps {
  documents: DocumentRecord[];
  searchResults: SearchResultItem[] | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedType: string;
  setSelectedType: (type: string) => void;
  selectedTags: string[];
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
  searchLatencyMs: number;
  onSelectDocumentForEdit: (doc: DocumentRecord) => void;
  onDeleteDocument: (id: number) => void;
  onRefresh: () => void;
}

export const RepositoryExplorer: React.FC<RepositoryExplorerProps> = ({
  documents,
  searchResults,
  searchQuery,
  setSearchQuery,
  selectedType,
  setSelectedType,
  selectedTags,
  setSelectedTags,
  searchLatencyMs,
  onSelectDocumentForEdit,
  onDeleteDocument,
  onRefresh,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [allTags, setAllTags] = useState<TagRecord[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  // Load available tags
  useEffect(() => {
    fetch('/api/tags')
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags || []))
      .catch((err) => console.error('Failed to load tags:', err));
  }, [documents]);

  // Set default selected document
  useEffect(() => {
    if (documents.length > 0 && selectedDocId === null) {
      setSelectedDocId(documents[0].id);
    }
  }, [documents, selectedDocId]);

  // Active items to display: search results or filtered document list
  const displayItems = useMemo(() => {
    if ((searchQuery.trim() || selectedTags.length > 0) && searchResults !== null) {
      return searchResults;
    }
    if (selectedType === 'all') return documents;
    return documents.filter((d) => d.doc_type === selectedType);
  }, [searchQuery, selectedTags, searchResults, documents, selectedType]);

  const activeDoc = useMemo(() => {
    if (!selectedDocId) return null;
    return documents.find((d) => d.id === selectedDocId) || null;
  }, [documents, selectedDocId]);

  const handleCopyContent = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
    setSelectedType('all');
  };

  const sampleSearchQueries = [
    '#python #test',
    '#cuda @scratchpad',
    'TokenBucket',
    'AuthSession',
    'ADR 005',
    'rtx5070ti',
    'rate_limiter',
  ];

  // Helper to color tags based on category
  const getTagBadgeClass = (tag: string) => {
    if (tag.startsWith('@')) {
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25';
    }
    const clean = tag.replace(/^#/, '');
    if (['python', 'typescript', 'cuda', 'javascript', 'cpp', 'rust', 'go', 'bash'].includes(clean)) {
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25';
    }
    if (['test', 'middleware', 'adr', 'kernel', 'benchmark', 'guide', 'config'].includes(clean)) {
      return 'bg-purple-500/15 text-purple-300 border-purple-500/40 hover:bg-purple-500/25';
    }
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25';
  };

  const filteredTags = useMemo(() => {
    if (activeCategoryFilter === 'all') return allTags;
    return allTags.filter((t) => t.category === activeCategoryFilter);
  }, [allTags, activeCategoryFilter]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search input with natural tag support */}
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-mono text-xs">
            FTS5+TAGS:
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbols, paths, or type #tags & @projects (e.g. #python #test AuthSession)..."
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-24 pr-10 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Type Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md shrink-0">
          {[
            { id: 'all', label: 'All Types' },
            { id: 'code', label: 'Code' },
            { id: 'markdown', label: 'Markdown' },
            { id: 'json', label: 'JSON' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedType(tab.id)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                selectedType === tab.id
                  ? 'bg-slate-800 text-amber-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Structured Tag Pruning Bar (Deterministic B-Tree Filter) */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">Deterministic Tags:</span>
            <div className="flex items-center gap-1 text-[11px]">
              {['all', 'language', 'type', 'project', 'topic'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded cursor-pointer capitalize transition-colors ${
                    activeCategoryFilter === cat
                      ? 'bg-slate-800 text-amber-300 font-medium'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="text-amber-400 hover:text-amber-300 hover:underline cursor-pointer text-[11px]"
            >
              Reset {selectedTags.length} active tag{selectedTags.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Tag pills */}
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {filteredTags.map((tag) => {
            const isSelected = selectedTags.includes(tag.name);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.name)}
                className={`px-2 py-1 text-xs font-mono rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold shadow-sm'
                    : `${getTagBadgeClass(tag.name)} border-slate-800`
                }`}
              >
                <span>{tag.name}</span>
                <span className={`text-[10px] ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                  {tag.doc_count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Query Suggestions & Live Dual-Stage Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500">Quick tokens:</span>
          {sampleSearchQueries.map((q) => (
            <button
              key={q}
              onClick={() => {
                if (q.startsWith('#') || q.startsWith('@')) {
                  const parts = q.split(' ');
                  setSelectedTags(parts);
                  setSearchQuery('');
                } else {
                  setSearchQuery(q);
                }
              }}
              className="text-slate-400 hover:text-amber-400 hover:underline cursor-pointer transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {(searchQuery || selectedTags.length > 0) && (
          <div className="flex items-center gap-2 text-slate-300 tabular-nums bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-emerald-400">Stage 1: {displayItems.length} pruned</span>
            <span aria-hidden="true" className="text-slate-600">➔</span>
            <span className="text-amber-400">Stage 2: {searchLatencyMs} ms</span>
          </div>
        )}
      </div>

      {/* Main Dual-Column Content: Left List / Right Deep Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Results List */}
        <div className="lg:col-span-5 flex flex-col gap-2.5 max-h-[750px] overflow-y-auto pr-1">
          {displayItems.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-8 text-center flex flex-col items-center justify-center">
              <span className="text-slate-400 font-medium text-sm mb-1">
                No matching documents found
              </span>
              <p className="text-slate-500 text-xs max-w-sm mb-4">
                No items match the active deterministic tags or full-text keywords. Try adjusting tag filters.
              </p>
              <button
                onClick={clearAllFilters}
                className="px-3 py-1.5 text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 rounded border border-amber-400/30 cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            displayItems.map((item) => {
              const isSelected = selectedDocId === item.id;
              const isSearchResult = 'bm25_rank' in item;
              const searchItem = item as SearchResultItem;
              const tagsArray = (item.tags_list || '').split(' ').filter(Boolean);

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedDocId(item.id)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-slate-900 border-amber-400/60 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-semibold text-slate-100 truncate flex-1">
                      {isSearchResult && searchItem.title_snippet ? (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: searchItem.title_snippet,
                          }}
                        />
                      ) : (
                        item.title
                      )}
                    </h3>
                    <span className="text-xs font-mono text-slate-500 uppercase tracking-wider shrink-0">
                      {item.doc_type}
                    </span>
                  </div>

                  {/* Clean unboxed metadata with separators */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mb-2 truncate">
                    <span className="text-slate-300 truncate">
                      {isSearchResult && searchItem.path_snippet ? (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: searchItem.path_snippet,
                          }}
                        />
                      ) : (
                        item.path
                      )}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="tabular-nums shrink-0">{item.byte_size} B</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="tabular-nums shrink-0">v{item.version}</span>
                    {isSearchResult && searchItem.bm25_rank !== 0 && (
                      <>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-amber-400/80 tabular-nums shrink-0">
                          BM25 {searchItem.bm25_rank.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Tag Chips on Card */}
                  {tagsArray.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {tagsArray.map((tag) => (
                        <span
                          key={tag}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTag(tag);
                          }}
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${getTagBadgeClass(
                            tag
                          )}`}
                          title={`Click to filter by ${tag}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Snippet / Snippet Preview */}
                  {isSearchResult && searchItem.content_snippet ? (
                    <div
                      className="text-xs text-slate-300 font-mono bg-slate-950/70 p-2 rounded border border-slate-800/80 line-clamp-2 leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: searchItem.content_snippet,
                      }}
                    />
                  ) : (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {item.content ? `${item.content.substring(0, 140)}...` : ''}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Deep Document Inspector */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
          {activeDoc ? (
            <>
              {/* Header Toolbar */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-950/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
                      {activeDoc.doc_type} document
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-xs text-slate-400 font-mono">
                      v{activeDoc.version}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      {activeDoc.byte_size} bytes
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-100 truncate">
                    {activeDoc.title}
                  </h2>
                  <p className="text-xs font-mono text-slate-400 truncate mt-0.5">
                    {activeDoc.path}
                  </p>

                  {/* Tags on active doc */}
                  {activeDoc.tags_list && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {activeDoc.tags_list.split(' ').filter(Boolean).map((t) => (
                        <button
                          key={t}
                          onClick={() => toggleTag(t)}
                          className={`px-2 py-0.5 text-xs font-mono rounded border cursor-pointer ${getTagBadgeClass(
                            t
                          )}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Document Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyContent(activeDoc.content, activeDoc.id)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  >
                    {copiedId === activeDoc.id ? 'Copied!' : 'Copy Raw'}
                  </button>
                  <button
                    onClick={() => onSelectDocumentForEdit(activeDoc)}
                    className="px-2.5 py-1 text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 rounded transition-colors cursor-pointer"
                  >
                    Edit / Upsert
                  </button>
                  <button
                    onClick={() => onDeleteDocument(activeDoc.id)}
                    className="px-2.5 py-1 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Document Payload Viewer */}
              <div className="p-5 max-h-[520px] overflow-y-auto">
                {activeDoc.doc_type === 'code' ? (
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-800/80 font-mono text-xs overflow-x-auto text-slate-200 leading-relaxed">
                    <pre className="whitespace-pre">{activeDoc.content}</pre>
                  </div>
                ) : activeDoc.doc_type === 'markdown' ? (
                  <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed space-y-3 font-sans">
                    <div className="bg-slate-950/60 p-4 rounded-md border border-slate-800/80">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">
                        {activeDoc.content}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-800/80 font-mono text-xs overflow-x-auto text-amber-200 leading-relaxed">
                    <pre className="whitespace-pre">
                      {JSON.stringify(
                        typeof activeDoc.content === 'string'
                          ? JSON.parse(activeDoc.content)
                          : activeDoc.content,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}

                {/* Metadata & Content-Addressable Cryptographic Properties */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">SHA-256 Content Hash:</span>
                    <span className="text-slate-300 truncate max-w-md select-all">
                      {activeDoc.content_hash}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">UUID:</span>
                    <span className="text-slate-300 select-all">{activeDoc.uuid}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">Structured Tags:</span>
                    <span className="text-amber-300 truncate max-w-md">
                      {activeDoc.tags_list || 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 text-sm">
              Select a document from the repository index to inspect payload and search metadata.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
