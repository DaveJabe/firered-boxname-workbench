import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const SCRIPT_PATH = fileURLToPath(new URL('../scripts/check-no-network.mjs', import.meta.url));

function runAudit(): { status: number; output: string } {
  try {
    const output = execFileSync('node', [SCRIPT_PATH], { encoding: 'utf8' });
    return { status: 0, output };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { status: e.status, output: `${e.stdout}${e.stderr}` };
  }
}

describe('network audit — allowlist policy', () => {
  it('passes on the current repository (fetch confined to the one allowlisted module)', () => {
    const result = runAudit();
    expect(result.status).toBe(0);
    expect(result.output).toContain('data/esharkRemote.ts');
  });

  it('src/data/esharkRemote.ts is the only file allowed to reference fetch(', () => {
    // Sanity-check the allowlist is actually narrow, not accidentally widened.
    const scriptSrc = readFileSync(SCRIPT_PATH, 'utf8');
    expect(scriptSrc).toContain("ALLOWLISTED_FETCH_MODULE = 'data/esharkRemote.ts'");
  });

  it('still bans XMLHttpRequest/WebSocket/EventSource/sendBeacon inside the allowlisted module itself', () => {
    const scriptSrc = readFileSync(SCRIPT_PATH, 'utf8');
    // These patterns must be in the ALWAYS_BANNED set, not the fetch-only exception.
    expect(scriptSrc).toMatch(/ALWAYS_BANNED[\s\S]*XMLHttpRequest/);
    expect(scriptSrc).toMatch(/ALWAYS_BANNED[\s\S]*WebSocket/);
    expect(scriptSrc).toMatch(/ALWAYS_BANNED[\s\S]*EventSource/);
    expect(scriptSrc).toMatch(/ALWAYS_BANNED[\s\S]*sendBeacon/);
  });

  it('asserts the allowlisted module only targets approved GitHub hosts and pinned constants', () => {
    const remoteSrc = readFileSync(
      fileURLToPath(new URL('../src/data/esharkRemote.ts', import.meta.url)),
      'utf8',
    );
    const urls = remoteSrc.match(/https:\/\/[^\s'"`]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(
        url.includes('github.com/') || url.includes('api.github.com/repos/') || url.includes('raw.githubusercontent.com/'),
      ).toBe(true);
    }
    expect(remoteSrc).toContain("const GITHUB_OWNER = 'E-Sh4rk'");
    expect(remoteSrc).toContain("const GITHUB_REPO = 'EmeraldACE_web'");
  });
});
