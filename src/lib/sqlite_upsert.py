#!/usr/bin/env python3
"""
SQLite Three-Table Relational Scratchpad & Companion FTS5 Indexer
Python 3 Synchronous Document Upsert Helper (OODA-PDCA Certified)
Optimized for: Intel Core Ultra 9 275HX / 32GB DDR5 / RTX 5070 Ti / Gemma 4 12B Q4_K_M (LM Studio)
"""

import sqlite3
import hashlib
import json
import os
import uuid
import time
from typing import Dict, Any, Optional, Tuple, List

LANGUAGE_SET = {
    'python', 'typescript', 'javascript', 'cuda', 'cpp', 'c', 'rust', 'go',
    'bash', 'shell', 'sql', 'json', 'markdown', 'yaml', 'toml'
}

TYPE_SET = {
    'test', 'middleware', 'adr', 'kernel', 'benchmark', 'guide', 'config',
    'draft', 'schema', 'architecture', 'service', 'controller'
}

def compute_hash(content: str) -> str:
    """Computes SHA-256 hash of UTF-8 content string."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

def normalize_tag(raw_tag: str) -> Tuple[str, str, str]:
    """Normalizes raw tag string into (name, category, prefix)."""
    cleaned = raw_tag.strip().lower()
    if not cleaned:
        return "#general", "topic", "#"

    if cleaned.startswith('@'):
        slug = "".join(c if c.isalnum() or c in "_-" else "-" for c in cleaned[1:])
        return f"@{slug or 'project'}", "project", "@"

    if cleaned.startswith('#'):
        cleaned = cleaned[1:]

    slug = "".join(c if c.isalnum() or c in "_-" else "-" for c in cleaned)

    if slug in LANGUAGE_SET:
        return f"#{slug}", "language", "#"
    if slug in TYPE_SET:
        return f"#{slug}", "type", "#"
    return f"#{slug}", "topic", "#"

def upsert_document(
    conn: sqlite3.Connection,
    path: str,
    doc_type: str,
    content: str,
    title: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Tuple[Dict[str, Any], bool, float]:
    """
    Programmatically upserts a document into the Three-Table Relational Schema:
    1. Base Catalog Table: documents
    2. Structured Tagging: tags & document_tags junction
    3. Typed Child Table: code_fragments | markdown_notes | json_drafts
    4. Triggers synchronously update companion FTS5 virtual table.
    """
    start = time.perf_counter()
    content_hash = compute_hash(content)
    title = title or os.path.basename(path)
    byte_size = len(content.encode('utf-8'))
    doc_uuid = str(uuid.uuid4())
    meta = metadata or {}

    cursor = conn.cursor()

    # 1. Idempotency Check: Short-circuit if content hash matches existing record
    cursor.execute(
        "SELECT id, uuid, content_hash, version FROM documents WHERE path = ?;",
        (path,)
    )
    existing = cursor.fetchone()

    if existing and existing[2] == content_hash:
        cursor.execute("SELECT * FROM v_unified_documents WHERE id = ?;", (existing[0],))
        row = cursor.fetchone()
        latency_ms = (time.perf_counter() - start) * 1000.0
        return {
            "id": row[0], "uuid": row[1], "doc_type": row[2], "path": row[3],
            "title": row[4], "content_hash": row[5], "version": row[6],
            "byte_size": row[7], "content": row[10], "tags_list": row[16] if len(row) > 16 else ""
        }, False, latency_ms

    # 2. Atomic UPSERT into Core Catalog Envelope
    cursor.execute("""
    INSERT INTO documents (uuid, doc_type, title, path, content_hash, version, byte_size, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, unixepoch())
    ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        doc_type = excluded.doc_type,
        content_hash = excluded.content_hash,
        version = documents.version + 1,
        byte_size = excluded.byte_size,
        updated_at = unixepoch();
    """, (doc_uuid, doc_type, title, path, content_hash, byte_size))

    cursor.execute("SELECT id FROM documents WHERE path = ?;", (path,))
    doc_id = cursor.fetchone()[0]

    # 3. Synchronize Structured Tags
    tag_list = []
    if isinstance(meta.get("tags"), list):
        for t in meta["tags"]:
            tag_list.append(normalize_tag(str(t)))
    if meta.get("language"):
        tag_list.append(normalize_tag(meta["language"]))
    elif doc_type == "code":
        ext = path.split('.')[-1] if '.' in path else ''
        if ext == 'py': tag_list.append(normalize_tag('python'))
        elif ext == 'cu': tag_list.append(normalize_tag('cuda'))
        elif ext in ('ts', 'tsx'): tag_list.append(normalize_tag('typescript'))

    if "test" in path.lower() or "test" in title.lower():
        tag_list.append(normalize_tag("test"))

    project = meta.get("project") or path.split('/')[0] or "@scratchpad"
    tag_list.append(normalize_tag(project if project.startswith('@') else f"@{project}"))

    # Deduplicate tags
    unique_tags = {t[0]: t for t in tag_list}

    cursor.execute("DELETE FROM document_tags WHERE document_id = ?;", (doc_id,))
    for name, category, prefix in unique_tags.values():
        cursor.execute("INSERT OR IGNORE INTO tags (name, category, prefix) VALUES (?, ?, ?);", (name, category, prefix))
        cursor.execute("INSERT OR IGNORE INTO document_tags (document_id, tag_id) SELECT ?, id FROM tags WHERE name = ?;", (doc_id, name))

    # 4. Upsert into Specialized Relational Child Table
    if doc_type == "code":
        lang = meta.get("language", "text")
        symbols = " ".join(meta.get("tags", [])) if isinstance(meta.get("tags"), list) else meta.get("symbols", "")
        line_count = len(content.splitlines())
        cursor.execute("""
        INSERT INTO code_fragments (document_id, language, symbols, line_count, content)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
            language = excluded.language,
            symbols = excluded.symbols,
            line_count = excluded.line_count,
            content = excluded.content;
        """, (doc_id, lang, symbols, line_count, content))

    elif doc_type == "markdown":
        category = meta.get("category", "general")
        headings = json.dumps([line.lstrip("#").strip() for line in content.splitlines() if line.startswith("#")])
        checklist_summary = f"{content.count('- [x]')}/{content.count('- [')} completed" if "- [" in content else ""
        tags_str = json.dumps(list(unique_tags.keys()))
        cursor.execute("""
        INSERT INTO markdown_notes (document_id, category, headings, checklist_summary, tags, content)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
            category = excluded.category,
            headings = excluded.headings,
            checklist_summary = excluded.checklist_summary,
            tags = excluded.tags,
            content = excluded.content;
        """, (doc_id, category, headings, checklist_summary, tags_str, content))

    elif doc_type == "json":
        schema_ver = meta.get("schema_version", "2020-12")
        fmt = meta.get("format", "json")
        try:
            parsed = json.loads(content)
            root_keys = json.dumps(list(parsed.keys())) if isinstance(parsed, dict) else "[]"
            is_valid = 1
        except Exception:
            root_keys = "[]"
            is_valid = 0

        cursor.execute("""
        INSERT INTO json_drafts (document_id, schema_version, format, root_keys, is_valid, content)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
            schema_version = excluded.schema_version,
            format = excluded.format,
            root_keys = excluded.root_keys,
            is_valid = excluded.is_valid,
            content = excluded.content;
        """, (doc_id, schema_ver, fmt, root_keys, is_valid, content))

    conn.commit()

    # 5. Return unified record
    cursor.execute("SELECT * FROM v_unified_documents WHERE id = ?;", (doc_id,))
    row = cursor.fetchone()
    latency_ms = (time.perf_counter() - start) * 1000.0

    return {
        "id": row[0], "uuid": row[1], "doc_type": row[2], "path": row[3],
        "title": row[4], "content_hash": row[5], "version": row[6],
        "byte_size": row[7], "content": row[10], "tags_list": row[16] if len(row) > 16 else ""
    }, True, latency_ms

def search_deterministic_fts(conn: sqlite3.Connection, query_str: str, tags: Optional[List[str]] = None, limit: int = 25):
    """
    Executes Deterministic Pruning via B-Tree index + FTS5 BM25 Search inside the subset.
    """
    cursor = conn.cursor()
    params = []
    where_clauses = []

    words = [w for w in query_str.strip().split() if not w.startswith('#') and not w.startswith('@')]
    inline_tags = [w for w in query_str.strip().split() if w.startswith('#') or w.startswith('@')]
    all_tags = list(set((tags or []) + [normalize_tag(t)[0] for t in inline_tags]))

    if words:
        fts_query = " ".join(f"{w}*" for w in words)
        where_clauses.append("documents_fts MATCH ?")
        params.append(fts_query)

    if all_tags:
        intersect_parts = ["SELECT dt.document_id FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE t.name = ?" for _ in all_tags]
        subquery = " INTERSECT ".join(intersect_parts)
        where_clauses.append(f"d.id IN ({subquery})")
        params.extend(all_tags)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
    params.append(limit)

    sql = f"""
    SELECT d.id, d.title, d.path, d.doc_type,
           snippet(documents_fts, 3, '<mark>', '</mark>', '...', 16) AS content_snippet,
           bm25(documents_fts, 5.0, 10.0, 1.0, 1.0, 3.0, 2.0) AS rank,
           (SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id) AS tags_list
    FROM documents_fts
    JOIN documents d ON d.id = documents_fts.rowid
    WHERE {where_sql}
    ORDER BY rank ASC LIMIT ?;
    """
    cursor.execute(sql, tuple(params))
    return cursor.fetchall()
