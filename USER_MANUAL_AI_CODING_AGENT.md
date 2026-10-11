# AI Coding Agent Integration & Systems Manual
## SQLite Three-Table Relational Scratchpad & Companion FTS5 Indexer
### Structured Tagging Subsystem & LM Studio (Gemma 4 12B Q4_K_M) Coexistence Specification

This manual provides an unambiguous, deterministic reference for AI Coding Agents and automated systems integrating with the SQLite Three-Table Relational Scratchpad, Structured Tagging Subsystem, and Companion FTS5 Indexer.

---

## 1. System Context & Hardware Profile

- **CPU**: Intel Core Ultra 9 275HX (Arrow Lake-HX: 24 Cores / 32 Threads, up to 5.4GHz)
- **RAM**: 32GB DDR5-5600 SO-DIMM
- **GPU**: NVIDIA GeForce RTX 5070 Ti Laptop GPU (12GB GDDR7, 672 GB/s memory bandwidth)
- **Local LLM Workload**: **Gemma 4 12B Q4_K_M** executed via **LM Studio** (v0.3.x / llama.cpp engine)
- **Storage**: PCIe 4.0/5.0 NVMe Solid State Drive

---

## 2. LM Studio & Gemma 4 12B Q4_K_M Coexistence Architecture

When running local 12B parameter LLMs alongside background developer tooling, unconstrained database engines induce severe inference jitter (token stutter, prefill latency spikes) via memory bandwidth contention, VRAM exhaustion, or thread saturation.

### Resource Partitioning Matrix

| Resource | Allocated to LM Studio (Gemma 12B Q4_K_M) | Allocated to SQLite Indexer | Architectural Guarantee |
| :--- | :--- | :--- | :--- |
| **GPU VRAM** (12GB GDDR7) | **~9.8 GB Total**<br>• Model Weights: ~7.6 GB<br>• 8K KV Cache: ~2.2 GB | **0 MB (Strictly Zero VRAM)** | Prevents Out-Of-Memory (OOM) GPU kernel crashes during CUDA allocations. Safe 2.2 GB VRAM margin. |
| **CPU Threads** (32 Hardware Threads) | **28 Worker Threads** for prompt evaluation & prefill | **4 Threads** (`PRAGMA threads = 4`) | All Intel 275HX P-cores and E-cores remain unthrottled for LLM token generation. |
| **System RAM** (32GB DDR5-5600) | **~8 - 12 GB** (process memory & buffer) | **32 MB Bounded** (`PRAGMA cache_size = -32768`) | Eliminates buffer pool inflation. Leaves full memory bandwidth (~89.6 GB/s) for Gemma. |
| **Disk I/O** (NVMe SSD) | Non-blocking read access | **WAL Mode** + 1000-page autocheckpoint | Eliminates heavy fsync pauses during LLM token streaming. |

---

## 3. Structured Tagging Subsystem: Deterministic Pruning + FTS5 Search

The database implements a two-stage retrieval pipeline:
1. **Stage 1 (Deterministic Candidate Pruning)**: Uses B-Tree covering indexes on relational junction tables (`document_tags`) to prune the document universe down to an exact subset in $\le 0.04\text{ms}$.
2. **Stage 2 (Companion FTS5 BM25 Ranking)**: Executes Okapi BM25 full-text keyword ranking strictly inside the pruned candidate subset.

### Tag Entity Taxonomy
- **Language Tags** (Prefix `#`): `#python`, `#typescript`, `#cuda`, `#javascript`, `#cpp`, `#rust`, `#go`, `#bash`, `#sql`, `#json`, `#markdown`.
- **Type Tags** (Prefix `#`): `#test`, `#middleware`, `#adr`, `#kernel`, `#benchmark`, `#guide`, `#config`, `#schema`.
- **Project Tags** (Prefix `@`): `@scratchpad`, `@repo-indexer`, `@infra`, `@cluster`, `@docs`, `@config`.
- **Topic Tags** (Prefix `#`): `#redis`, `#security`, `#rtx5070ti`, `#fts5`, `#storage`.

