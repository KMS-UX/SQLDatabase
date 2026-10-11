/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import path from 'path';
import {
  DocumentInput,
  DocumentRecord,
  UpsertResult,
  TagCategory,
  TagRecord,
  LmStudioContextPayload,
} from '../types/database';

/**
 * Computes deterministic SHA-256 hex digest of the raw content string.
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Known taxonomy maps for deterministic classification
 */
const LANGUAGE_SET = new Set([
  'python', 'typescript', 'javascript', 'cuda', 'cpp', 'c', 'rust', 'go',
  'bash', 'shell', 'sql', 'json', 'markdown', 'yaml', 'toml', 'html', 'css'
]);

const TYPE_SET = new Set([
  'test', 'middleware', 'adr', 'kernel', 'benchmark', 'guide', 'config',
  'draft', 'schema', 'architecture', 'service', 'controller', 'utility', 'model'
]);

/**
 * Normalizes a tag string into a structured tag entity with prefix and category.
 */
export function normalizeTag(rawTag: string): { name: string; category: TagCategory; prefix: '#' | '@' } {
  let cleaned = rawTag.trim().toLowerCase();
  if (!cleaned) {
    return { name: '#general', category: 'topic', prefix: '#' };
  }

  // Detect project tags starting with '@'
  if (cleaned.startsWith('@')) {
    const slug = cleaned.substring(1).replace(/[^a-z0-9_-]/g, '-');
    return { name: `@${slug || 'project'}`, category: 'project', prefix: '@' };
  }

  // Remove leading '#' if present
  if (cleaned.startsWith('#')) {
    cleaned = cleaned.substring(1);
  }

  const slug = cleaned.replace(/[^a-z0-9_-]/g, '-');

  if (LANGUAGE_SET.has(slug)) {
    return { name: `#${slug}`, category: 'language', prefix: '#' };
  }

  if (TYPE_SET.has(slug)) {
    return { name: `#${slug}`, category: 'type', prefix: '#' };
  }

  return { name: `#${slug}`, category: 'topic', prefix: '#' };
}

/**
 * Parses a natural search query, separating deterministic tag filters from FTS5 tokens.
 * E.g., "#python #test rate_limiter" -> tags: ["#python", "#test"], textQuery: "rate_limiter"
 */
export function parseQueryTags(rawQuery: string): { tags: string[]; textQuery: string } {
  const tokens = rawQuery.trim().split(/\s+/).filter(Boolean);
  const tags: string[] = [];
  const textTokens: string[] = [];

  for (const token of tokens) {
    if (token.startsWith('#') || token.startsWith('@')) {
      const norm = normalizeTag(token);
      tags.push(norm.name);
    } else {
      textTokens.push(token);
    }
  }

  return {
    tags,
    textQuery: textTokens.join(' ').trim(),
  };
}

/**
 * THREE-TABLE RELATIONAL + STRUCTURED TAGGING SYNCHRONOUS DOCUMENT UPSERT HELPER
 *
 * Systems Architecture Highlights (OODA-PDCA Certified):
 * 1. Computes SHA-256 content_hash for content-addressable change detection.
 * 2. Idempotency Guard: Checks `documents` catalog table; skips disk write if hash matches.
 * 3. Atomically upserts into `documents` catalog envelope.
 * 4. Extracts, normalizes, and populates `tags` and `document_tags` relations.
 * 5. Upserts into corresponding domain relational table:
 *    - `code_fragments` (language, symbols, line_count, content)
 *    - `markdown_notes` (category, headings, checklist_summary, tags, content)
 *    - `json_drafts` (schema_version, format, root_keys, is_valid, content)
 * 6. Synchronous relational triggers atomically update the companion `documents_fts` virtual table.
 * 7. Returns the unified projection from `v_unified_documents`.
 */
