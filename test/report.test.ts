import { describe, it, expect } from 'vitest';
import type { Project } from '../src/core/types.js';
import { createProject } from '../src/core/factory.js';
import { buildValidationResult } from '../src/core/validators.js';
import { renderReportHtml } from '../src/report/report.js';

const ISO = '2026-01-01T00:00:00.000Z';
function makeIdGen(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

function benignProject(): Project {
  const p = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'English', projectTitle: 'My notes', mode: 'documentation', templateKey: 'firered-setup-review' },
    makeIdGen(),
    () => ISO,
  );
  p.notes.push({ id: 'n1', sectionTitle: 'Overview', body: 'Some plain notes.', order: 0 });
  p.importedBlocks.push({
    id: 'b1', title: 'A block', categoryLabel: 'cat', revisionLabel: 'Rev 1',
    rawText: 'line one\nline two', notes: 'ok',
    source: { type: 'manual-paste', label: 'pasted', importedAt: ISO, schemaVersion: 1 },
  });
  return p;
}

function xssProject(): Project {
  const p = createProject(
    { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: '<script>alert(1)</script>', mode: 'documentation', templateKey: '' },
    makeIdGen(),
    () => ISO,
  );
  p.importedBlocks.push({
    id: 'b1', title: '<img src=x onerror=alert(2)>', categoryLabel: '', revisionLabel: '',
    rawText: '<script>evil()</script>', notes: '',
    source: { type: 'manual-paste', label: '<b>src</b>', importedAt: ISO, notes: '<script>prov()</script>', schemaVersion: 1 },
  });
  return p;
}

describe('report is script-free', () => {
  it('contains none of the script/handler/network tokens', () => {
    const html = renderReportHtml(benignProject(), ISO);
    for (const token of ['<script', 'onclick=', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon']) {
      expect(html).not.toContain(token);
    }
  });

  it('includes a strict CSP meta tag and a non-script print note', () => {
    const html = renderReportHtml(benignProject(), ISO);
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('Print / Save as PDF');
  });
});

describe('report escapes user text', () => {
  it('neutralizes HTML in user-supplied fields', () => {
    const html = renderReportHtml(xssProject(), ISO);
    // No live tags survive from user input.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    // The dangerous input appears only in escaped form.
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
  });
});

describe('report escapes provenance fields', () => {
  it('escapes source label and source notes', () => {
    const html = renderReportHtml(xssProject(), ISO);
    expect(html).toContain('&lt;b&gt;src&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;prov()&lt;/script&gt;');
    expect(html).not.toContain('<script');
  });
});

describe('report escapes external-tool provenance', () => {
  it('escapes toolName / toolVersion / toolUrl / invocationNotes', () => {
    const p = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    p.importedBlocks.push({
      id: 'b1', title: 't', categoryLabel: '', revisionLabel: '', rawText: 'ok', notes: '',
      source: {
        type: 'external-local-tool', label: 'e', importedAt: ISO, schemaVersion: 1,
        toolName: '<script>tn</script>', toolVersion: '<i>v</i>',
        toolUrl: '<img src=x>', invocationNotes: '<script>inv</script>',
      },
    });
    const html = renderReportHtml(p, ISO);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;tn&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;inv&lt;/script&gt;');
  });
});

describe('report escapes mock-output provenance', () => {
  it('escapes actionId / actionLabel / generatedBy and labels the block as mock output', () => {
    const p = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    p.importedBlocks.push({
      id: 'b1', title: 'Warp — mock output', categoryLabel: 'Mock output', revisionLabel: 'Rev 1',
      rawText: 'Box 1: PLACEHLD\nBox 2: PLACEHLD\nBox 3: PLACEHLD', notes: '',
      source: {
        type: 'mock-output', label: 'Mock generator output', importedAt: ISO, schemaVersion: 1,
        actionId: '<script>id</script>', actionLabel: '<script>al</script>', generatedBy: 'mock-generator-adapter',
      },
    });
    const html = renderReportHtml(p, ISO);
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;al&lt;/script&gt;');
    expect(html).toContain('mock-generator-adapter');
    expect(html).toContain('PLACEHLD');
  });
});

describe('report escapes manual-workflow provenance (filled-script / paste-back)', () => {
  it('escapes scriptId and shows generatedBy for a filled-script block', () => {
    const p = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    p.importedBlocks.push({
      id: 'b1', title: 'Toy — filled script', categoryLabel: 'Filled script', revisionLabel: 'Rev 1',
      rawText: 'widgetCount = 42', notes: '',
      source: {
        type: 'filled-script', label: 'Filled script (this app)', importedAt: ISO, schemaVersion: 1,
        actionId: 'toy', actionLabel: 'Toy', generatedBy: 'manual script filler',
        scriptId: '<script>sid</script>',
      },
    });
    const html = renderReportHtml(p, ISO);
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;sid&lt;/script&gt;');
    expect(html).toContain('manual script filler');
  });

  it('escapes pasted generator output and its provenance for an external-local-tool block', () => {
    const p = createProject(
      { revisionLabel: 'Rev 1', languageLabel: 'En', projectTitle: 'P', mode: 'documentation', templateKey: '' },
      makeIdGen(),
      () => ISO,
    );
    p.importedBlocks.push({
      id: 'b1', title: 'Toy — manual generator output', categoryLabel: 'Manual generator output', revisionLabel: 'Rev 1',
      rawText: '<script>evil()</script>\nPLACEHLD', notes: '',
      source: {
        type: 'external-local-tool', label: 'Manual external generator output', importedAt: ISO, schemaVersion: 1,
        actionId: 'toy', actionLabel: 'Toy', generatedBy: 'manual external generator', scriptId: 'script-1',
      },
    });
    const html = renderReportHtml(p, ISO);
    expect(html).not.toContain('<script>evil');
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
    expect(html).toContain('manual external generator');
    expect(html).toContain('PLACEHLD');
  });
});

describe('report groups findings by severity', () => {
  it('renders the Error section before the Warning section', () => {
    const p = createProject(
      { revisionLabel: '', languageLabel: '', projectTitle: 'X', mode: 'documentation', templateKey: 'firered-setup-review' },
      makeIdGen(),
      () => ISO,
    );
    p.latestValidation = buildValidationResult(p, ISO);
    const html = renderReportHtml(p, ISO);
    const errorIdx = html.indexOf('Error —');
    const warnIdx = html.indexOf('Warning —');
    expect(errorIdx).toBeGreaterThan(-1);
    expect(warnIdx).toBeGreaterThan(-1);
    expect(errorIdx).toBeLessThan(warnIdx);
  });
});