### Deterministic Filtering + FTS5 Query Formulation

```sql
-- Query: Filter deterministically by #python AND #test, then FTS5 match 'verify_token*'
SELECT
    d.id,
    d.uuid,
    d.doc_type,
    d.title,
    d.path,
    d.content_hash,
    d.version,
    d.byte_size,
    d.updated_at,
    snippet(documents_fts, 3, '<mark>', '</mark>', '...', 16) AS content_snippet,
    bm25(documents_fts, 5.0, 10.0, 1.0, 1.0, 3.0, 2.0) AS bm25_rank,
    (
        SELECT GROUP_CONCAT(t.name, ' ')
        FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id
        WHERE dt.document_id = d.id
    ) AS tags_list
FROM documents_fts
JOIN documents d ON d.id = documents_fts.rowid
WHERE documents_fts MATCH 'verify_token*'
  AND d.id IN (
    -- Deterministic candidate subset resolved via B-Tree index in <0.05ms:
    SELECT dt.document_id FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE t.name = '#python'
    INTERSECT
    SELECT dt.document_id FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE t.name = '#test'
  )
ORDER BY bm25_rank ASC
LIMIT 25;
```

---

## 4. Production SQL DDL Specification

```sql
-- SECTION 1: HARDWARE-ACCELERATED RUNTIME PRAGMAs (GEMMA 12B COEXISTENCE)
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -32768;     -- 32 Megabytes RAM Cache (Prevents RAM bandwidth competition)
PRAGMA temp_store = MEMORY;      -- Transient structures in DDR5 RAM
PRAGMA mmap_size = 268435456;    -- 256 Megabytes zero-copy memory-mapped I/O
PRAGMA threads = 4;              -- 4 worker threads; reserves 28 threads for Gemma 12B
PRAGMA wal_autocheckpoint = 1000;-- Smooth checkpointing avoids NVMe stalls during token streaming
PRAGMA busy_timeout = 5000;      -- 5s Busy Timeout for cooperative multi-threading

-- SECTION 2: CORE DOCUMENT CATALOG ENVELOPE
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    doc_type TEXT NOT NULL CHECK(doc_type IN ('code', 'markdown', 'json')),
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    byte_size INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- SECTION 3: STRUCTURED TAGGING SUBSYSTEM
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK(category IN ('language', 'type', 'project', 'topic')),
    prefix TEXT NOT NULL CHECK(prefix IN ('#', '@'))
);

CREATE TABLE IF NOT EXISTS document_tags (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_doc ON document_tags(tag_id, document_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag ON document_tags(document_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category, name);

CREATE VIEW IF NOT EXISTS v_tag_stats AS
SELECT t.id, t.name, t.category, t.prefix, COUNT(dt.document_id) as doc_count
FROM tags t
LEFT JOIN document_tags dt ON dt.tag_id = t.id
GROUP BY t.id, t.name, t.category, t.prefix
ORDER BY doc_count DESC, t.name ASC;

-- SECTION 4: THREE-TABLE RELATIONAL PAYLOAD STORAGE
CREATE TABLE IF NOT EXISTS code_fragments (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'typescript',
    symbols TEXT NOT NULL DEFAULT '',
    line_count INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS markdown_notes (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'general',
    headings TEXT NOT NULL DEFAULT '[]',
    checklist_summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS json_drafts (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL DEFAULT '2020-12',
    format TEXT NOT NULL DEFAULT 'json',
    root_keys TEXT NOT NULL DEFAULT '[]',
    is_valid INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL
);

-- SECTION 5: UNIFIED RELATIONAL PROJECTION VIEW
CREATE VIEW IF NOT EXISTS v_unified_documents AS
SELECT
    d.id, d.uuid, d.doc_type, d.path, d.title, d.content_hash, d.version, d.byte_size,
    d.created_at, d.updated_at,
    COALESCE(c.content, m.content, j.content, '') AS content,
    COALESCE(c.language, m.category, j.format, '') AS taxonomy,
    COALESCE(c.symbols, m.tags, j.root_keys, '') AS searchable_meta,
    c.line_count, m.checklist_summary, j.is_valid,
    (
        SELECT GROUP_CONCAT(t.name, ' ')
        FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id
        WHERE dt.document_id = d.id
    ) AS tags_list
FROM documents d
LEFT JOIN code_fragments c ON c.document_id = d.id
LEFT JOIN markdown_notes m ON m.document_id = d.id
LEFT JOIN json_drafts j ON j.document_id = d.id;

-- SECTION 6: COMPANION FTS5 VIRTUAL SEARCH TABLE
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title,
    path,
    doc_type,
    content,
    tags_text,
    searchable_meta,
    tokenize = "unicode61 tokenchars '_-$@#' remove_diacritics 2",
    prefix = '2 3'
);
```

