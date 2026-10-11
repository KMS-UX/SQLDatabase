/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { SCHEMA_SQL } from './src/schema/schema_ddl.ts';
import {
  upsertDocument,
  searchDocumentsFts,
  generateLmStudioContext,
} from './src/lib/sqlite_upsert.ts';

dotenv.config();

export { SCHEMA_SQL };

// Global in-memory/file-backed SQLite database instance
let db: any = null;
let sqlite3: any = null;

// Initial seed data
const SEED_DOCUMENTS: Array<{
  docType: 'code' | 'markdown' | 'json';
  title: string;
  path: string;
  content: string;
  metadata: Record<string, any>;
}> = [
  {
    docType: 'code',
    title: 'PyTest Authenticated Client Fixture',
    path: 'tests/fixtures/test_auth_flow.py',
    content: `import pytest
import hmac
import hashlib
import time

class AuthSession:
    def __init__(self, secret_key: str):
        self.secret_key = secret_key
        self.created_at = time.time()

    def generate_token(self, user_id: str) -> str:
        nonce = f"{user_id}:{int(time.time())}"
        signature = hmac.new(self.secret_key.encode(), nonce.encode(), hashlib.sha256).hexdigest()
        return f"{nonce}:{signature[:16]}"

    def verify_token(self, token: str) -> bool:
        parts = token.split(':')
        if len(parts) != 3:
            return False
        user_id, ts, sig = parts
        expected = hmac.new(self.secret_key.encode(), f"{user_id}:{ts}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected[:16])

@pytest.fixture
def auth_client():
    session = AuthSession("rtx5070ti_gemma_secret_key")
    return session

def test_login_token_verification(auth_client):
    token = auth_client.generate_token("admin_user_01")
    assert auth_client.verify_token(token) is True
`,
    metadata: {
      language: 'python',
      tags: ['#python', '#test', '@scratchpad', '#security', '#pytest'],
      category: 'test',
      project: '@scratchpad'
    }
  },
  {
    docType: 'code',
    title: 'Distributed Rate Limiter Token Bucket',
    path: 'src/middleware/rate_limiter.ts',
    content: `import { Redis } from 'ioredis';

export interface RateLimitOptions {
  windowSec: number;
  maxRequests: number;
}

export class TokenBucketLimiter {
  constructor(private redis: Redis, private opts: RateLimitOptions) {}

  async isAllowed(clientIp: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = \`ratelimit:\${clientIp}\`;
    const now = Math.floor(Date.now() / 1000);
    const pipeline = this.redis.pipeline();
    
    pipeline.zremrangebyscore(key, 0, now - this.opts.windowSec);
    pipeline.zadd(key, now, \`\${now}-\${Math.random()}\`);
    pipeline.zcard(key);
    pipeline.expire(key, this.opts.windowSec);
    
    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) || 0;
    
    return {
      allowed: count <= this.opts.maxRequests,
      remaining: Math.max(0, this.opts.maxRequests - count)
    };
  }
}`,
    metadata: {
      language: 'typescript',
      tags: ['networking', 'rate_limiter', 'redis', 'security'],
      author: 'systems-architect',
      framework: 'express'
    }
  },
  {
    docType: 'code',
    title: 'NVIDIA CUDA Kernel Stream Allocator',
    path: 'src/compute/cuda_stream.cu',
    content: `#include <cuda_runtime.h>
#include <stdio.h>

__global__ void vectorMultiplyKernel(const float* A, const float* B, float* C, int n) {
    int idx = blockDim.x * blockIdx.x + threadIdx.x;
    if (idx < n) {
        C[idx] = A[idx] * B[idx];
    }
}

cudaError_t launchComputePipeline(float* d_A, float* d_B, float* d_C, int n, cudaStream_t stream) {
    int blockSize = 256;
    int numBlocks = (n + blockSize - 1) / blockSize;
    vectorMultiplyKernel<<<numBlocks, blockSize, 0, stream>>>(d_A, d_B, d_C, n);
    return cudaGetLastError();
}`,
    metadata: {
      language: 'cuda',
      tags: ['gpu', 'cuda', 'rtx5070ti', 'vector_multiply'],
      author: 'systems-architect'
    }
  },
  {
    docType: 'markdown',
    title: 'Architecture Decision Record: Three-Table Relational Schema + FTS5',
    path: 'docs/adr/005-three-table-relational-fts5.md',
    content: `# ADR 005: Three-Table Relational Schema with Companion FTS5 Virtual Table

## Status
Accepted - OODA-PDCA Certified

## Context
Running local developer indexers on modern Arrow Lake-HX platforms (Intel Core Ultra 9 275HX with 32GB DDR5-5600 SO-DIMM) demands:
1. Typed domain tables rather than untyped generic document bags
2. Instant indexed filtering without running JSON extraction parsers on every query
3. Cache separation: keeping the core catalog table in CPU L3/RAM cache without reading heavy text pages

## Decision: Three-Table Relational Architecture
- **Catalog Envelope**: \`documents\` (id, uuid, doc_type, path, title, content_hash, version, byte_size, timestamps)
- **Table 1: Code Fragments**: \`code_fragments\` (document_id FK, language, symbols, line_count, content)
- **Table 2: Markdown Notes**: \`markdown_notes\` (document_id FK, category, headings, checklist_summary, tags, content)
- **Table 3: JSON State Drafts**: \`json_drafts\` (document_id FK, schema_version, format, root_keys, is_valid, content)
- **Companion FTS5 Virtual Table**: \`documents_fts\` (title, path, doc_type, content, searchable_meta)
- **Synchronous Triggers**: Atomically synchronize FTS5 inverted indexes on insert/update/delete across all three tables.

## Hardware Tuning PRAGMAs
- \`PRAGMA cache_size = -131072;\` (128 Megabytes RAM cache for DDR5-5600)
- \`PRAGMA mmap_size = 1073741824;\` (1 Gigabyte memory-mapped zero-copy I/O)
- \`PRAGMA temp_store = MEMORY;\` (Temporary tables and sort passes executed in RAM)
- \`PRAGMA threads = 8;\` (Parallel query execution across CPU cores)`,
    metadata: {
      category: 'architecture-decision-records',
      status: 'accepted',
      tags: ['sqlite', 'fts5', 'adr', 'three-table', 'relational'],
      priority: 'high'
    }
  },
  {
    docType: 'json',
    title: 'Cluster Topology & RTX 5070 Ti Node Config Draft',
    path: 'config/drafts/cluster_topology_v3.json',
    content: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "cluster_id": "us-east-metal-09",
  "version": "3.4.1",
  "nodes": [
    {
      "id": "node-alpha-1",
      "role": "control-plane",
      "ip": "10.240.0.12",
      "spec": { "cpu": "Intel Core Ultra 9 275HX", "cores": 24, "ram_gb": 32 },
      "gpu": { "model": "RTX 5070 Ti Laptop", "vram_gddr7_gb": 12, "bandwidth_gbps": 672 }
    },
    {
      "id": "node-worker-4",
      "role": "data-worker",
      "ip": "10.240.1.44",
      "spec": { "cpu_cores": 32, "ram_gb": 128, "nvme_gb": 4000 },
      "labels": { "workload": "sqlite-replicas", "zone": "us-east-1b" }
    }
  ],
  "storage_pool": {
    "engine": "zfs",
    "replication_factor": 3,
    "compression": "lz4",
    "sync_interval_ms": 250
  }
}`,
    metadata: {
      schema_version: '2020-12',
      format: 'json-schema',
      tags: ['infrastructure', 'topology', 'kubernetes', 'rtx5070ti', 'storage'],
      environment: 'staging'
    }
  },
  {
    docType: 'markdown',
    title: 'Code Indexing Strategy & Tokenizer Specifications',
    path: 'docs/indexing_strategy.md',
    content: `# SQLite FTS5 Indexing Strategy for Developer Scratchpads

## Tokenizer Mechanics
Standard NLP tokenizers split on punctuation like \`.\`, \`_\`, and \`-\`. In developer environments, this destroys semantic integrity:
- \`src/api/auth.ts\` would turn into separate tokens: \`src\`, \`api\`, \`auth\`, \`ts\`
- \`snake_case_variable\` would lose compound affinity
- \`$user_id\` would lose the prefix symbol

By leveraging:
\`\`\`sql
tokenize = "unicode61 tokenchars '_-$@' remove_diacritics 2"
\`\`\`
We preserve continuous identifiers.

## BM25 Ranking Formulation
SQLite FTS5 computes relevance via Okapi BM25:
\`\`\`sql
SELECT d.title, bm25(documents_fts, 5.0, 10.0, 1.0, 1.0, 2.0) AS score
FROM documents_fts
JOIN documents d ON d.id = documents_fts.rowid
WHERE documents_fts MATCH 'search_term'
ORDER BY score;
\`\`\``,
    metadata: {
      category: 'guide',
      tags: ['fts5', 'bm25', 'tokenization', 'search'],
      priority: 'medium'
    }
  }
];

