'use strict';

// Shared extractor: pull fenced code blocks out of a reference markdown file and
// map each to the file path declared in its leading `// path` or `# path` comment.
//
// The language templates in references/*.md are written as whole source files, each
// beginning with a path comment (e.g. `// src/services/payment-service.ts` or
// `# app/services/payment_service.py`). This module returns those as {path, code}
// so a per-language runner can assemble a compilable project on disk.

import fs from 'node:fs';

/** Fence tag used in the markdown for each language. */
export const FENCE = {
  java: 'java',
  node: 'typescript',
  go: 'go',
  python: 'python',
};

/**
 * Extract code blocks from a markdown file for a given fence language.
 * @param {string} mdPath absolute path to references/<lang>.md
 * @param {string} fence fenced-code language tag (see FENCE)
 * @returns {Array<{path: string|null, code: string, index: number}>}
 */
export function extractBlocks(mdPath, fence) {
  const text = fs.readFileSync(mdPath, 'utf8');
  const re = new RegExp('```' + fence + '\\n([\\s\\S]*?)```', 'g');
  const out = [];
  let m;
  let index = 0;
  while ((m = re.exec(text)) !== null) {
    const body = m[1];
    out.push({ path: firstPathComment(body), code: stripPathComment(body), index: index++ });
  }
  return out;
}

// Matches a leading `// <path>` (JS/TS/Go/Java) or `# <path>` (Python) comment that
// names a source file. Only the FIRST non-empty line is considered a path marker.
const PATH_RE = /^\s*(?:\/\/|#)\s*([\w./-]+\.(?:ts|js|go|java|py))\s*$/;

function firstLine(code) {
  for (const line of code.split('\n')) {
    if (line.trim() !== '') return line;
  }
  return '';
}

function firstPathComment(code) {
  const m = firstLine(code).match(PATH_RE);
  return m ? m[1] : null;
}

function stripPathComment(code) {
  if (firstPathComment(code) === null) return code;
  // Remove the single leading path-comment line (and one trailing blank line if present).
  const lines = code.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  lines.splice(i, 1);
  return lines.join('\n');
}

/**
 * Group blocks by their declared path. Blocks that share a path are framework
 * variants (e.g. three webhook handlers for FastAPI/Flask/Django); the caller can
 * compile each variant against the same base set.
 */
export function groupByPath(blocks) {
  const map = new Map();
  for (const b of blocks) {
    if (!b.path) continue;
    if (!map.has(b.path)) map.set(b.path, []);
    map.get(b.path).push(b);
  }
  return map;
}