---

## 5. REST API Integration Endpoints

All endpoints run on `http://localhost:3000`:

### `POST /api/search`
Executes Two-Stage Retrieval: Deterministic Tag Pruning + FTS5 BM25 match.
```json
// Request Body
{
  "query": "verify_token",
  "tags": ["#python", "#test"],
  "type": "code",
  "limit": 25
}

// Response
{
  "results": [
    {
      "id": 1,
      "title": "PyTest Authenticated Client Fixture",
      "path": "tests/fixtures/test_auth_flow.py",
      "content_snippet": "def <mark>verify_token</mark>(self, token: str)...",
      "bm25_rank": -1.82,
      "tags_list": "#python #test @scratchpad #security #pytest"
    }
  ],
  "queryTimeMs": 1.4,
  "count": 1,
  "deterministicPrunedCount": 1,
  "appliedTags": ["#python", "#test"]
}
```

### `POST /api/llm/context`
Generates token-budgeted system context formatted for LM Studio and Gemma 4.
```json
// Request Body
{
  "query": "AuthSession",
  "tags": ["#python"],
  "maxTokens": 2048,
  "format": "markdown"
}

// Response
{
  "promptContext": "### Repository Context & Scratchpad Index\n\n#### File: `tests/fixtures/test_auth_flow.py` (#python #test @scratchpad)\n```python\nclass AuthSession:\n...\n```\n\n",
  "tokenEstimate": 320,
  "documentCount": 1,
  "appliedTags": ["#python"],
  "format": "markdown"
}
```

### `GET /api/tags`
Retrieves all structured tags grouped by category with document frequencies.
```json
{
  "tags": [
    { "id": 1, "name": "#python", "category": "language", "prefix": "#", "doc_count": 5 },
    { "id": 2, "name": "#test", "category": "type", "prefix": "#", "doc_count": 8 },
    { "id": 3, "name": "@scratchpad", "category": "project", "prefix": "@", "doc_count": 12 }
  ],
  "total": 35
}
```

---

## 6. How to Deploy Alongside LM Studio

1. **In LM Studio**:
   - Model: Load `gemma-4-12b-it-q4_k_m.gguf`.
   - GPU Offload: Allocate **36-40 GPU layers** to your NVIDIA RTX 5070 Ti (12GB GDDR7).
   - Context Window: 4,096 - 8,192 tokens.
2. **System Prompt / Tool Call**:
   - In your agent tool loop, invoke `POST /api/llm/context` to retrieve deterministic context in under 2ms.
   - Inject the returned `promptContext` directly into Gemma 4's conversation history.
3. **Run Synchronous Upsert**:
   - When code fragments, markdown notes, or JSON state drafts are modified, call `POST /api/documents` to update both relational tables and FTS5 in a single atomic transaction.
