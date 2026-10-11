/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DocumentInput, DocumentRecord, DocumentType, UpsertResult } from '../types/database';

interface ScratchpadEditorProps {
  initialDocument?: DocumentRecord | null;
  onUpsertSuccess: (doc: DocumentRecord) => void;
  onCancelEdit?: () => void;
}

export const ScratchpadEditor: React.FC<ScratchpadEditorProps> = ({
  initialDocument,
  onUpsertSuccess,
  onCancelEdit,
}) => {
  const [docType, setDocType] = useState<DocumentType>('code');
  const [title, setTitle] = useState('');
  const [path, setPath] = useState('');
  const [content, setContent] = useState('');
  const [metadataJson, setMetadataJson] = useState('{\n  "tags": ["scratchpad", "draft"]\n}');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<UpsertResult | null>(null);
  const [ftsVerifyResult, setFtsVerifyResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync when an existing document is selected for editing
  useEffect(() => {
    if (initialDocument) {
      setDocType(initialDocument.doc_type);
      setTitle(initialDocument.title);
      setPath(initialDocument.path);
      setContent(initialDocument.content);
      setMetadataJson(JSON.stringify(initialDocument.metadata, null, 2));
      setLastResult(null);
      setFtsVerifyResult(null);
      setErrorMsg(null);
    }
  }, [initialDocument]);

  // Template presets for fast demonstration
  const handleLoadTemplate = (type: DocumentType | 'python') => {
    setErrorMsg(null);
    if (type === 'python') {
      setDocType('code');
      setTitle('PyTest Cryptographic Session Fixture');
      setPath('tests/test_crypto_session.py');
      setContent(`import pytest
import hmac
import hashlib
import time

class CryptoSession:
    def __init__(self, key: str):
        self.key = key.encode()

    def sign(self, msg: str) -> str:
        return hmac.new(self.key, msg.encode(), hashlib.sha256).hexdigest()

@pytest.fixture
def crypto_session():
    return CryptoSession("arrow_lake_rtx5070ti_key")

def test_crypto_signing(crypto_session):
    sig = crypto_session.sign("request_payload_alpha")
    assert len(sig) == 64
`);
      setMetadataJson(JSON.stringify({ language: 'python', tags: ['#python', '#test', '@scratchpad', '#crypto'], project: '@scratchpad' }, null, 2));
    } else if (type === 'code') {
      setDocType('code');
      setTitle('Zero-Copy Buffer Pool Manager');
      setPath('src/memory/buffer_pool.ts');
      setContent(`export class BufferPool {
  private pool: Uint8Array[] = [];
  constructor(private blockSize: number = 4096, private maxBlocks: number = 256) {}

  acquire(): Uint8Array {
    return this.pool.pop() || new Uint8Array(this.blockSize);
  }

  release(buf: Uint8Array): void {
    if (this.pool.length < this.maxBlocks && buf.byteLength === this.blockSize) {
      buf.fill(0);
      this.pool.push(buf);
    }
  }
}`);
      setMetadataJson(JSON.stringify({ language: 'typescript', tags: ['#typescript', '#memory', '@scratchpad'], project: '@scratchpad' }, null, 2));
    } else if (type === 'markdown') {
      setDocType('markdown');
      setTitle('RFC 012: In-Memory Search Buffer Indexing');
      setPath('docs/rfc/012-search-buffer.md');
      setContent(`# RFC 012: In-Memory Search Buffer Indexing

## Executive Summary
This proposal describes synchronous buffering between developer keystrokes and SQLite FTS5 transactions.

## Architecture Guidelines
- **Idempotent Hashes**: Compute SHA-256 before disk writes.
- **Microsecond Response**: Use WAL mode and memory-mapped IO.

### Verification Checklist
- [x] External content table linkage verified
- [x] Unicode61 tokenchars properly preserved
- [ ] Multi-thread write queue stress tested`);
      setMetadataJson(JSON.stringify({ category: 'architecture', tags: ['#markdown', '#adr', '@docs', '#rfc'], project: '@docs' }, null, 2));
    } else {
      setDocType('json');
      setTitle('Gateway Route Table Configuration Draft');
      setPath('config/routing/gateway_routes.json');
      setContent(`{
  "gateway_version": "2.4.0",
  "default_timeout_ms": 3000,
  "routes": [
    {
      "prefix": "/api/v1/auth",
      "upstream": "http://auth-service.internal:8080",
      "rate_limit_rpm": 600,
      "auth_required": false
    },
    {
      "prefix": "/api/v1/indexer",
      "upstream": "http://indexer-service.internal:9000",
      "rate_limit_rpm": 2400,
      "auth_required": true
    }
  ]
}`);
      setMetadataJson(JSON.stringify({ schema_version: '2020-12', format: 'json', tags: ['#json', '#config', '@config', '#routing'], project: '@config' }, null, 2));
    }
  };

  const handleRunUpsert = async () => {
    if (!path.trim() || !content.trim()) {
      setErrorMsg('Path and content are required fields.');
      return;
    }

    let parsedMeta = {};
    try {
      parsedMeta = metadataJson.trim() ? JSON.parse(metadataJson) : {};
    } catch (e: any) {
      setErrorMsg(`Invalid JSON metadata: ${e.message}`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setFtsVerifyResult(null);

    try {
      const payload: DocumentInput = {
        path: path.trim(),
        title: title.trim() || path.trim(),
        docType,
        content,
        metadata: parsedMeta,
      };

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to upsert document');
      }

      const result: UpsertResult = await res.json();
      setLastResult(result);
      onUpsertSuccess(result.doc);

      // Verify that FTS5 updated synchronously in the exact same transaction!
      const verifySearch = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: result.doc.title || result.doc.path }),
      });
      if (verifySearch.ok) {
        const searchData = await verifySearch.json();
        setFtsVerifyResult(searchData);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner & Template Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>Programmatic Upsert &amp; Synchronous FTS5 Virtual Table Console</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Atomically upserts into <code className="text-amber-300 font-mono">documents</code> and triggers synchronous FTS5 inverted index generation.
          </p>
        </div>

        {/* Template Selectors */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono">Load Template:</span>
          <button
            onClick={() => handleLoadTemplate('python')}
            className="px-2.5 py-1 text-xs text-amber-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors font-mono cursor-pointer border border-amber-400/30"
          >
            PyTest (#python)
          </button>
          <button
            onClick={() => handleLoadTemplate('code')}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors font-mono cursor-pointer"
          >
            TypeScript Code
          </button>
          <button
            onClick={() => handleLoadTemplate('markdown')}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors font-mono cursor-pointer"
          >
            Markdown RFC
          </button>
          <button
            onClick={() => handleLoadTemplate('json')}
            className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors font-mono cursor-pointer"
          >
            JSON Config
          </button>
        </div>
      </div>

      {/* Editor Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Form: 7 cols */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
              {errorMsg}
            </div>
          )}

          {/* Document Type Selector */}
          <div className="flex items-center justify-between gap-4">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              Document Payload Type
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
              {(['code', 'markdown', 'json'] as DocumentType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors uppercase font-mono cursor-pointer ${
                    docType === t
                      ? 'bg-slate-800 text-amber-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Title and Path Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Document Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Distributed Rate Limiter"
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 font-sans"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Canonical Path (Unique Natural Key)
              </label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="e.g. src/middleware/rate_limiter.ts"
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>
          </div>

          {/* Main Content Area */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-400">
                Raw Content Payload ({docType.toUpperCase()})
              </label>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {new TextEncoder().encode(content).length} bytes
              </span>
            </div>
            <textarea
              rows={13}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Paste or write ${docType} content here...`}
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 resize-y"
            />
          </div>

          {/* Metadata JSON */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Metadata JSON (Language, tags, author, flags)
            </label>
            <textarea
              rows={3}
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              placeholder="JSON object with tags, language, etc."
              className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-amber-400 resize-none"
            />
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            {onCancelEdit ? (
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel Edit
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleRunUpsert}
              className="px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-50 rounded-md transition-colors cursor-pointer shadow-sm flex items-center gap-2"
            >
              {isSubmitting ? 'Upserting...' : 'Execute Synchronous Upsert'}
            </button>
          </div>
        </div>

        {/* Right Column: Execution Telemetry & Verification */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Synchronous Upsert Result Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mb-3">
              ACID Upsert Telemetry
            </h3>

            {lastResult ? (
              <div className="space-y-3 text-xs font-mono">
                <div className="p-3 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Execution Status:</span>
                  <span
                    className={`font-semibold ${
                      lastResult.isModified ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {lastResult.isModified ? 'Written & Triggered' : 'Idempotent (No-op)'}
                  </span>
                </div>

                <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Document Version:</span>
                    <span className="text-amber-400 font-bold tabular-nums">
                      v{lastResult.doc.version}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Execution Latency:</span>
                    <span className="text-slate-200 tabular-nums">
                      {lastResult.latencyMs} ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Payload Size:</span>
                    <span className="text-slate-200 tabular-nums">
                      {lastResult.doc.byte_size} bytes
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 pt-1 border-t border-slate-800/80">
                    <span className="text-slate-500">Content Hash (SHA-256):</span>
                    <span className="text-slate-300 text-[11px] select-all break-all">
                      {lastResult.doc.content_hash}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 text-xs">
                Submit an upsert to view instantaneous transactional latency, version increment, and FTS5 synchronization verification.
              </div>
            )}
          </div>

          {/* Synchronous FTS5 Query Verification */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mb-2">
              FTS5 Virtual Index Verification
            </h3>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Verifies that SQLite triggers (<code className="text-amber-300 font-mono">trg_documents_fts_ai/au</code>) synchronized the virtual search table in the same transaction.
            </p>

            {ftsVerifyResult && ftsVerifyResult.results?.length > 0 ? (
              <div className="space-y-2 text-xs font-mono">
                <div className="text-emerald-400 flex items-center gap-1.5 font-medium">
                  <span>Inverted Index Verified ({ftsVerifyResult.queryTimeMs} ms)</span>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-slate-300 leading-relaxed text-[11px]">
                  <div className="text-slate-400 mb-1">Matched Token Snippet:</div>
                  <div
                    dangerouslySetInnerHTML={{
                      __html:
                        ftsVerifyResult.results[0].content_snippet ||
                        ftsVerifyResult.results[0].title_snippet ||
                        ftsVerifyResult.results[0].path_snippet,
                    }}
                  />
                  <div className="mt-2 text-slate-500">
                    BM25 Rank: {ftsVerifyResult.results[0].bm25_rank.toFixed(3)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-600 text-xs font-mono">
                Virtual table verification will execute upon upsert.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
