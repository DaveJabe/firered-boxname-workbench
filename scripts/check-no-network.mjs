// Fails the build if any source file references a network primitive.
// This is a guardrail for the "no hidden network calls" safety property.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const BANNED = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bnavigator\.sendBeacon\b/,
  /\bimport\s*\(\s*['"`]https?:/,
];

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(ts|mts|js|mjs)$/.test(entry)) files.push(full);
  }
  return files;
}

let violations = 0;
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rx of BANNED) {
      if (rx.test(line)) {
        console.error(`network reference in ${file}:${i + 1}: ${line.trim()}`);
        violations += 1;
      }
    }
  });
}

if (violations > 0) {
  console.error(`\nFAILED: ${violations} network reference(s) found in src/.`);
  process.exit(1);
}
console.log('OK: no network references in src/.');
