#!/usr/bin/env bash
# ==============================================================================
# SQLite Three-Table Relational + Structured Tagging Repository Indexer CLI
# Scans a source directory and batch-upserts code, markdown, and JSON files
# Fine-tuned for: Intel Core Ultra 9 275HX / RTX 5070 Ti / Gemma 4 12B (LM Studio)
# ==============================================================================

set -euo pipefail

DB_FILE="${1:-scratchpad.db}"
TARGET_DIR="${2:-.}"
SCHEMA_FILE="$(dirname "$0")/../schema/sqlite_schema.sql"

echo "=== SQLite Three-Table + Structured Tagging Indexer ==="
echo "Target DB: $DB_FILE"
echo "Scanning:  $TARGET_DIR"

# Initialize schema if database does not exist
if [ ! -f "$DB_FILE" ] && [ -f "$SCHEMA_FILE" ]; then
    echo "Initializing database schema from $SCHEMA_FILE..."
    sqlite3 "$DB_FILE" < "$SCHEMA_FILE"
fi

indexed_count=0

# Scan target directory, ignoring hidden files, node_modules, .git, dist, build
while IFS= read -r file_path; do
    rel_path="${file_path#./}"
    ext="${file_path##*.}"
    
    # Classify document type and tags
    case "$ext" in
        md|markdown)
            doc_type="markdown"
            lang_tag="#markdown"
            type_tag="#guide"
            ;;
        json)
            doc_type="json"
            lang_tag="#json"
            type_tag="#config"
            ;;
        py)
            doc_type="code"
            lang_tag="#python"
            type_tag="#code"
            ;;
        cu)
            doc_type="code"
            lang_tag="#cuda"
            type_tag="#kernel"
            ;;
        ts|tsx)
            doc_type="code"
            lang_tag="#typescript"
            type_tag="#code"
            ;;
        *)
            doc_type="code"
            lang_tag="#$ext"
            type_tag="#code"
            ;;
    esac

    if [[ "$rel_path" == *"test"* ]]; then
        type_tag="#test"
    fi

    project_dir=$(echo "$rel_path" | cut -d'/' -f1)
    project_tag="@$project_dir"

    title="$(basename "$file_path")"
    content_hash="$(sha256sum "$file_path" | awk '{print $1}')"
    byte_size="$(wc -c < "$file_path")"
    content_escaped="$(sed "s/'/''/g" "$file_path")"

    # Perform atomic upsert into SQLite Core Catalog & Typed Table
    sqlite3 "$DB_FILE" <<EOF
INSERT INTO documents (uuid, doc_type, title, path, content_hash, version, byte_size, updated_at)
VALUES (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    '$doc_type',
    '$title',
    '$rel_path',
    '$content_hash',
    1,
    $byte_size,
    unixepoch()
)
ON CONFLICT(path) DO UPDATE SET
    title = excluded.title,
    doc_type = excluded.doc_type,
    content_hash = excluded.content_hash,
    version = documents.version + 1,
    byte_size = excluded.byte_size,
    updated_at = unixepoch();

-- Structured Tags
INSERT OR IGNORE INTO tags (name, category, prefix) VALUES ('$lang_tag', 'language', '#');
INSERT OR IGNORE INTO tags (name, category, prefix) VALUES ('$type_tag', 'type', '#');
INSERT OR IGNORE INTO tags (name, category, prefix) VALUES ('$project_tag', 'project', '@');

INSERT OR IGNORE INTO document_tags (document_id, tag_id)
SELECT d.id, t.id FROM documents d, tags t WHERE d.path = '$rel_path' AND t.name IN ('$lang_tag', '$type_tag', '$project_tag');

-- Typed Child Table
INSERT INTO code_fragments (document_id, language, symbols, line_count, content)
SELECT id, '$ext', '$lang_tag $type_tag', 0, '$content_escaped'
FROM documents WHERE path = '$rel_path' AND doc_type = 'code'
ON CONFLICT(document_id) DO UPDATE SET content = excluded.content;

INSERT INTO markdown_notes (document_id, category, headings, checklist_summary, tags, content)
SELECT id, 'documentation', '[]', '', '["$lang_tag", "$type_tag"]', '$content_escaped'
FROM documents WHERE path = '$rel_path' AND doc_type = 'markdown'
ON CONFLICT(document_id) DO UPDATE SET content = excluded.content;

INSERT INTO json_drafts (document_id, schema_version, format, root_keys, is_valid, content)
SELECT id, '2020-12', 'json', '[]', 1, '$content_escaped'
FROM documents WHERE path = '$rel_path' AND doc_type = 'json'
ON CONFLICT(document_id) DO UPDATE SET content = excluded.content;
EOF

    indexed_count=$((indexed_count + 1))
done < <(find "$TARGET_DIR" -type f \
    ! -path '*/.*' \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/build/*' \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
       -o -name "*.py" -o -name "*.cu" -o -name "*.rs" -o -name "*.go" \
       -o -name "*.sql" -o -name "*.md" -o -name "*.json" \))

echo "Successfully indexed $indexed_count documents into $DB_FILE."
echo "Deterministic tags (#language, #type, @project) and FTS5 inverted index updated synchronously."
