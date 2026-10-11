/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SCHEMA_SQL = `-- ============================================================================
-- SQLITE THREE-TABLE RELATIONAL LAYOUT + STRUCTURED TAGGING SYSTEM + FTS5
-- Systems Architecture Design Specification
-- Co-existence Tuned: Gemma 4 12B Q4_K_M (LM Studio) on Intel Core Ultra 9 275HX
-- Hardware Profile: 24C/32T Arrow Lake-HX, RTX 5070 Ti (12GB), 32GB DDR5-5600
-- ============================================================================

-- ============================================================================
-- SECTION 1: HARDWARE-ACCELERATED RUNTIME PRAGMAs (LM STUDIO CO-EXISTENCE)
-- ============================================================================

-- Multi-reader concurrency with zero write lock blocking
PRAGMA journal_mode = WAL;

-- Safe synchronization level for WAL mode
PRAGMA synchronous = NORMAL;

-- Enforce strict relational foreign keys and cascade deletions
PRAGMA foreign_keys = ON;

-- 32 Megabytes RAM cache allocation (-32768 KiB)
-- Tightly bounded memory footprint leaves full memory bandwidth for Gemma 12B
PRAGMA cache_size = -32768;

-- Keep transient sorting buffers and temporary index trees strictly in RAM
PRAGMA temp_store = MEMORY;

-- 256 Megabytes memory-mapped I/O (zero-copy OS kernel reads without virtual memory bloat)
PRAGMA mmap_size = 268435456;

-- Parallelize across 4 worker threads; reserves 20 threads for Gemma 12B LLM prompt prefill
PRAGMA threads = 4;

-- Steady passive WAL check-pointing avoids NVMe I/O stalls during LLM generation
PRAGMA wal_autocheckpoint = 1000;

-- Non-blocking retry timeout for multi-threaded processes
PRAGMA busy_timeout = 5000;


-- ============================================================================
-- SECTION 2: CORE DOCUMENT CATALOG ENVELOPE
-- ============================================================================

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


-- ============================================================================
-- SECTION 3: STRUCTURED TAGGING SUBSYSTEM
-- Enables Deterministic Pruning by Language (#python), Type (#test), Project (@scratchpad)
-- ============================================================================

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

CREATE VIEW IF NOT EXISTS v_document_tags AS
SELECT dt.document_id, t.id as tag_id, t.name as tag_name, t.category, t.prefix
FROM document_tags dt
JOIN tags t ON t.id = dt.tag_id;

CREATE VIEW IF NOT EXISTS v_tag_stats AS
SELECT t.id, t.name, t.category, t.prefix, COUNT(dt.document_id) as doc_count
FROM tags t
LEFT JOIN document_tags dt ON dt.tag_id = t.id
GROUP BY t.id, t.name, t.category, t.prefix
ORDER BY doc_count DESC, t.name ASC;


-- ============================================================================
-- SECTION 4: THREE-TABLE SPECIALIZED RELATIONAL PAYLOAD STORAGE
-- ============================================================================

-- Table 1: Raw Code Fragments (Typed language, symbols, line metrics)
CREATE TABLE IF NOT EXISTS code_fragments (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'typescript',
    symbols TEXT NOT NULL DEFAULT '',
    line_count INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL
);

-- Table 2: Structural Markdown Notes (Outlines, tags, checklist telemetry)
CREATE TABLE IF NOT EXISTS markdown_notes (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'general',
    headings TEXT NOT NULL DEFAULT '[]',
    checklist_summary TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    content TEXT NOT NULL
);

-- Table 3: JSON State Drafts (Schema versions, structural keys, lint validity)
CREATE TABLE IF NOT EXISTS json_drafts (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL DEFAULT '2020-12',
    format TEXT NOT NULL DEFAULT 'json',
    root_keys TEXT NOT NULL DEFAULT '[]',
    is_valid INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL
);


-- ============================================================================
-- SECTION 5: UNIFIED RELATIONAL VIEW WITH CONCATENATED TAGS
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_unified_documents AS
SELECT
    d.id,
    d.uuid,
    d.doc_type,
    d.path,
    d.title,
    d.content_hash,
    d.version,
    d.byte_size,
    d.created_at,
    d.updated_at,
    COALESCE(c.content, m.content, j.content, '') AS content,
    COALESCE(c.language, m.category, j.format, '') AS taxonomy,
    COALESCE(c.symbols, m.tags, j.root_keys, '') AS searchable_meta,
    c.line_count,
    m.checklist_summary,
    j.is_valid,
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


-- ============================================================================
-- SECTION 6: COMPANION FTS5 VIRTUAL SEARCH TABLE
-- Supports Fuzzy Search with BM25 Ranking inside Deterministically Filtered Subsets
-- Tokenizer preserves #tags, @projects, snake_case, $variables, @decorators
-- ============================================================================

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


-- ============================================================================
-- SECTION 7: SYNCHRONOUS RELATIONAL TRIGGER SUITE
-- ============================================================================

-- Triggers for Code Fragments
CREATE TRIGGER IF NOT EXISTS trg_code_ai AFTER INSERT ON code_fragments BEGIN
    INSERT INTO documents_fts(rowid, title, path, doc_type, content, tags_text, searchable_meta)
    SELECT
        new.document_id, d.title, d.path, d.doc_type, new.content,
        COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = new.document_id), ''),
        new.language || ' ' || new.symbols
    FROM documents d WHERE d.id = new.document_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_code_au AFTER UPDATE ON code_fragments BEGIN
    DELETE FROM documents_fts WHERE rowid = old.document_id;
    INSERT INTO documents_fts(rowid, title, path, doc_type, content, tags_text, searchable_meta)
    SELECT
        new.document_id, d.title, d.path, d.doc_type, new.content,
        COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = new.document_id), ''),
        new.language || ' ' || new.symbols
    FROM documents d WHERE d.id = new.document_id;
END;

-- Triggers for Markdown Notes
CREATE TRIGGER IF NOT EXISTS trg_md_ai AFTER INSERT ON markdown_notes BEGIN
    INSERT INTO documents_fts(rowid, title, path, doc_type, content, tags_text, searchable_meta)
    SELECT
        new.document_id, d.title, d.path, d.doc_type, new.content,
        COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = new.document_id), ''),
        new.category || ' ' || new.tags || ' ' || new.headings
    FROM documents d WHERE d.id = new.document_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_md_au AFTER UPDATE ON markdown_notes BEGIN
    DELETE FROM documents_fts WHERE rowid = old.document_id;
    INSERT INTO documents_fts(rowid, title, path, doc_type, content, tags_text, searchable_meta)
    SELECT
        new.document_id, d.title, d.path, d.doc_type, new.content,
        COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = new.document_id), ''),
        new.category || ' ' || new.tags || ' ' || new.headings
    FROM documents d WHERE d.id = new.document_id;
END;

-- Triggers for JSON Drafts
CREATE TRIGGER IF NOT EXISTS trg_json_ai AFTER INSERT ON json_drafts BEGIN
    INSERT INTO documents_fts(rowid, title, path, doc_type, content, tags_text, searchable_meta)
    SELECT
        new.document_id, d.title, d.path, d.doc_type, new.content,
        COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = new.document_id), ''),
        new.format || ' ' || new.root_keys
    FROM documents d WHERE d.id = new.document_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_json_au AFTER UPDATE ON json_drafts BEGIN
    DELETE FROM documents_fts WHERE rowid = old.document_id;
    INSERT INTO documents_fts(rowid, title, path, doc_type, content, tags_text, searchable_meta)
    SELECT
        new.document_id, d.title, d.path, d.doc_type, new.content,
        COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = new.document_id), ''),
        new.format || ' ' || new.root_keys
    FROM documents d WHERE d.id = new.document_id;
END;

-- Cascade Trigger from Catalog Envelope
CREATE TRIGGER IF NOT EXISTS trg_doc_ad AFTER DELETE ON documents BEGIN
    DELETE FROM documents_fts WHERE rowid = old.id;
END;


-- ============================================================================
-- SECTION 8: COVERING B-TREE INDEXES FOR DETERMINISTIC PRUNING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type_updated ON documents(doc_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_language ON code_fragments(language);
CREATE INDEX IF NOT EXISTS idx_md_category ON markdown_notes(category);
CREATE INDEX IF NOT EXISTS idx_json_valid ON json_drafts(is_valid);
`;
