/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { RepositoryExplorer } from './components/RepositoryExplorer';
import { LmStudioGemmaLab } from './components/LmStudioGemmaLab';
import { RelationalTablesView } from './components/RelationalTablesView';
import { ScratchpadEditor } from './components/ScratchpadEditor';
import { SchemaBlueprint } from './components/SchemaBlueprint';
import { DeployableHelpers } from './components/DeployableHelpers';
import { SqlConsoleLab } from './components/SqlConsoleLab';
import { DatabaseStatus, DocumentRecord, SearchResultItem } from './types/database';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('explorer');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [searchLatencyMs, setSearchLatencyMs] = useState<number>(0);
  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch status and document lists
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/documents?type=${selectedType}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedType]);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchDocuments();
  }, [fetchStatus, fetchDocuments]);

  // Debounced search query & deterministic tag filter handler
  useEffect(() => {
    const hasQuery = Boolean(searchQuery.trim());
    const hasTags = selectedTags.length > 0;

    if (!hasQuery && !hasTags) {
      setSearchResults(null);
      setSearchLatencyMs(0);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery.trim(),
            type: selectedType === 'all' ? undefined : selectedType,
            tags: selectedTags,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setSearchLatencyMs(data.queryTimeMs || 0);
        }
      } catch (err) {
        console.error('Search request failed:', err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedType, selectedTags]);

  // Delete document handler
  const handleDeleteDocument = async (id: number) => {
    if (!window.confirm('Delete document and remove synchronously from FTS5 index?')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDocuments();
        fetchStatus();
        if (searchQuery || selectedTags.length > 0) {
          setSearchResults((prev) => (prev ? prev.filter((d) => d.id !== id) : null));
        }
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  // Select document for editing
  const handleSelectDocumentForEdit = (doc: DocumentRecord) => {
    setEditingDoc(doc);
    setActiveTab('scratchpad');
  };

  // Upsert success callback
  const handleUpsertSuccess = (savedDoc: DocumentRecord) => {
    fetchDocuments();
    fetchStatus();
  };

  // New Scratchpad button in header
  const handleNewScratchpad = () => {
    setEditingDoc(null);
    setActiveTab('scratchpad');
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Strict Top Bar Contract Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        status={status}
        onNewScratchpad={handleNewScratchpad}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col">
        {activeTab === 'explorer' && (
          <RepositoryExplorer
            documents={documents}
            searchResults={searchResults}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            searchLatencyMs={searchLatencyMs}
            onSelectDocumentForEdit={handleSelectDocumentForEdit}
            onDeleteDocument={handleDeleteDocument}
            onRefresh={() => {
              fetchDocuments();
              fetchStatus();
            }}
          />
        )}

        {activeTab === 'lmstudio' && (
          <LmStudioGemmaLab
            status={status}
            onRefreshStatus={fetchStatus}
          />
        )}

        {activeTab === 'relational' && (
          <RelationalTablesView
            onSelectForEdit={handleSelectDocumentForEdit}
          />
        )}

        {activeTab === 'scratchpad' && (
          <ScratchpadEditor
            initialDocument={editingDoc}
            onUpsertSuccess={handleUpsertSuccess}
            onCancelEdit={() => setActiveTab('explorer')}
          />
        )}

        {activeTab === 'blueprint' && <SchemaBlueprint />}

        {activeTab === 'helpers' && <DeployableHelpers />}

        {activeTab === 'console' && (
          <SqlConsoleLab
            onRefreshDocs={() => {
              fetchDocuments();
              fetchStatus();
            }}
          />
        )}
      </main>

      {/* Quiet Footer without pseudo-technical clutter */}
      <footer className="border-t border-slate-800/80 bg-slate-950/40 py-5 px-6 text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>SQLite 3.45+ FTS5 Architecture</span>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span>Deterministic Pruning (#language, #type, @project)</span>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span>LM Studio Gemma 12B Tuned</span>
          </div>
          <div>
            <span>WAL Journal Mode · Sub-millisecond keyword lookup</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
