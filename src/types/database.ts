/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DocumentType = 'code' | 'markdown' | 'json';

export type TagCategory = 'language' | 'type' | 'project' | 'topic';

export interface TagRecord {
  id: number;
  name: string;
  category: TagCategory;
  prefix: string;
  count?: number;
}

export interface DocumentMetadata {
  language?: string;
  tags?: string[];
  author?: string;
  framework?: string;
  category?: string;
  status?: string;
  schema_version?: string;
  format?: string;
  environment?: string;
  project?: string;
  [key: string]: any;
}

export interface DocumentRecord {
  id: number;
  uuid: string;
  doc_type: DocumentType;
  title: string;
  path: string;
  content: string;
  metadata?: DocumentMetadata;
  content_hash: string;
  version: number;
  byte_size: number;
  created_at: number;
  updated_at: number;
  // Relational specific properties
  language?: string;
  symbols?: string;
  line_count?: number;
  category?: string;
  headings?: string;
  checklist_summary?: string;
  tags?: string;
  tags_list?: string;
  schema_version?: string;
  format?: string;
  root_keys?: string;
  is_valid?: number;
}

export interface CodeFragmentRow {
  document_id: number;
  title: string;
  path: string;
  language: string;
  symbols: string;
  line_count: number;
  content: string;
  version: number;
  byte_size: number;
  updated_at: number;
  tags_list?: string;
}

export interface MarkdownNoteRow {
  document_id: number;
  title: string;
  path: string;
  category: string;
  headings: string;
  checklist_summary: string;
  tags: string;
  content: string;
  version: number;
  byte_size: number;
  updated_at: number;
  tags_list?: string;
}

export interface JsonDraftRow {
  document_id: number;
  title: string;
  path: string;
  schema_version: string;
  format: string;
  root_keys: string;
  is_valid: number;
  content: string;
  version: number;
  byte_size: number;
  updated_at: number;
  tags_list?: string;
}

export interface DocumentInput {
  path: string;
  title?: string;
  docType: DocumentType;
  content: string;
  metadata?: DocumentMetadata;
}

export interface SearchResultItem {
  id: number;
  uuid: string;
  doc_type: DocumentType;
  title: string;
  path: string;
  content_hash: string;
  version: number;
  byte_size: number;
  updated_at: number;
  metadata?: DocumentMetadata;
  content?: string;
  content_snippet?: string;
  title_snippet?: string;
  path_snippet?: string;
  tags_snippet?: string;
  meta_snippet?: string;
  tags_list?: string;
  bm25_rank: number;
}

export interface UpsertResult {
  doc: DocumentRecord;
  isModified: boolean;
  latencyMs: number;
}

export interface DatabaseStatus {
  status: string;
  engine: string;
  layout: string;
  docCount: number;
  totalBytes: number;
  typesCount: {
    code: number;
    markdown: number;
    json: number;
  };
  tagsCount: number;
  hardwareProfile: {
    cpuTarget: string;
    ramAllocatedMb: number;
    mmapAllocatedMb: number;
    threads: number;
    journalMode: string;
    synchronous: string;
    lmStudioCoexistence: {
      modelTarget: string;
      vramFootprintGb: number;
      ramHeadroomGb: number;
      cpuThreadMargin: string;
      memoryContention: string;
    };
  };
}

export interface SqlQueryResult {
  rows: any[];
  columns: string[];
  rowCount: number;
  latencyMs: number;
  error?: string;
}

export interface BenchmarkResult {
  upsertCount: number;
  totalTimeMs: number;
  avgUpsertTimeMs: number;
  opsPerSec: number;
  searchQueryTimeMs: number;
  searchResultsCount: number;
}

export interface LmStudioContextPayload {
  promptContext: string;
  tokenEstimate: number;
  documentCount: number;
  appliedTags: string[];
  format: 'xml' | 'markdown' | 'json';
}
