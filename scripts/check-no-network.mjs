// Fails the build if any source file references a network primitive, with
// one narrow, explicit allowlist: `fetch` is permitted only inside
// src/data/esharkRemote.ts, the single module that performs the user-
// triggered "Fetch E-Sh4rk scripts from GitHub" request. Everywhere else —
// and every other network primitive, even inside the allowlisted module —
// stays fully banned. This is a guardrail for the "no hidden network
// calls" safety property, not a "no network calls at all" one.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

// Relative to SRC, forward-slash form. The only file allowed to call fetch().
const ALLOWLISTED_FETCH_MODULE = 'data/esharkRemote.ts';

// Always banned, everywhere, no exceptions.
const ALWAYS_BANNED = [
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bnavigator\.sendBeacon\b/,
  /\bimport\s*\(\s*['"`]https?:/,
];

// Banned everywhere except the allowlisted fetch module.
const FETCH_BANNED = [/\bfetch\s*\(/];

// The only hosts the allowlisted module may build a URL against. Checked
// against the literal text of every `https://` occurrence in that file.
const APPROVED_URL_HOST_PREFIXES = ['github.com/', 'api.github.com/repos/', 'raw.githubusercontent.com/'];

// The allowlisted module must pin its owner/repo to these exact literal
// values — this is what the URL-template substitutions above resolve to,
// so this is what actually rules out fetching from an arbitrary repo.
const REQUIRED_CONSTANTS = [
  { name: 'GITHUB_OWNER', value: 'E-Sh4rk' },
  { name: 'GITHUB_REPO', value: 'EmeraldACE_web' },
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

function reportLineViolations(file, text, patterns) {
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rx of patterns) {
      if (rx.test(line)) {
        console.error(`network reference in ${file}:${i + 1}: ${line.trim()}`);
        violations += 1;
      }
    }
  });
}

/** Every `https://...` literal in the allowlisted module must target an approved host. */
function checkApprovedUrls(file, text) {
  const matches = text.match(/https:\/\/[^\s'"`]+/g) ?? [];
  for (const m of matches) {
    const rest = m.slice('https://'.length);
    if (!APPROVED_URL_HOST_PREFIXES.some((prefix) => rest.startsWith(prefix))) {
      console.error(`unapproved URL host in allowlisted remote module ${file}: ${m}`);
      violations += 1;
    }
  }
}

/** The allowlisted module must pin owner/repo to fixed literal values, not derive them from input. */
function checkRequiredConstants(file, text) {
  for (const { name, value } of REQUIRED_CONSTANTS) {
    const rx = new RegExp(`const\\s+${name}\\s*=\\s*['"\`]${value}['"\`]`);
    if (!rx.test(text)) {
      console.error(`allowlisted remote module ${file} must define "const ${name} = '${value}'" — not derive it from input.`);
      violations += 1;
    }
  }
}

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const relPath = relative(SRC, file).replace(/\\/g, '/');
  const isAllowlistedFetchModule = relPath === ALLOWLISTED_FETCH_MODULE;

  reportLineViolations(file, text, ALWAYS_BANNED);
  if (!isAllowlistedFetchModule) {
    reportLineViolations(file, text, FETCH_BANNED);
  } else {
    checkApprovedUrls(file, text);
    checkRequiredConstants(file, text);
  }
}

if (violations > 0) {
  console.error(`\nFAILED: ${violations} network policy violation(s) found in src/.`);
  process.exit(1);
}
console.log(`OK: no unapproved network references in src/. fetch() is allowed only in ${ALLOWLISTED_FETCH_MODULE}.`);