// Initialize SQLite database
async function initDatabase() {
  if (db) return db;
  sqlite3 = await sqlite3InitModule();
  db = new sqlite3.oo1.DB(':memory:');
  
  // Execute three-table schema
  db.exec(SCHEMA_SQL);
  
  // Seed initial entries
  for (const item of SEED_DOCUMENTS) {
    upsertDocument(db, item);
  }
  
  console.log('Database initialized with Three-Table Relational Schema and Companion FTS5 virtual table.');
  return db;
}

async function startServer() {
  await initDatabase();

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // ==========================================
  // API Routes
  // ==========================================

  // 1. Health, Statistics & LM Studio Coexistence Profile
  app.get('/api/status', (req: Request, res: Response) => {
    try {
      let docCount = 0;
      let totalBytes = 0;
      let tagsCount = 0;
      const typesCount: Record<string, number> = { code: 0, markdown: 0, json: 0 };

      db.exec({
        sql: 'SELECT COUNT(*) as count, SUM(byte_size) as total_bytes FROM documents;',
        rowMode: 'object',
        callback: (r: any) => {
          docCount = r.count || 0;
          totalBytes = r.total_bytes || 0;
        }
      });

      db.exec({
        sql: 'SELECT doc_type, COUNT(*) as count FROM documents GROUP BY doc_type;',
        rowMode: 'object',
        callback: (r: any) => {
          if (r.doc_type) typesCount[r.doc_type] = r.count;
        }
      });

      db.exec({
        sql: 'SELECT COUNT(*) as count FROM tags;',
        rowMode: 'object',
        callback: (r: any) => {
          tagsCount = r.count || 0;
        }
      });

      res.json({
        status: 'online',
        engine: 'SQLite 3.45+ with FTS5',
        layout: 'Three-Table Relational (code, markdown, json) + Structured Tagging + FTS5',
        docCount,
        totalBytes,
        typesCount,
        tagsCount,
        hardwareProfile: {
          cpuTarget: 'Intel Core Ultra 9 275HX (24C/32T up to 5.4GHz)',
          ramAllocatedMb: 32,
          mmapAllocatedMb: 256,
          threads: 4,
          journalMode: 'WAL',
          synchronous: 'NORMAL',
          lmStudioCoexistence: {
            modelTarget: 'Gemma 4 12B Q4_K_M (LM Studio)',
            vramFootprintGb: 9.8,
            ramHeadroomGb: 28.5,
            cpuThreadMargin: '28 threads unconstrained for llama.cpp prompt prefill',
            memoryContention: 'Zero: SQLite locked to 32MB cache in 32GB DDR5-5600',
            walCheckpointing: '1000-page smooth autocheckpoint prevents NVMe stalls'
          }
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 1b. Get Structured Tags & Taxonomy List
  app.get('/api/tags', (req: Request, res: Response) => {
    try {
      const tags: any[] = [];
      db.exec({
        sql: 'SELECT id, name, category, prefix, doc_count FROM v_tag_stats ORDER BY doc_count DESC, name ASC;',
        rowMode: 'object',
        callback: (r: any) => {
          tags.push(r);
        }
      });
      res.json({ tags, total: tags.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get Unified Documents List (from v_unified_documents)
  app.get('/api/documents', (req: Request, res: Response) => {
    try {
      const type = req.query.type as string;
      const sort = (req.query.sort as string) || 'updated_at';
      const order = (req.query.order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      let sql = 'SELECT * FROM v_unified_documents';
      const params: any[] = [];

      if (type && type !== 'all') {
        sql += ' WHERE doc_type = ?';
        params.push(type);
      }

      sql += ` ORDER BY ${sort} ${order};`;

      const list: any[] = [];
      db.exec({
        sql,
        bind: params,
        rowMode: 'object',
        callback: (r: any) => {
          list.push(r);
        }
      });

      res.json({ documents: list, total: list.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get Typed Relational Table Records Directly
  app.get('/api/tables/code', (req: Request, res: Response) => {
    try {
      const rows: any[] = [];
      db.exec({
        sql: `SELECT c.document_id, d.title, d.path, c.language, c.symbols, c.line_count, c.content, d.version, d.byte_size, d.updated_at,
                     (SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id) AS tags_list
              FROM code_fragments c
              JOIN documents d ON d.id = c.document_id
              ORDER BY d.updated_at DESC;`,
        rowMode: 'object',
        callback: (r: any) => rows.push(r)
      });
      res.json({ rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tables/markdown', (req: Request, res: Response) => {
    try {
      const rows: any[] = [];
      db.exec({
        sql: `SELECT m.document_id, d.title, d.path, m.category, m.headings, m.checklist_summary, m.tags, m.content, d.version, d.byte_size, d.updated_at,
                     (SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id) AS tags_list
              FROM markdown_notes m
              JOIN documents d ON d.id = m.document_id
              ORDER BY d.updated_at DESC;`,
        rowMode: 'object',
        callback: (r: any) => rows.push(r)
      });
      res.json({ rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tables/json', (req: Request, res: Response) => {
    try {
      const rows: any[] = [];
      db.exec({
        sql: `SELECT j.document_id, d.title, d.path, j.schema_version, j.format, j.root_keys, j.is_valid, j.content, d.version, d.byte_size, d.updated_at,
                     (SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id) AS tags_list
              FROM json_drafts j
              JOIN documents d ON d.id = j.document_id
              ORDER BY d.updated_at DESC;`,
        rowMode: 'object',
        callback: (r: any) => rows.push(r)
      });
      res.json({ rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Get Single Document
  app.get('/api/documents/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      let doc: any = null;

      db.exec({
        sql: 'SELECT * FROM v_unified_documents WHERE id = ?;',
        bind: [id],
        rowMode: 'object',
        callback: (r: any) => { doc = r; }
      });

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Programmatic Upsert Document (Single or Batch)
  app.post('/api/documents', (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (Array.isArray(body)) {
        const results = body.map(item => upsertDocument(db, item));
        return res.json({ count: results.length, items: results });
      }

      if (!body.path || !body.docType || body.content === undefined) {
        return res.status(400).json({ error: 'Missing required fields: path, docType, content' });
      }

      const result = upsertDocument(db, body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Delete Document (Cascades through foreign key to child table and FTS5)
  app.delete('/api/documents/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      db.exec({
        sql: 'DELETE FROM documents WHERE id = ?;',
        bind: [id]
      });
      res.json({ success: true, deletedId: id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Deterministic Filtering + Companion FTS5 Search Endpoint
  app.post('/api/search', (req: Request, res: Response) => {
    try {
      const { query = '', type, tags, limit = 25 } = req.body;
      const searchRes = searchDocumentsFts(db, query, type, limit, tags);
      res.json({
        results: searchRes.results,
        queryTimeMs: searchRes.latencyMs,
        count: searchRes.results.length,
        deterministicPrunedCount: searchRes.deterministicPrunedCount,
        appliedTags: searchRes.appliedTags
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message, queryTimeMs: 0 });
    }
  });

  // 7b. LM Studio Gemma 4 12B Context Injection Endpoint
  app.post('/api/llm/context', (req: Request, res: Response) => {
    try {
      const { query = '', tags, maxTokens = 4096, format = 'markdown' } = req.body;
      const payload = generateLmStudioContext(db, { query, tags, maxTokens, format });
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. SQL Console Runner
  app.post('/api/query', (req: Request, res: Response) => {
    const start = performance.now();
    try {
      const { sql } = req.body;
      if (!sql || typeof sql !== 'string') {
        return res.status(400).json({ error: 'SQL string is required' });
      }

      const rows: any[] = [];
      let columns: string[] = [];

      db.exec({
        sql,
        rowMode: 'object',
        callback: (r: any) => {
          if (columns.length === 0 && r) {
            columns = Object.keys(r);
          }
          rows.push(r);
        }
      });

      const latencyMs = performance.now() - start;
      res.json({
        rows,
        columns,
        rowCount: rows.length,
        latencyMs: Number(latencyMs.toFixed(3))
      });
    } catch (err: any) {
      res.status(400).json({
        error: err.message,
        latencyMs: Number((performance.now() - start).toFixed(3))
      });
    }
  });

  // 9. Schema DDL
  app.get('/api/schema', (req: Request, res: Response) => {
    res.json({
      schemaSql: SCHEMA_SQL,
      layout: 'Three-Table Relational (code_fragments, markdown_notes, json_drafts) + Companion FTS5',
      tables: ['documents (Catalog)', 'code_fragments', 'markdown_notes', 'json_drafts', 'documents_fts (FTS5)'],
      views: ['v_unified_documents']
    });
  });

  // 10. Re-seed Initial Data
  app.post('/api/seed', (req: Request, res: Response) => {
    try {
      db.exec('DELETE FROM documents;');
      for (const item of SEED_DOCUMENTS) {
        upsertDocument(db, item);
      }
      res.json({ success: true, count: SEED_DOCUMENTS.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. Batch Upsert Benchmark
  app.post('/api/benchmark', (req: Request, res: Response) => {
    try {
      const count = Math.min(Math.max(parseInt(req.body.count, 10) || 100, 10), 1000);
      const start = performance.now();

      for (let i = 0; i < count; i++) {
        upsertDocument(db, {
          docType: i % 3 === 0 ? 'code' : i % 3 === 1 ? 'markdown' : 'json',
          title: `Hardware Benchmark Item ${i}`,
          path: `bench/test_module_${i}.${i % 3 === 0 ? 'cu' : i % 3 === 1 ? 'md' : 'json'}`,
          content: `// Arrow Lake-HX benchmark workload #${i}\n__global__ void runKernel${i}() {\n  const char* token = "bench_tok_${i}";\n}`,
          metadata: { language: 'cuda', tags: ['benchmark', `tok_${i}`], index: i }
        });
      }

      const totalTimeMs = performance.now() - start;
      const opsPerSec = Math.round((count / (totalTimeMs / 1000)));

      // Perform a test FTS5 search
      const searchStart = performance.now();
      const matchRows: any[] = [];
      db.exec({
        sql: "SELECT d.id FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid WHERE documents_fts MATCH 'bench_tok_*' LIMIT 50;",
        rowMode: 'object',
        callback: (r: any) => matchRows.push(r)
      });
      const searchTimeMs = performance.now() - searchStart;

      res.json({
        upsertCount: count,
        totalTimeMs: Number(totalTimeMs.toFixed(2)),
        avgUpsertTimeMs: Number((totalTimeMs / count).toFixed(3)),
        opsPerSec,
        searchQueryTimeMs: Number(searchTimeMs.toFixed(3)),
        searchResultsCount: matchRows.length
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Setup Vite in Dev or serve dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Three-Table Relational Scratchpad running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