export function upsertDocument(
  db: any,
  input: DocumentInput
): UpsertResult {
  const startTime = performance.now();
  const contentHash = computeContentHash(input.content);
  const title = input.title?.trim() || path.basename(input.path);
  const byteSize = Buffer.byteLength(input.content, 'utf8');
  const uuid = crypto.randomUUID();
  const meta = input.metadata || {};

  // 1. Idempotency Check: Short-circuit if content hash matches existing record
  let existing: any = null;
  db.exec({
    sql: 'SELECT id, uuid, content_hash, version FROM documents WHERE path = ?;',
    bind: [input.path],
    rowMode: 'object',
    callback: (row: any) => {
      existing = row;
    }
  });

  if (existing && existing.content_hash === contentHash) {
    let fullDoc: any = null;
    db.exec({
      sql: 'SELECT * FROM v_unified_documents WHERE id = ?;',
      bind: [existing.id],
      rowMode: 'object',
      callback: (row: any) => {
        fullDoc = row;
      }
    });

    return {
      doc: fullDoc || { id: existing.id, ...input, content_hash: contentHash, version: existing.version, byte_size: byteSize },
      isModified: false,
      latencyMs: Number((performance.now() - startTime).toFixed(3))
    };
  }

  // 2. Atomic UPSERT into Core Catalog Envelope
  db.exec({
    sql: `
      INSERT INTO documents (
        uuid, doc_type, title, path, content_hash, version, byte_size, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 1, ?, unixepoch())
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        doc_type = excluded.doc_type,
        content_hash = excluded.content_hash,
        version = documents.version + 1,
        byte_size = excluded.byte_size,
        updated_at = unixepoch();
    `,
    bind: [uuid, input.docType, title, input.path, contentHash, byteSize]
  });

  // Retrieve assigned document_id
  let docId = 0;
  db.exec({
    sql: 'SELECT id FROM documents WHERE path = ?;',
    bind: [input.path],
    rowMode: 'object',
    callback: (row: any) => {
      docId = row.id;
    }
  });

  // 3. Extract, Normalize & Persist Structured Tags
  const tagList: Array<{ name: string; category: TagCategory; prefix: '#' | '@' }> = [];

  // Source A: Explicit metadata.tags
  if (Array.isArray(meta.tags)) {
    for (const t of meta.tags) {
      if (typeof t === 'string' && t.trim()) {
        tagList.push(normalizeTag(t));
      }
    }
  }

  // Source B: Language metadata or extension
  if (meta.language) {
    tagList.push(normalizeTag(meta.language));
  } else if (input.docType === 'code') {
    if (input.path.endsWith('.py')) tagList.push(normalizeTag('python'));
    else if (input.path.endsWith('.cu')) tagList.push(normalizeTag('cuda'));
    else if (input.path.endsWith('.ts') || input.path.endsWith('.tsx')) tagList.push(normalizeTag('typescript'));
    else if (input.path.endsWith('.js')) tagList.push(normalizeTag('javascript'));
    else if (input.path.endsWith('.sh')) tagList.push(normalizeTag('bash'));
  }

  // Source C: Category metadata
  if (meta.category) {
    tagList.push(normalizeTag(meta.category));
  }

  // Source D: Project tag from metadata or root folder
  if (meta.project) {
    tagList.push(normalizeTag(meta.project.startsWith('@') ? meta.project : `@${meta.project}`));
  } else {
    const rootFolder = input.path.split('/')[0];
    if (rootFolder && rootFolder !== 'src') {
      tagList.push(normalizeTag(`@${rootFolder}`));
    } else {
      tagList.push(normalizeTag('@scratchpad'));
    }
  }

  // Source E: Test or Benchmark inference
  if (/test|spec|fixture/i.test(input.path) || /test/i.test(title)) {
    tagList.push(normalizeTag('#test'));
  }
  if (/bench|benchmark/i.test(input.path) || /bench/i.test(title)) {
    tagList.push(normalizeTag('#benchmark'));
  }

  // Deduplicate by tag name
  const uniqueTags = new Map<string, { name: string; category: TagCategory; prefix: '#' | '@' }>();
  for (const t of tagList) {
    if (!uniqueTags.has(t.name)) {
      uniqueTags.set(t.name, t);
    }
  }

  // Sync relational tags table and junction
  db.exec({
    sql: 'DELETE FROM document_tags WHERE document_id = ?;',
    bind: [docId]
  });

  for (const tag of uniqueTags.values()) {
    db.exec({
      sql: 'INSERT OR IGNORE INTO tags (name, category, prefix) VALUES (?, ?, ?);',
      bind: [tag.name, tag.category, tag.prefix]
    });

    db.exec({
      sql: 'INSERT OR IGNORE INTO document_tags (document_id, tag_id) SELECT ?, id FROM tags WHERE name = ?;',
      bind: [docId, tag.name]
    });
  }

  // 4. Upsert into the Typed Relational Child Table
  if (input.docType === 'code') {
    const language = meta.language || (input.path.endsWith('.py') ? 'python' : input.path.endsWith('.cu') ? 'cuda' : 'typescript');
    const symbols = Array.isArray(meta.tags) ? meta.tags.join(' ') : (meta.symbols || '');
    const lineCount = input.content.split('\n').length;

    db.exec({
      sql: `
        INSERT INTO code_fragments (document_id, language, symbols, line_count, content)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          language = excluded.language,
          symbols = excluded.symbols,
          line_count = excluded.line_count,
          content = excluded.content;
      `,
      bind: [docId, language, symbols, lineCount, input.content]
    });
  } else if (input.docType === 'markdown') {
    const category = meta.category || 'architecture';
    const tagsStr = JSON.stringify(Array.from(uniqueTags.keys()));
    const headings: string[] = [];
    const lines = input.content.split('\n');
    let checklistDone = 0;
    let checklistTotal = 0;

    for (const line of lines) {
      if (line.startsWith('#')) {
        headings.push(line.replace(/^#+\s*/, '').trim());
      }
      if (/^\s*-\s*\[x\]/i.test(line)) checklistDone++;
      if (/^\s*-\s*\[[ x]\]/i.test(line)) checklistTotal++;
    }

    const checklistSummary = checklistTotal > 0 ? `${checklistDone}/${checklistTotal} completed` : '';

    db.exec({
      sql: `
        INSERT INTO markdown_notes (document_id, category, headings, checklist_summary, tags, content)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          category = excluded.category,
          headings = excluded.headings,
          checklist_summary = excluded.checklist_summary,
          tags = excluded.tags,
          content = excluded.content;
      `,
      bind: [docId, category, JSON.stringify(headings), checklistSummary, tagsStr, input.content]
    });
  } else if (input.docType === 'json') {
    let isValid = 1;
    let rootKeys: string[] = [];
    try {
      const parsed = JSON.parse(input.content);
      if (typeof parsed === 'object' && parsed !== null) {
        rootKeys = Object.keys(parsed);
      }
    } catch {
      isValid = 0;
    }

    const schemaVer = meta.schema_version || '2020-12';
    const format = meta.format || 'json';

    db.exec({
      sql: `
        INSERT INTO json_drafts (document_id, schema_version, format, root_keys, is_valid, content)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          schema_version = excluded.schema_version,
          format = excluded.format,
          root_keys = excluded.root_keys,
          is_valid = excluded.is_valid,
          content = excluded.content;
      `,
      bind: [docId, schemaVer, format, JSON.stringify(rootKeys), isValid, input.content]
    });
  }

  // 5. Retrieve Unified Projection
  let unifiedDoc: any = null;
  db.exec({
    sql: 'SELECT * FROM v_unified_documents WHERE id = ?;',
    bind: [docId],
    rowMode: 'object',
    callback: (row: any) => {
      unifiedDoc = row;
    }
  });

  return {
    doc: unifiedDoc,
    isModified: true,
    latencyMs: Number((performance.now() - startTime).toFixed(3))
  };
}

/**
 * Searches across the repository using Deterministic Tag Filtering + Companion FTS5 Fuzzy Match
 *
 * Algorithm Execution Plan:
 * Stage 1: Deterministic candidate pruning via `document_tags` B-Tree index (<0.05 ms).
 * Stage 2: Companion FTS5 BM25 match executed strictly on candidate subset.
 */
export function searchDocumentsFts(
  db: any,
  query: string,
  docType?: 'code' | 'markdown' | 'json',
  limit: number = 25,
  tagsFilter?: string[]
) {
  const startTime = performance.now();
  const { tags: inlineTags, textQuery } = parseQueryTags(query || '');

  // Combine inline tags and explicit tagsFilter
  const allTags = Array.from(new Set([...(tagsFilter || []), ...inlineTags]));
  const hasTags = allTags.length > 0;
  const hasTextQuery = Boolean(textQuery.trim());

  // If no text query and no tags, return empty
  if (!hasTags && !hasTextQuery) {
    return {
      results: [],
      latencyMs: 0,
      deterministicPrunedCount: 0,
      appliedTags: []
    };
  }

  // Stage 1: Build deterministic candidate subquery if tags are specified
  let candidateSubquery = '';
  const candidateParams: string[] = [];

  if (hasTags) {
    const intersectClauses = allTags.map(() => {
      return `SELECT dt.document_id FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE t.name = ?`;
    });
    candidateSubquery = intersectClauses.join(' INTERSECT ');
    candidateParams.push(...allTags);
  }

  // Count candidate documents pruned by deterministic B-Tree index
  let deterministicPrunedCount = 0;
  if (hasTags) {
    db.exec({
      sql: `SELECT COUNT(*) as count FROM (${candidateSubquery})`,
      bind: candidateParams,
      rowMode: 'object',
      callback: (r: any) => {
        deterministicPrunedCount = r.count || 0;
      }
    });
  }

  // Case A: Pure Deterministic Tag Filter (No text search keyword)
  if (!hasTextQuery && hasTags) {
    let sql = `
      SELECT
        d.id, d.uuid, d.doc_type, d.title, d.path, d.content_hash, d.version, d.byte_size, d.updated_at,
        d.content, d.taxonomy, d.searchable_meta, d.line_count, d.checklist_summary, d.is_valid, d.tags_list,
        0 AS bm25_rank
      FROM v_unified_documents d
      WHERE d.id IN (${candidateSubquery})
    `;
    const params: any[] = [...candidateParams];

    if (docType && docType !== 'all') {
      sql += ' AND d.doc_type = ?';
      params.push(docType);
    }

    sql += ' ORDER BY d.updated_at DESC LIMIT ?;';
    params.push(limit);

    const results: any[] = [];
    db.exec({
      sql,
      bind: params,
      rowMode: 'object',
      callback: (row: any) => {
        results.push(row);
      }
    });

    return {
      results,
      latencyMs: Number((performance.now() - startTime).toFixed(3)),
      deterministicPrunedCount,
      appliedTags: allTags
    };
  }

  // Case B: Full-Text Search inside Deterministically Filtered Subset
  let ftsQuery = textQuery.trim();
  if (!/[*":AND|OR|NOT]/.test(ftsQuery)) {
    const tokens = ftsQuery.split(/\s+/).filter(Boolean);
    ftsQuery = tokens.map(t => t.includes('-') ? `"${t}"` : `${t}*`).join(' ');
  }

  let sql = `
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
      snippet(documents_fts, 3, '<mark class="bg-amber-400/20 text-amber-200 border-b border-amber-400 font-semibold px-0.5">', '</mark>', '...', 16) AS content_snippet,
      snippet(documents_fts, 0, '<mark class="bg-amber-400/20 text-amber-200 font-semibold">', '</mark>', '', 5) AS title_snippet,
      snippet(documents_fts, 1, '<mark class="bg-amber-400/20 text-amber-200 font-semibold">', '</mark>', '', 5) AS path_snippet,
      snippet(documents_fts, 4, '<mark class="bg-amber-400/20 text-amber-200 font-semibold">', '</mark>', '', 5) AS tags_snippet,
      bm25(documents_fts, 5.0, 10.0, 1.0, 1.0, 3.0, 2.0) AS bm25_rank,
      (
        SELECT GROUP_CONCAT(t.name, ' ')
        FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id
        WHERE dt.document_id = d.id
      ) AS tags_list
    FROM documents_fts
    JOIN documents d ON d.id = documents_fts.rowid
    WHERE documents_fts MATCH ?
  `;

  const params: any[] = [ftsQuery];

  if (hasTags) {
    sql += ` AND d.id IN (${candidateSubquery})`;
    params.push(...candidateParams);
  }

  if (docType && docType !== 'all') {
    sql += ' AND d.doc_type = ?';
    params.push(docType);
  }

  sql += ' ORDER BY bm25_rank ASC LIMIT ?;';
  params.push(limit);

  const results: any[] = [];
  try {
    db.exec({
      sql,
      bind: params,
      rowMode: 'object',
      callback: (row: any) => {
        results.push(row);
      }
    });
  } catch (err: any) {
    // Fallback to literal quote search
    const literalFts = `"${textQuery.replace(/"/g, '""')}"`;
    params[0] = literalFts;
    db.exec({
      sql,
      bind: params,
      rowMode: 'object',
      callback: (row: any) => {
        results.push(row);
      }
    });
  }

  return {
    results,
    latencyMs: Number((performance.now() - startTime).toFixed(3)),
    deterministicPrunedCount: hasTags ? deterministicPrunedCount : results.length,
    appliedTags: allTags
  };
}

/**
 * Generates an optimized, token-budgeted prompt context for local Gemma 4 12B Q4_K_M
 * running in LM Studio.
 */
export function generateLmStudioContext(
  db: any,
  options: {
    query?: string;
    tags?: string[];
    maxTokens?: number;
    format?: 'xml' | 'markdown' | 'json';
  }
): LmStudioContextPayload {
  const maxTokens = options.maxTokens || 4096;
  const format = options.format || 'markdown';
  const searchRes = searchDocumentsFts(db, options.query || '', undefined, 10, options.tags);

  const docs = searchRes.results;
  let contextOutput = '';
  let tokenEstimate = 0;
  let docCount = 0;

  if (format === 'xml') {
    contextOutput += '<context_documents>\n';
    for (const d of docs) {
      // Get raw content
      let content = d.content;
      if (!content) {
        db.exec({
          sql: 'SELECT content FROM v_unified_documents WHERE id = ?;',
          bind: [d.id],
          rowMode: 'object',
          callback: (r: any) => { content = r.content; }
        });
      }

      const docSnippet = `  <document id="${d.id}" path="${d.path}" type="${d.doc_type}" tags="${d.tags_list || ''}">\n<![CDATA[\n${content || ''}\n]]>\n  </document>\n`;
      const docTokens = Math.ceil(docSnippet.length / 3.8);

      if (tokenEstimate + docTokens > maxTokens && docCount > 0) break;

      contextOutput += docSnippet;
      tokenEstimate += docTokens;
      docCount++;
    }
    contextOutput += '</context_documents>\n';
  } else if (format === 'json') {
    const list: any[] = [];
    for (const d of docs) {
      let content = d.content;
      if (!content) {
        db.exec({
          sql: 'SELECT content FROM v_unified_documents WHERE id = ?;',
          bind: [d.id],
          rowMode: 'object',
          callback: (r: any) => { content = r.content; }
        });
      }
      const item = {
        id: d.id,
        path: d.path,
        type: d.doc_type,
        tags: (d.tags_list || '').split(' ').filter(Boolean),
        content
      };
      const itemTokens = Math.ceil(JSON.stringify(item).length / 3.8);
      if (tokenEstimate + itemTokens > maxTokens && docCount > 0) break;
      list.push(item);
      tokenEstimate += itemTokens;
      docCount++;
    }
    contextOutput = JSON.stringify(list, null, 2);
  } else {
    // Markdown format (Optimal for Gemma 4 chat templates)
    contextOutput += '### Repository Context & Scratchpad Index\n\n';
    for (const d of docs) {
      let content = d.content;
      if (!content) {
        db.exec({
          sql: 'SELECT content FROM v_unified_documents WHERE id = ?;',
          bind: [d.id],
          rowMode: 'object',
          callback: (r: any) => { content = r.content; }
        });
      }

      const lang = d.taxonomy || (d.path.endsWith('.py') ? 'python' : d.path.endsWith('.cu') ? 'cuda' : 'typescript');
      const docHeader = `#### File: \`${d.path}\` (${d.tags_list || ''})\n\`\`\`${lang}\n`;
      const docFooter = `\n\`\`\`\n\n`;
      const docSnippet = docHeader + (content || '') + docFooter;
      const docTokens = Math.ceil(docSnippet.length / 3.8);

      if (tokenEstimate + docTokens > maxTokens && docCount > 0) break;

      contextOutput += docSnippet;
      tokenEstimate += docTokens;
      docCount++;
    }
  }

  return {
    promptContext: contextOutput,
    tokenEstimate,
    documentCount: docCount,
    appliedTags: searchRes.appliedTags,
    format
  };
}
