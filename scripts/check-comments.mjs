import fs from 'node:fs';
import path from 'node:path';

/**
 * Supported modes:
 * - 'production' (default):
 *   - STUB: causes build ERROR (exit code 1)
 *   - DEV: causes build ERROR (exit code 1)
 *   - FIXME: causes build WARNING (exit code 0)
 * - 'development':
 *   - DEV: causes build WARNING (exit code 0)
 *   - STUB: ignored (allowed in dev)
 *   - FIXME: ignored (allowed in dev)
 */

const args = process.argv.slice(2);
let mode = 'production';
for (const arg of args) {
  if (arg.startsWith('--mode=')) {
    mode = arg.split('=')[1];
  }
}

if (mode !== 'production' && mode !== 'development') {
  console.error(`Unknown mode: "${mode}". Use --mode=production or --mode=development`);
  process.exit(1);
}

const SRC_DIR = path.resolve(process.cwd(), 'src');
const EXTENSIONS = new Set(['.ts', '.html', '.scss', '.c', '.h']);

/**
 * @typedef {{
 *   file: string;
 *   line: number;
 *   tag: string;
 *   message: string;
 *   type: 'error' | 'warning';
 * }} Diagnostic
 */

/** @type {Diagnostic[]} */
const diagnostics = [];

/**
 * Scan directory recursively for source files.
 * @param {string} dir
 * @returns {string[]}
 */
function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  /** @type {string[]} */
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Check a file content for comment tags.
 * @param {string} filePath
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  // Regex to detect comment tags across line comments, block comments, JSDoc, or HTML comments.
  // Handles "// TAG:", "/* TAG:", "* TAG:", "<!-- TAG:", or inside multiline blocks.
  const tagRegex = /(?:\/\/|\/\*|\*|<!--|^|\s)\s*(FIXME|STUB|DEV):(?:\s*(.*))?/;

  lines.forEach((line, index) => {
    // Avoid false positives in non-comment code if any (e.g. string literals can be handled if needed,
    // but tag format usually strictly matches comment syntax).
    const match = line.match(tagRegex);
    if (!match) {
      return;
    }

    const tag = match[1];
    const text = (match[2] || '').replace(/-->|\*\/$/, '').trim();
    const lineNum = index + 1;

    if (mode === 'production') {
      if (tag === 'STUB' || tag === 'DEV') {
        diagnostics.push({
          file: filePath,
          line: lineNum,
          tag,
          message: text,
          type: 'error',
        });
      } else if (tag === 'FIXME') {
        diagnostics.push({
          file: filePath,
          line: lineNum,
          tag,
          message: text,
          type: 'warning',
        });
      }
    } else if (mode === 'development') {
      if (tag === 'DEV') {
        diagnostics.push({
          file: filePath,
          line: lineNum,
          tag,
          message: text,
          type: 'warning',
        });
      }
    }
  });
}

const files = getFiles(SRC_DIR);
for (const file of files) {
  scanFile(file);
}

let errorCount = 0;
let warningCount = 0;

for (const diag of diagnostics) {
  const relativePath = path.relative(process.cwd(), diag.file).replace(/\\/g, '/');
  if (diag.type === 'error') {
    errorCount++;
    console.error(`\x1b[31m[ERROR]\x1b[0m ${relativePath}:${diag.line} - "${diag.tag}:" comments are not allowed in ${mode} build: ${diag.message}`);
  } else {
    warningCount++;
    console.warn(`\x1b[33m[WARNING]\x1b[0m ${relativePath}:${diag.line} - "${diag.tag}:" comment detected: ${diag.message}`);
  }
}

if (errorCount > 0) {
  console.error(`\n\x1b[31mComment Check Failed:\x1b[0m ${errorCount} error(s), ${warningCount} warning(s) found.`);
  process.exit(1);
} else if (warningCount > 0) {
  console.log(`\n\x1b[33mComment Check Passed with Warnings:\x1b[0m ${warningCount} warning(s).`);
} else {
  console.log(`\x1b[32mComment Check Passed:\x1b[0m No forbidden comment tags in ${mode} mode.`);
}
