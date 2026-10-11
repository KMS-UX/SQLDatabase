/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

async function runTestSuite() {
  console.log('=== STARTING OODA-PDCA AUDIT TEST SUITE (THREE-TABLE RELATIONAL + FTS5) ===');
  const failures: string[] = [];
  let passed = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      failures.push(msg);
    } else {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    }
  }

  // 1. Initialize SQLite WASM
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(':memory:');

  // Load and execute three-table schema
  const { SCHEMA_SQL } = await import('../src/schema/schema_ddl.ts');
  db.exec(SCHEMA_SQL);
  assert(true, 'Three-Table Schema DDL executed cleanly');

  // Helper upsert
  const { upsertDocument } = await import('../src/lib/sqlite_upsert.ts');

  // TEST 1: Insert into Code Fragments
  const doc1 = upsertDocument(db, {
    path: 'src/core/cache.ts',
    title: 'LRU Cache Core',
    docType: 'code',
    content: 'export class LruCache<K, V> { private store = new Map<K, V>(); }',
    metadata: { language: 'typescript', tags: ['cache', 'lru'] }
  });
  assert(doc1.isModified === true, 'Fresh insert marks isModified: true');
  assert(doc1.doc.version === 1, 'Initial document version is 1');

  // Verify child table `code_fragments` was populated
  let childRows: any[] = [];
  db.exec({
    sql: 'SELECT * FROM code_fragments WHERE document_id = ?;',
    bind: [doc1.doc.id],
    rowMode: 'object',
    callback: (r: any) => { childRows.push(r); }
  });
  assert(childRows.length === 1 && childRows[0].language === 'typescript', 'Child table code_fragments populated with typed language');

  // TEST 2: FTS Search for code token
  let searchRes: any[] = [];
  db.exec({
    sql: "SELECT d.id, snippet(documents_fts, 3, '<b>', '</b>', '...', 10) as s FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid WHERE documents_fts MATCH 'LruCache';",
    rowMode: 'object',
    callback: (r: any) => { searchRes.push(r); }
  });
  assert(searchRes.length === 1, 'Companion FTS5 finds LruCache immediately via trigger');

  // TEST 3: Idempotent Upsert (Exact same payload)
  const doc1Repeat = upsertDocument(db, {
    path: 'src/core/cache.ts',
    title: 'LRU Cache Core',
    docType: 'code',
    content: 'export class LruCache<K, V> { private store = new Map<K, V>(); }',
    metadata: { language: 'typescript', tags: ['cache', 'lru'] }
  });
  assert(doc1Repeat.isModified === false, 'Idempotent upsert marks isModified: false');
  assert(doc1Repeat.doc.version === 1, 'Version remains 1 on idempotent upsert');

  // TEST 4: Update Content and verify trigger sync
  const doc1Updated = upsertDocument(db, {
    path: 'src/core/cache.ts',
    title: 'LRU Cache Core v2',
    docType: 'code',
    content: 'export class LruCache<K, V> { private fastStore = new Map<K, V>(); getFast() {} }',
    metadata: { language: 'typescript', tags: ['cache', 'fast'] }
  });
  assert(doc1Updated.isModified === true, 'Content update marks isModified: true');
  assert(doc1Updated.doc.version === 2, 'Version incremented to 2');

  searchRes = [];
  db.exec({
    sql: "SELECT d.id FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid WHERE documents_fts MATCH 'fastStore';",
    rowMode: 'object',
    callback: (r: any) => { searchRes.push(r); }
  });
  assert(searchRes.length === 1, 'FTS5 matches updated token fastStore');

  // TEST 5: Markdown Notes Table
  const docMd = upsertDocument(db, {
    path: 'docs/hardware.md',
    title: 'Intel Arrow Lake Architecture',
    docType: 'markdown',
    content: '# Core Ultra 9 275HX Architecture\n- [x] 24 Cores / 32 Threads\n- [ ] Thermal throttling test\n32GB DDR5-5600 bandwidth benchmark.',
    metadata: { category: 'hardware', tags: ['intel', 'ddr5'] }
  });
  assert(docMd.isModified === true, 'Markdown note inserted successfully');

  let mdRows: any[] = [];
  db.exec({
    sql: 'SELECT * FROM markdown_notes WHERE document_id = ?;',
    bind: [docMd.doc.id],
    rowMode: 'object',
    callback: (r: any) => { mdRows.push(r); }
  });
  assert(mdRows.length === 1 && mdRows[0].category === 'hardware', 'Child table markdown_notes holds category & checklist state');

  searchRes = [];
  db.exec({
    sql: "SELECT d.id FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid WHERE documents_fts MATCH '\"DDR5-5600\"';",
    rowMode: 'object',
    callback: (r: any) => { searchRes.push(r); }
  });
  assert(searchRes.length === 1, 'Companion FTS5 matches markdown note DDR5-5600');

  // TEST 6: JSON State Drafts Table
  const docJson = upsertDocument(db, {
    path: 'config/rtx5070ti.json',
    title: 'GPU Tensor Engine Config',
    docType: 'json',
    content: '{"model": "RTX 5070 Ti", "vram_gb": 12, "gddr7_bandwidth_gbps": 672}',
    metadata: { schema_version: '2020-12', format: 'json' }
  });
  assert(docJson.isModified === true, 'JSON draft inserted successfully');

  let jsonRows: any[] = [];
  db.exec({
    sql: 'SELECT * FROM json_drafts WHERE document_id = ?;',
    bind: [docJson.doc.id],
    rowMode: 'object',
    callback: (r: any) => { jsonRows.push(r); }
  });
  assert(jsonRows.length === 1 && jsonRows[0].is_valid === 1, 'Child table json_drafts validated syntax and root keys');

  searchRes = [];
  db.exec({
    sql: "SELECT d.id FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid WHERE documents_fts MATCH 'gddr7_bandwidth_gbps';",
    rowMode: 'object',
    callback: (r: any) => { searchRes.push(r); }
  });
  assert(searchRes.length === 1, 'Companion FTS5 matches JSON root key gddr7_bandwidth_gbps');

  // TEST 7: Foreign Key Cascade Deletion
  db.exec({
    sql: 'DELETE FROM documents WHERE id = ?;',
    bind: [docJson.doc.id]
  });

  jsonRows = [];
  db.exec({
    sql: 'SELECT * FROM json_drafts WHERE document_id = ?;',
    bind: [docJson.doc.id],
    rowMode: 'object',
    callback: (r: any) => { jsonRows.push(r); }
  });
  assert(jsonRows.length === 0, 'Foreign key ON DELETE CASCADE purged child record in json_drafts');

  searchRes = [];
  db.exec({
    sql: "SELECT d.id FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid WHERE documents_fts MATCH 'gddr7_bandwidth_gbps';",
    rowMode: 'object',
    callback: (r: any) => { searchRes.push(r); }
  });
  assert(searchRes.length === 0, 'Delete trigger completely removed JSON keys from FTS5 index');

  // Helper search & context functions
  const { searchDocumentsFts, generateLmStudioContext, normalizeTag, parseQueryTags } = await import('../src/lib/sqlite_upsert.ts');

  // TEST 8: Tag Normalization & Structured Tagging
  const norm1 = normalizeTag('python');
  assert(norm1.name === '#python' && norm1.category === 'language' && norm1.prefix === '#', 'Tag normalization formats #python as language');

  const norm2 = normalizeTag('test');
  assert(norm2.name === '#test' && norm2.category === 'type' && norm2.prefix === '#', 'Tag normalization formats #test as type');

  const norm3 = normalizeTag('@scratchpad');
  assert(norm3.name === '@scratchpad' && norm3.category === 'project' && norm3.prefix === '@', 'Tag normalization formats @scratchpad as project');

  // TEST 9: Insert Document with Structured Tags
  const pyDoc = upsertDocument(db, {
    path: 'tests/unit/test_tensor.py',
    title: 'PyTest Tensor Validation',
    docType: 'code',
    content: 'def test_matrix_multiply(): res = tensor_dot(A, B); assert res is not None',
    metadata: {
      language: 'python',
      tags: ['#python', '#test', '@scratchpad', '#tensor'],
      project: '@scratchpad'
    }
  });
  assert(pyDoc.isModified === true, 'PyTest document inserted cleanly');

  // Verify tags in relational tables
  let tagRows: any[] = [];
  db.exec({
    sql: 'SELECT t.name, t.category, t.prefix FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = ? ORDER BY t.name;',
    bind: [pyDoc.doc.id],
    rowMode: 'object',
    callback: (r: any) => { tagRows.push(r); }
  });
  const tagNames = tagRows.map(t => t.name);
  assert(tagNames.includes('#python') && tagNames.includes('#test') && tagNames.includes('@scratchpad'), 'Document linked to normalized tags #python, #test, @scratchpad in SQLite');

  // TEST 10: Deterministic Filtering Pruning + FTS5 BM25 Search
  const deterministicRes = searchDocumentsFts(db, 'tensor_dot', undefined, 10, ['#python', '#test']);
  assert(deterministicRes.results.length === 1, 'Two-stage search deterministically filters by #python and #test and matches tensor_dot');
  assert(deterministicRes.appliedTags.includes('#python') && deterministicRes.appliedTags.includes('#test'), 'Search engine reports applied deterministic tags');
  assert(deterministicRes.results[0].id === pyDoc.doc.id, 'Matching document ID is verified');

  // TEST 11: Natural Query with Inline Tags (#python #test tensor_dot)
  const inlineRes = searchDocumentsFts(db, '#python #test tensor_dot', undefined, 10);
  assert(inlineRes.results.length === 1, 'Natural query parses inline #python and #test deterministically');
  assert(inlineRes.appliedTags.length === 2, 'Parsed 2 inline tags from query text');

  // Negative test: Filter by non-existent tag combination
  const emptyRes = searchDocumentsFts(db, 'tensor_dot', undefined, 10, ['#python', '#non_existent_tag']);
  assert(emptyRes.results.length === 0, 'Deterministic filter on non-matching tag returns 0 candidates instantly');

  // TEST 12: LM Studio Context Generation for Gemma 4 12B
  const llmContext = generateLmStudioContext(db, {
    query: 'tensor_dot',
    tags: ['#python'],
    maxTokens: 2048,
    format: 'markdown'
  });
  assert(llmContext.documentCount === 1, 'LM Studio context generator included 1 matching document');
  assert(llmContext.promptContext.includes('```python') && llmContext.promptContext.includes('test_matrix_multiply'), 'Prompt context formatted with syntax highlighted code fence');
  assert(llmContext.tokenEstimate > 0 && llmContext.tokenEstimate < 2048, 'Token count calculated and bounded within budget');

  // Summary
  console.log(`\n=== SUITE SUMMARY: ${passed} PASSED, ${failures.length} FAILED ===`);
  if (failures.length > 0) {
    console.error('Failures:', failures);
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
