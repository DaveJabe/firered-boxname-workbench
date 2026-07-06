// All DOM event handling: the delegated click/change dispatchers, every
// data-bind applier, file-import handlers, the GitHub fetch, and workspace
// lifecycle (open/create/reset). Extracted from app.ts as part of splitting
// the UI layer into smaller modules — no behavior change, same
// data-action/data-bind case list and same mutation/commit/render sequence
// as before. Only handleClick/handleChange (wired up by app.ts's init()) and
// openDefaultWorkspace (called once at startup) are used outside this
// module.

import type {
  Project,
  TargetKind,
  ImportedTextBlock,
  ChecklistItem,
  UserNote,
  ScriptFile,
  GameTarget,
  CuratedSchemaStatus,
  EsharkCategory,
  EsharkSourceProfile,
  ScriptPack,
} from '../core/types.js';
import type { ChecklistFilter } from '../core/review.js';
import { downloadText, openHtmlInNewTab, copyText } from './dom.js';
import { flashCopyFeedback } from './copyFeedback.js';
import { parseOptInt, unambiguousPresetMatch } from './viewModels.js';
import {
  state,
  nowIso,
  uid,
  render,
  commit,
  refreshSummaries,
  makeActionBuilderState,
  makeLocalGeneratorPocPanelState,
  openSchemaEditor,
  openSchemaEditorForExisting,
  toggleSchemaCandidate,
  buildDraftSchemaFromEditor,
  applySchemaEditorBinding,
  applySchemaFieldBinding,
  openReviewCaseEditor,
  buildReviewCaseFromEditor,
  applyReviewCaseEditorBinding,
  resolveActionDefinition,
  pickDefaultActionSelection,
  type ActionBuilderState,
} from './state.js';
import {
  type Screen,
  defaultScreenForWorkspace,
  findReusableUntitledWorkspace,
  mostRecentWorkspace,
  type WorkspaceOrigin,
} from './navigation.js';
import { createProject } from '../core/factory.js';
import { TEMPLATES } from '../templates/checklist-templates.js';
import {
  getProject,
  putProject,
  listProjects,
  deleteProject,
  exportProjectJson,
  importProjectJson,
  exportDraftActionSchemaJson,
  importCuratedActionSchemaJson,
  exportSchemaReviewCaseJson,
} from '../data/storage.js';
import { DEMO_PROJECT_JSON } from '../fixtures/demoProject.js';
import { buildValidationResult } from '../core/validators.js';
import { renderReportHtml } from '../report/report.js';
import { scanScript, buildDraftActionSchema, extractExitDirectiveValue } from '../core/scriptScanner.js';
import {
  upsertCuratedSchema,
  removeCuratedSchema,
  nextDuplicateSchemaId,
  duplicateCuratedSchema,
  detachCuratedSchema,
  countSavedOutputsUsingSchema,
} from '../core/curatedSchemas.js';
import { getRunnableActionsForTarget } from '../core/supportedActionRegistry.js';
import { verifySchemaReviewCase, runAllSchemaReviewCases } from '../core/schemaVerification.js';
import { createDraftSchemaFromFamilyMember } from '../core/schemaFamily.js';
import { validateDraftSchema } from '../core/schemaBuilder.js';
import { fillScriptFromSchema } from '../core/scriptFiller.js';
import { parseGeneratorOutput, formatCompactBoxNames, formatRawBoxLines } from '../core/generatorOutputParser.js';
import {
  collectScriptPackFiles,
  isRelevantPackFile,
  detectSourceFolderName,
  findEsharkGithubPacks,
  removeScriptPacks,
  type CollectedFile,
  type ScriptLibraryFilter,
} from '../core/scriptPack.js';
import { applyPreset } from '../core/schemaPresets.js';
import { SCHEMA_PRESETS } from '../templates/schema-presets.js';
import { computeScriptSupportInfo } from '../core/supportedScripts.js';
import {
  buildCuratedSchemaFromPreset,
  buildReviewedPresetExport,
  serializeReviewedPresetForExport,
  type ReviewedSchemaPreset,
} from '../core/reviewedSchemaPresets.js';
import { REVIEWED_SCHEMA_PRESETS } from '../templates/reviewed-schema-presets.js';
import {
  buildCatalogGapAudit,
  exportCatalogGapAuditJson,
  applyStaleFieldRepair,
} from '../core/catalogGapAudit.js';
import { UNKNOWN_TARGET } from '../core/gameTarget.js';
import {
  selectEsharkFiles,
  displayRootPath,
  parseEsharkListEntries,
  lookupEsharkListEntry,
  type SourceProfile,
} from '../core/esharkSource.js';
import { fetchEsharkFilesFrlg, EsharkFetchError } from '../data/esharkRemote.js';
import { resolveExitCompanionForScript } from '../core/exitCompanion.js';
import { buildGeneratorInputBundle, formatGeneratorInputBundleText } from '../core/generatorInputBundle.js';
// EXPERIMENTAL, DEV-ONLY. Only ever called from the "Local generator POC"
// panel's click handlers below (gated by the fbw.enableLocalGeneratorPoc
// localStorage flag), only on an explicit button click. See
// docs/local-generator-poc.md.
import { runLocalGeneratorPoc, detectLocalGeneratorArtifact } from '../experimental/localEsharkGeneratorPoc.js';
import { coerceActionFieldValue, defaultActionValues } from '../core/actionInput.js';
import { SOURCE_SCHEMA_VERSION } from '../core/sources.js';

function readVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
}

function readChecked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

async function loadProject(id: string): Promise<void> {
  const p = await getProject(id);
  if (p) {
    state.project = p;
    state.screen = defaultScreenForWorkspace('opened');
    resetViewState(p);
    render();
  }
}

function resetViewState(project: Project): void {
  state.checklistFilter = 'all';
  state.findingGroup = 'severity';
  state.collapsed.clear();
  state.blockEdit.clear();
  state.highlightRef = null;
  state.actionBuilder = makeActionBuilderState(project);
  state.schemaEditor = null;
  state.reviewCaseEditor = null;
  state.reviewCasesDetailSchemaId = null;
  state.batchVerificationResult = null;
  state.familyDetailScriptId = null;
  state.scriptsFilter = 'all';
  state.scriptsSearch = '';
  state.scriptsAdvancedOpen = false;
  state.catalogAuditOpen = false;
  state.catalogAuditIgnored.clear();
  state.pendingPackTarget = UNKNOWN_TARGET;
  state.pendingPackTargetNotes = '';
  state.pendingSourceProfile = 'generic';
  state.esharkFetchInProgress = false;
  state.localGeneratorPocPanel = makeLocalGeneratorPocPanelState();
}

/**
 * Take the user straight into a workspace for a primary action — the user is
 * never asked to fill in a title/revision/language first. Reuses the most
 * recently updated untitled workspace if one already exists, rather than
 * creating a new blank workspace every time; only creates one when none do.
 * They can fill in metadata later via Advanced -> Workspace Settings.
 */
async function startNewWorkspace(origin: WorkspaceOrigin): Promise<void> {
  const reusable = findReusableUntitledWorkspace(state.summaries);
  const project = reusable
    ? await getProject(reusable.id)
    : createProject(
        { revisionLabel: '', languageLabel: '', projectTitle: '', mode: 'documentation', templateKey: TEMPLATES[0].key },
        uid,
        nowIso,
      );
  if (!project) return; // reusable was deleted concurrently — vanishingly unlikely
  if (!reusable) await putProject(project);
  state.project = project;
  state.screen = defaultScreenForWorkspace(origin);
  resetViewState(project);
  await refreshSummaries();
}

/**
 * On app launch: silently reopen the most recently used workspace, or
 * create a fresh blank one if none exist yet, and land on Run Script. The
 * user should never have to pick or configure a workspace before using the
 * tool — full workspace management still lives under Advanced -> Workspaces.
 */
export async function openDefaultWorkspace(): Promise<void> {
  const recent = mostRecentWorkspace(state.summaries);
  let project: Project | undefined;
  try {
    project = recent ? await getProject(recent.id) : undefined;
  } catch {
    // A stored workspace that genuinely can't be migrated (e.g. corrupted)
    // must never block the app from rendering at all — fall through and
    // start a fresh one instead of leaving the screen blank.
    project = undefined;
  }
  if (!project) {
    project = createProject(
      { revisionLabel: '', languageLabel: '', projectTitle: '', mode: 'documentation', templateKey: TEMPLATES[0].key },
      uid,
      nowIso,
    );
    await putProject(project);
    state.summaries = await listProjects();
  }
  state.project = project;
  state.screen = 'actions';
  resetViewState(project);
}

function jumpTo(kind: TargetKind, ref: string | undefined): void {
  switch (kind) {
    case 'metadata': state.screen = 'settings'; break;
    case 'checklist': state.screen = 'checklist'; state.checklistFilter = 'all'; break;
    case 'note': state.screen = 'notes'; break;
    case 'importedBlock': state.screen = 'outputs'; if (ref) state.collapsed.delete(ref); break;
  }
  if (ref) state.highlightRef = ref;
  render();
}
export async function handleClick(e: Event): Promise<void> {
  const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  const p = state.project;

  switch (action) {
    case 'nav': {
      const screen = el.dataset.screen as Screen;
      if (screen === 'landing') state.manageWorkspacesOpen = false;
      state.screen = screen;
      render();
      break;
    }
    case 'start-with-action':
      await startNewWorkspace('created');
      break;
    case 'start-import-script':
      await startNewWorkspace('import-script');
      break;
    case 'toggle-manage-workspaces':
      state.manageWorkspacesOpen = !state.manageWorkspacesOpen;
      render();
      break;
    case 'load-demo': {
      const demo = importProjectJson(DEMO_PROJECT_JSON);
      demo.id = uid();
      const now = nowIso();
      demo.metadata.createdAt = now;
      demo.metadata.updatedAt = now;
      await putProject(demo);
      state.project = demo;
      state.screen = defaultScreenForWorkspace('demo');
      resetViewState(demo);
      await refreshSummaries();
      break;
    }
    case 'open':
      if (id) await loadProject(id);
      break;
    case 'delete':
      if (id && window.confirm('Delete this workspace? This cannot be undone.')) {
        await deleteProject(id);
        await refreshSummaries();
      }
      break;
    case 'import-json':
      (document.getElementById('import-file-input') as HTMLInputElement | null)?.click();
      break;
    case 'set-filter':
      state.checklistFilter = (el.dataset.filter as ChecklistFilter) ?? 'all';
      render();
      break;
    case 'set-finding-group':
      state.findingGroup = el.dataset.group === 'target' ? 'target' : 'severity';
      render();
      break;
    case 'jump':
      jumpTo(el.dataset.kind as TargetKind, el.dataset.ref);
      break;
    case 'toggle-collapse':
      if (id) {
        if (state.collapsed.has(id)) state.collapsed.delete(id);
        else state.collapsed.add(id);
        render();
      }
      break;
    case 'toggle-edit':
      if (id) {
        if (state.blockEdit.has(id)) state.blockEdit.delete(id);
        else state.blockEdit.add(id);
        render();
      }
      break;
    case 'copy-block': {
      if (!p || !id) break;
      const b = p.importedBlocks.find((x) => x.id === id);
      if (!b) break;
      const ok = await copyText(b.rawText);
      flashCopyFeedback(el, ok, 'Copied ✓');
      break;
    }
    case 'run-supported-script': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const ab = state.actionBuilder;
      ab.runTarget = schema.target;
      ab.selectedActionKey = schema.actionKey ?? schema.id;
      ab.curatedSchemaId = schema.id;
      const resolved = resolveActionDefinition(ab, p);
      ab.values = resolved ? defaultActionValues(resolved.template) : {};
      resetGeneratedOutput(ab);
      state.screen = 'actions';
      render();
      break;
    }
    case 'preview-filled-script': {
      if (!p) break;
      const ab = state.actionBuilder;
      const resolved = resolveActionDefinition(ab, p);
      const script = resolved?.curated.scriptId ? p.scripts.find((s) => s.id === resolved.curated.scriptId) : undefined;
      if (!resolved || !script) break;
      ab.filledScript = fillScriptFromSchema(script.rawText, resolved.curated, ab.values);
      ab.filledScriptSavedBlockId = null;
      render();
      break;
    }
    case 'copy-filled-script': {
      const ab = state.actionBuilder;
      if (!ab.filledScript || ab.filledScript.errors.length > 0) break;
      const ok = await copyText(ab.filledScript.filledScriptText);
      flashCopyFeedback(el, ok, 'Copied filled script ✓');
      break;
    }
    case 'copy-exit-name': {
      if (!p) break;
      const ab = state.actionBuilder;
      const curated = p.curatedSchemas.find((s) => s.id === ab.curatedSchemaId);
      const linkedScript = curated?.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
      const exitName = linkedScript ? extractExitDirectiveValue(linkedScript.rawText) : undefined;
      if (!exitName) break;
      const ok = await copyText(exitName);
      flashCopyFeedback(el, ok, 'Copied ✓');
      break;
    }
    case 'copy-exit-companion-text': {
      if (!p) break;
      const ab = state.actionBuilder;
      const curated = p.curatedSchemas.find((s) => s.id === ab.curatedSchemaId);
      const linkedScript = curated?.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
      if (!linkedScript) break;
      const resolution = resolveExitCompanionForScript(linkedScript, p.scripts, p.scriptPacks, nowIso);
      if (resolution.status !== 'resolved' || resolution.companionRawText === undefined) break;
      const ok = await copyText(resolution.companionRawText);
      flashCopyFeedback(el, ok, 'Copied exit companion ✓');
      break;
    }
    case 'copy-generator-input-bundle': {
      if (!p) break;
      const ab = state.actionBuilder;
      if (!ab.filledScript || ab.filledScript.errors.length > 0) break;
      const curated = p.curatedSchemas.find((s) => s.id === ab.curatedSchemaId);
      if (!curated) break;
      const linkedScript = curated.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
      const exitResolution = linkedScript ? resolveExitCompanionForScript(linkedScript, p.scripts, p.scriptPacks, nowIso) : undefined;
      // Disabled in the UI (generatorInputSectionHtml) whenever there's an
      // exit directive but no resolved companion — mirrored here so the
      // handler can't be triggered some other way (e.g. re-enabling the
      // disabled attribute via devtools) and silently ship an incomplete
      // "full" bundle. An action with no exit directive at all is unaffected.
      if (exitResolution?.status === 'missing') break;
      const bundle = buildGeneratorInputBundle({
        generatedAt: nowIso(),
        actionKey: curated.actionKey,
        schemaId: curated.id,
        schemaLabel: curated.label,
        scriptId: linkedScript?.id,
        scriptFilename: linkedScript?.filename,
        target: curated.target,
        filledScriptText: ab.filledScript.filledScriptText,
        exitResolution,
      });
      const ok = await copyText(formatGeneratorInputBundleText(bundle));
      flashCopyFeedback(el, ok, 'Copied generator input bundle ✓');
      break;
    }
    case 'save-filled-script': {
      if (!p) break;
      const ab = state.actionBuilder;
      const resolved = resolveActionDefinition(ab, p);
      if (!resolved || !ab.filledScript || ab.filledScript.errors.length > 0 || !resolved.curated.scriptId) break;
      const { template, curated } = resolved;
      const script = p.scripts.find((s) => s.id === curated.scriptId);
      const now = nowIso();
      const block: ImportedTextBlock = {
        id: uid(),
        title: `${template.label} — filled script`,
        categoryLabel: 'Filled script',
        revisionLabel: ab.revisionLabel,
        rawText: ab.filledScript.filledScriptText,
        notes: '',
        source: {
          type: 'filled-script',
          label: 'Filled script (this app)',
          importedAt: now,
          schemaVersion: SOURCE_SCHEMA_VERSION,
          actionId: template.id,
          actionLabel: template.label,
          generatedBy: 'manual script filler',
          scriptId: curated.scriptId,
          filename: script?.filename,
        },
      };
      p.importedBlocks.push(block);
      ab.filledScriptSavedBlockId = block.id;
      commit();
      break;
    }
    case 'preview-pasted-output': {
      const ab = state.actionBuilder;
      ab.pasteBack.parsed = parseGeneratorOutput(ab.pasteBack.rawText);
      render();
      break;
    }
    case 'copy-parsed-compact': {
      const ab = state.actionBuilder;
      const idx = Number(el.dataset.row);
      const row = ab.pasteBack.parsed?.rows[idx];
      if (!row || row.compactText === null) break;
      const ok = await copyText(row.compactText);
      flashCopyFeedback(el, ok, 'Copied ✓');
      break;
    }
    case 'copy-parsed-raw': {
      const ab = state.actionBuilder;
      const idx = Number(el.dataset.row);
      const row = ab.pasteBack.parsed?.rows[idx];
      if (!row) break;
      const ok = await copyText(row.rawLine);
      flashCopyFeedback(el, ok, 'Copied ✓');
      break;
    }
    case 'copy-all-compact': {
      const ab = state.actionBuilder;
      if (!ab.pasteBack.parsed) break;
      const ok = await copyText(formatCompactBoxNames(ab.pasteBack.parsed.rows));
      flashCopyFeedback(el, ok, 'Copied box names ✓');
      break;
    }
    case 'copy-all-raw-box-lines': {
      const ab = state.actionBuilder;
      if (!ab.pasteBack.parsed) break;
      const ok = await copyText(formatRawBoxLines(ab.pasteBack.parsed.rows));
      flashCopyFeedback(el, ok, 'Copied box names ✓');
      break;
    }
    case 'copy-pasted-output': {
      const ab = state.actionBuilder;
      const ok = await copyText(ab.pasteBack.rawText);
      flashCopyFeedback(el, ok, 'Copied ✓');
      break;
    }
    case 'save-pasted-output': {
      if (!p) break;
      const ab = state.actionBuilder;
      const pb = ab.pasteBack;
      if (!pb.rawText) break;
      const resolved = resolveActionDefinition(ab, p);
      if (!resolved) break;
      const { template, curated } = resolved;
      const linkedScript = curated.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
      const now = nowIso();
      const block: ImportedTextBlock = {
        id: uid(),
        title: pb.label.trim() || `${template.label} — manual generator output`,
        categoryLabel: 'Manual generator output',
        revisionLabel: ab.revisionLabel,
        rawText: pb.rawText,
        notes: '',
        source: {
          type: 'external-local-tool',
          label: 'Manual external generator output',
          importedAt: now,
          schemaVersion: SOURCE_SCHEMA_VERSION,
          actionId: template.id,
          actionLabel: template.label,
          generatedBy: 'manual external generator',
          scriptId: linkedScript?.id,
          filename: linkedScript?.filename,
        },
      };
      p.importedBlocks.push(block);
      pb.savedBlockId = block.id;
      commit();
      break;
    }
    case 'import-script':
      (document.getElementById('script-file-input') as HTMLInputElement | null)?.click();
      break;
    case 'import-script-folder':
      (document.getElementById('script-folder-input') as HTMLInputElement | null)?.click();
      break;
    case 'fetch-eshark-github':
      void handleFetchEsharkGithub();
      break;
    case 'delete-eshark-pack': {
      if (!p || !id) break;
      const pack = p.scriptPacks.find((pk) => pk.id === id);
      if (!pack) break;
      const confirmed = window.confirm(
        `Delete fetched pack "${pack.name}" and its scripts? Reviewed schemas and saved outputs will be preserved.`,
      );
      if (!confirmed) break;
      const removal = removeScriptPacks(p.scripts, p.curatedSchemas, p.scriptPacks, new Set([id]));
      p.scripts = removal.scripts;
      p.curatedSchemas = removal.curatedSchemas;
      p.scriptPacks = removal.scriptPacks;
      commit();
      break;
    }
    case 'remove-script':
      if (p && id) {
        p.scripts = p.scripts.filter((s) => s.id !== id);
        for (const pack of p.scriptPacks) pack.scriptIds = pack.scriptIds.filter((sid) => sid !== id);
        commit();
      }
      break;
    case 'run-scan': {
      if (!p || !id) break;
      const script = p.scripts.find((s) => s.id === id);
      if (!script) break;
      script.lastScan = scanScript(script, nowIso);
      commit();
      break;
    }
    case 'scan-all-in-pack': {
      if (!p || !id) break;
      for (const s of p.scripts.filter((s) => s.packId === id)) s.lastScan = scanScript(s, nowIso);
      commit();
      break;
    }
    case 'set-scripts-filter':
      state.scriptsFilter = (el.dataset.filter as ScriptLibraryFilter) ?? 'all';
      render();
      break;
    case 'open-script':
      if (id) {
        state.scriptsFilter = 'all';
        state.scriptsSearch = '';
        state.highlightRef = id;
        state.scriptsAdvancedOpen = true;
      }
      render();
      break;
    case 'apply-schema-preset': {
      if (!p || !id) break;
      const presetId = el.dataset.preset;
      const script = p.scripts.find((s) => s.id === id);
      const preset = SCHEMA_PRESETS.find((pr) => pr.id === presetId);
      if (!script || !preset) break;
      upsertCuratedSchema(p.curatedSchemas, applyPreset(preset, script));
      commit();
      break;
    }
    case 'apply-reviewed-preset': {
      if (!p || !id) break;
      const presetId = el.dataset.preset;
      const script = p.scripts.find((s) => s.id === id);
      const preset = REVIEWED_SCHEMA_PRESETS.find((pr) => pr.id === presetId);
      if (!script || !preset) break;
      upsertCuratedSchema(p.curatedSchemas, buildCuratedSchemaFromPreset(preset, script));
      commit();
      break;
    }
    case 'apply-all-unambiguous-presets': {
      if (!p) break;
      const candidates = p.scripts
        .filter((script) => computeScriptSupportInfo(script, p.curatedSchemas).bucket !== 'ready')
        .map((script) => ({ script, preset: unambiguousPresetMatch(script, p) }))
        .filter((c): c is { script: ScriptFile; preset: ReviewedSchemaPreset } => !!c.preset);
      if (candidates.length === 0) break;
      const listing = candidates.map((c) => `${c.script.filename} → ${c.preset.label}`).join('\n');
      const confirmed = window.confirm(
        `Apply ${candidates.length} unambiguous reviewed preset${candidates.length === 1 ? '' : 's'}?\n\n${listing}`,
      );
      if (!confirmed) break;
      for (const c of candidates) {
        upsertCuratedSchema(p.curatedSchemas, buildCuratedSchemaFromPreset(c.preset, c.script));
      }
      commit();
      break;
    }
    case 'export-draft-schema': {
      if (!p || !id) break;
      const script = p.scripts.find((s) => s.id === id);
      if (!script || !script.lastScan) break;
      const schema = buildDraftActionSchema(script, script.lastScan, nowIso);
      const base = script.filename.replace(/\.txt$/i, '') || 'script';
      downloadText(`${base}-draft-schema.json`, exportDraftActionSchemaJson(schema), 'application/json');
      break;
    }
    case 'export-catalog-audit': {
      if (!p) break;
      const audit = buildCatalogGapAudit(p, nowIso);
      downloadText('catalog-gap-audit.json', exportCatalogGapAuditJson(audit), 'application/json');
      break;
    }
    case 'ignore-catalog-finding':
      if (id) state.catalogAuditIgnored.add(id);
      render();
      break;
    case 'repair-stale-field': {
      if (!p || !id) break;
      const variableName = el.dataset.variable;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema || !variableName) break;
      const audit = buildCatalogGapAudit(p, nowIso);
      const finding = audit.staleSchemaFields.find((f) => f.schemaId === id && f.classification.variableName === variableName);
      if (!finding) break;
      const afterDescription = finding.suggestedType === 'reference-select'
        ? `reference-select (catalog: ${finding.classification.catalogId})`
        : `select (${finding.classification.boundedPresetId})`;
      const confirmed = window.confirm(
        `Repair "${variableName}" on "${schema.label}"?\n\nBefore: ${finding.currentType}\nAfter: ${afterDescription}\n\nThis only changes this one field's type/options — nothing else about the schema.`,
      );
      if (!confirmed) break;
      upsertCuratedSchema(p.curatedSchemas, applyStaleFieldRepair(schema, finding));
      commit();
      break;
    }
    case 'export-reviewed-preset': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const script = schema.scriptId ? p.scripts.find((s) => s.id === schema.scriptId) : undefined;
      const scriptFilename = schema.scriptFilename ?? script?.filename;
      if (!scriptFilename) {
        window.alert('This schema has no linked script filename to match against — attach it to a script first.');
        break;
      }
      const reviewerNote = window.prompt('Optional reviewer note (leave blank to skip):', '') ?? undefined;
      const preset = buildReviewedPresetExport({
        schema,
        scriptFilename,
        scriptTitle: script?.lastScan?.title,
        category: script?.category,
        reviewerNote: reviewerNote && reviewerNote.trim() ? reviewerNote.trim() : undefined,
        reviewedAt: nowIso(),
      });
      const base = preset.id || 'reviewed-preset';
      downloadText(`${base}.json`, serializeReviewedPresetForExport(preset), 'application/json');
      break;
    }
    case 'edit-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      openSchemaEditorForExisting(schema, p);
      render();
      break;
    }
    case 'duplicate-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const newId = nextDuplicateSchemaId(schema.id, p.curatedSchemas.map((s) => s.id));
      upsertCuratedSchema(p.curatedSchemas, duplicateCuratedSchema(schema, newId));
      commit();
      break;
    }
    case 'detach-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      upsertCuratedSchema(p.curatedSchemas, detachCuratedSchema(schema));
      commit();
      break;
    }
    case 'set-schema-status': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      const status = el.dataset.status as CuratedSchemaStatus | undefined;
      if (!schema || !status) break;
      schema.status = status;
      commit();
      break;
    }
    case 'delete-curated-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const usageCount = countSavedOutputsUsingSchema(p.importedBlocks, schema.id);
      const usageWarning = usageCount > 0
        ? `\n\nNote: ${usageCount} saved output(s) were generated using this schema. They will not be deleted or altered, but you may want to review them.`
        : '';
      const confirmed = window.confirm(
        `Delete this curated schema? This does not delete the script file or saved outputs.${usageWarning}`,
      );
      if (!confirmed) break;
      removeCuratedSchema(p.curatedSchemas, schema.id);
      if (state.schemaEditor?.id === schema.id) state.schemaEditor = null;
      commit();
      break;
    }
    case 'attach-curated-schema':
      if (id) (document.getElementById(`curated-schema-input-${id}`) as HTMLInputElement | null)?.click();
      break;
    case 'goto-run-script-for-schema': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      const ab = state.actionBuilder;
      ab.runTarget = schema.target;
      ab.selectedActionKey = schema.actionKey ?? schema.id;
      ab.curatedSchemaId = schema.id;
      const resolved = resolveActionDefinition(ab, p);
      ab.values = resolved ? defaultActionValues(resolved.template) : {};
      resetGeneratedOutput(ab);
      state.screen = 'actions';
      render();
      break;
    }
    case 'view-review-cases':
      if (id) state.reviewCasesDetailSchemaId = state.reviewCasesDetailSchemaId === id ? null : id;
      render();
      break;
    case 'run-schema-verification': {
      if (!p || !id) break;
      const schema = p.curatedSchemas.find((s) => s.id === id);
      if (!schema) break;
      for (const reviewCase of p.schemaReviewCases.filter((c) => c.schemaId === id)) {
        if (reviewCase.status === 'accepted') continue; // a human's explicit override — never silently overwritten by a live check
        reviewCase.status = verifySchemaReviewCase(p, schema, reviewCase).status;
      }
      commit();
      break;
    }
    case 'run-all-schema-verification': {
      if (!p) break;
      const batch = runAllSchemaReviewCases(p, nowIso);
      // Persist only what was actually live-checked — 'accepted'/'draft' cases keep their own
      // stored status untouched, and 'not-available' has no corresponding SchemaReviewCaseStatus.
      for (const result of batch.results) {
        if (result.verification) result.reviewCase.status = result.verification.status;
      }
      state.batchVerificationResult = batch;
      commit();
      break;
    }
    case 'run-review-case': {
      if (!p || !id) break;
      const reviewCase = p.schemaReviewCases.find((c) => c.id === id);
      const schema = reviewCase?.schemaId ? p.curatedSchemas.find((s) => s.id === reviewCase.schemaId) : undefined;
      if (!reviewCase || !schema) break;
      reviewCase.status = verifySchemaReviewCase(p, schema, reviewCase).status;
      commit();
      break;
    }
    case 'accept-review-case': {
      if (!p || !id) break;
      const reviewCase = p.schemaReviewCases.find((c) => c.id === id);
      if (!reviewCase) break;
      reviewCase.status = 'accepted';
      reviewCase.reviewedAt = nowIso();
      commit();
      break;
    }
    case 'export-review-case': {
      if (!p || !id) break;
      const reviewCase = p.schemaReviewCases.find((c) => c.id === id);
      if (!reviewCase) break;
      downloadText(`review-case-${reviewCase.id}.json`, exportSchemaReviewCaseJson(reviewCase), 'application/json');
      break;
    }
    case 'delete-review-case': {
      if (!p || !id) break;
      const confirmed = window.confirm('Delete this review case? This cannot be undone.');
      if (!confirmed) break;
      p.schemaReviewCases = p.schemaReviewCases.filter((c) => c.id !== id);
      commit();
      break;
    }
    case 'view-similar-scripts':
      if (id) state.familyDetailScriptId = state.familyDetailScriptId === id ? null : id;
      render();
      break;
    case 'apply-schema-pattern': {
      if (!p || !id) break;
      const targetScript = p.scripts.find((s) => s.id === id);
      const sourceSchemaId = el.dataset.schema;
      const sourceSchema = sourceSchemaId ? p.curatedSchemas.find((s) => s.id === sourceSchemaId) : undefined;
      if (!targetScript || !sourceSchema) break;
      const draft = createDraftSchemaFromFamilyMember(sourceSchema, targetScript);
      upsertCuratedSchema(p.curatedSchemas, draft);
      commit();
      break;
    }
    case 'create-schema-from-scan': {
      if (!p || !id) break;
      const script = p.scripts.find((s) => s.id === id);
      if (script) openSchemaEditor(script, p);
      render();
      break;
    }
    case 'close-schema-editor':
      state.schemaEditor = null;
      render();
      break;
    case 'toggle-schema-candidate-off':
      if (id) {
        toggleSchemaCandidate(id, false);
        render();
      }
      break;
    case 'save-schema-from-editor': {
      if (!p) break;
      const editor = state.schemaEditor;
      if (!editor) break;
      const script = p.scripts.find((s) => s.id === editor.scriptId);
      if (!script) break;
      const draft = buildDraftSchemaFromEditor(editor, script);
      const errors = validateDraftSchema(draft, p);
      editor.errors = errors;
      if (errors.length > 0) {
        render();
        break;
      }
      upsertCuratedSchema(p.curatedSchemas, draft);
      editor.savedSchemaId = draft.id;
      commit();
      break;
    }
    case 'open-review-case-editor': {
      if (!p) break;
      const ab = state.actionBuilder;
      const resolved = resolveActionDefinition(ab, p);
      if (!resolved) break;
      const script = resolved.curated.scriptId ? p.scripts.find((s) => s.id === resolved.curated.scriptId) : undefined;
      openReviewCaseEditor(resolved.curated, script, ab);
      render();
      break;
    }
    case 'cancel-review-case-editor':
      state.reviewCaseEditor = null;
      render();
      break;
    case 'save-review-case-from-editor': {
      if (!p) break;
      const editor = state.reviewCaseEditor;
      if (!editor) break;
      const reviewCase = buildReviewCaseFromEditor(editor, uid(), nowIso());
      p.schemaReviewCases.push(reviewCase);
      editor.savedCaseId = reviewCase.id;
      commit();
      break;
    }
    case 'add-checklist': {
      if (!p) break;
      const prompt = readVal('ci-prompt').trim();
      if (!prompt) break;
      const item: ChecklistItem = {
        id: uid(),
        prompt,
        category: readVal('ci-category').trim() || 'Custom',
        state: 'unchecked',
        note: '',
        required: readChecked('ci-required'),
      };
      p.checklist.push(item);
      commit();
      break;
    }
    case 'remove-checklist':
      if (p && id) {
        p.checklist = p.checklist.filter((i) => i.id !== id);
        commit();
      }
      break;
    case 'add-note': {
      if (!p) break;
      const note: UserNote = {
        id: uid(),
        sectionTitle: readVal('nn-title').trim(),
        body: readVal('nn-body'),
        order: p.notes.length,
      };
      p.notes.push(note);
      commit();
      break;
    }
    case 'remove-note':
      if (p && id) {
        p.notes = p.notes.filter((n) => n.id !== id);
        commit();
      }
      break;
    case 'add-block': {
      if (!p) break;
      const now = nowIso();
      const block: ImportedTextBlock = {
        id: uid(),
        title: readVal('nb-title').trim(),
        categoryLabel: readVal('nb-category').trim(),
        revisionLabel: p.metadata.revisionLabel,
        rawText: readVal('nb-text'),
        notes: '',
        source: { type: 'manual-paste', label: 'Manual paste', importedAt: now, schemaVersion: SOURCE_SCHEMA_VERSION },
      };
      p.importedBlocks.push(block);
      commit();
      break;
    }
    case 'load-block':
      (document.getElementById('block-file-input') as HTMLInputElement | null)?.click();
      break;
    case 'remove-block':
      if (p && id) {
        p.importedBlocks = p.importedBlocks.filter((b) => b.id !== id);
        state.collapsed.delete(id);
        state.blockEdit.delete(id);
        commit();
      }
      break;
    case 'run-validation':
      if (p) {
        p.latestValidation = buildValidationResult(p, nowIso());
        if (p.projectStatus === 'draft') p.projectStatus = 'in-review';
        commit();
      }
      break;
    case 'clear-validation':
      if (p) {
        p.latestValidation = null;
        commit();
      }
      break;
    case 'open-report':
      if (p) openHtmlInNewTab(renderReportHtml(p, nowIso()));
      break;
    case 'export-json':
      if (p) downloadText(`${p.metadata.projectTitle || 'project'}.json`, exportProjectJson(p), 'application/json');
      break;
    // EXPERIMENTAL, DEV-ONLY — see docs/local-generator-poc.md. Every case
    // below only ever runs from an explicit click on the gated panel in
    // Advanced; none of them run the generator itself.
    case 'use-resolved-exit-companion': {
      if (!p) break;
      const ab = state.actionBuilder;
      const curated = p.curatedSchemas.find((s) => s.id === ab.curatedSchemaId);
      const linkedScript = curated?.scriptId ? p.scripts.find((s) => s.id === curated.scriptId) : undefined;
      if (!linkedScript) break;
      const resolution = resolveExitCompanionForScript(linkedScript, p.scripts, p.scriptPacks, nowIso);
      if (resolution.status !== 'resolved' || resolution.companionRawText === undefined) break;
      state.localGeneratorPocPanel.exitCompanionText = resolution.companionRawText;
      render();
      break;
    }
    case 'check-local-generator-artifact': {
      const poc = state.localGeneratorPocPanel;
      poc.artifactStatus = 'checking';
      render();
      const detected = await detectLocalGeneratorArtifact();
      poc.artifactStatus = detected ? 'detected' : 'missing';
      render();
      break;
    }
    case 'run-local-generator-poc': {
      const poc = state.localGeneratorPocPanel;
      const ab = state.actionBuilder;
      if (!ab.filledScript || poc.running) break;
      poc.running = true;
      render();
      const curated = p?.curatedSchemas.find((s) => s.id === ab.curatedSchemaId);
      poc.lastResult = await runLocalGeneratorPoc({
        filledScriptText: ab.filledScript.filledScriptText,
        exitCompanionText: poc.exitCompanionText,
        target: ab.runTarget,
        actionKey: ab.selectedActionKey || undefined,
        schemaId: ab.curatedSchemaId,
        scriptId: curated?.scriptId,
      });
      poc.running = false;
      render();
      break;
    }
  }
}

export async function handleChange(e: Event): Promise<void> {
  const t = e.target as HTMLElement;
  const action = t.dataset.action;
  if (action === 'import-file') {
    await handleImportFile(t as HTMLInputElement);
    return;
  }
  if (action === 'block-file') {
    await handleBlockFile(t as HTMLInputElement);
    return;
  }
  if (action === 'script-file') {
    await handleScriptFile(t as HTMLInputElement);
    return;
  }
  if (action === 'script-folder-file') {
    await handleScriptFolderFile(t as HTMLInputElement);
    return;
  }
  if (action === 'curated-schema-file') {
    await handleCuratedSchemaFile(t as HTMLInputElement);
    return;
  }
  const bind = t.dataset.bind;
  if (!bind) return;
  const id = t.dataset.id;
  const input = t as HTMLInputElement;
  const value = input.value;
  const checked = input.type === 'checkbox' ? input.checked : undefined;
  if (bind.startsWith('action.')) {
    applyActionBinding(bind, id, value, checked);
    render();
    return;
  }
  if (bind.startsWith('pasteback.')) {
    applyPasteBackBinding(bind, value);
    render();
    return;
  }
  if (bind === 'schema-candidate.include') {
    toggleSchemaCandidate(id ?? '', checked ?? false);
    render();
    return;
  }
  if (bind.startsWith('schema-field.')) {
    applySchemaFieldBinding(bind, id, value, checked);
    render();
    return;
  }
  if (bind.startsWith('schema.')) {
    applySchemaEditorBinding(bind, value);
    render();
    return;
  }
  if (bind.startsWith('reviewcase.')) {
    applyReviewCaseEditorBinding(bind, value);
    render();
    return;
  }
  if (bind === 'scripts.search') {
    state.scriptsSearch = value;
    render();
    return;
  }
  if (bind === 'pendingPackTarget.game') {
    state.pendingPackTarget = { ...state.pendingPackTarget, game: value as GameTarget['game'] };
    render();
    return;
  }
  if (bind === 'pendingPackTarget.language') {
    state.pendingPackTarget = { ...state.pendingPackTarget, language: value as GameTarget['language'] };
    render();
    return;
  }
  if (bind === 'pendingPackTarget.revision') {
    state.pendingPackTarget = { ...state.pendingPackTarget, revision: value as GameTarget['revision'] };
    render();
    return;
  }
  if (bind === 'pendingPackTargetNotes') {
    state.pendingPackTargetNotes = value;
    render();
    return;
  }
  if (bind === 'pendingSourceProfile') {
    state.pendingSourceProfile = value as SourceProfile;
    render();
    return;
  }
  if (bind === 'localGeneratorPoc.exitCompanionText') {
    state.localGeneratorPocPanel.exitCompanionText = value;
    render();
    return;
  }
  applyBinding(bind, id, value, checked);
}

function resetGeneratedOutput(ab: ActionBuilderState): void {
  ab.filledScript = null;
  ab.filledScriptSavedBlockId = null;
}

/** After the run target changes: keep the current schema selected only if it's
 *  still a default match for the new target, else fall back to the first
 *  default match (or none) — never silently keep an incompatible selection. */
function onRunTargetChanged(ab: ActionBuilderState, project: Project | null): void {
  if (!project) return;
  const picked = pickDefaultActionSelection(getRunnableActionsForTarget(project, ab.runTarget), ab.selectedActionKey, ab.curatedSchemaId);
  ab.selectedActionKey = picked.actionKey;
  ab.curatedSchemaId = picked.schemaId;
  const resolved = resolveActionDefinition(ab, project);
  ab.values = resolved ? defaultActionValues(resolved.template) : {};
  resetGeneratedOutput(ab);
}

function applyActionBinding(bind: string, id: string | undefined, value: string, checked: boolean | undefined): void {
  const ab = state.actionBuilder;
  const project = state.project;
  switch (bind) {
    case 'action.revisionLabel':
      ab.revisionLabel = value;
      break;
    case 'action.selectedActionKey': {
      ab.selectedActionKey = value;
      if (project) {
        const action = getRunnableActionsForTarget(project, ab.runTarget).find((a) => a.actionKey === value);
        ab.curatedSchemaId = action?.variants[0]?.schemaId ?? '';
        const resolved = resolveActionDefinition(ab, project);
        if (resolved) ab.values = defaultActionValues(resolved.template);
      }
      resetGeneratedOutput(ab);
      break;
    }
    case 'action.curatedSchemaId': {
      ab.curatedSchemaId = value;
      if (project) {
        const resolved = resolveActionDefinition(ab, project);
        if (resolved) ab.values = defaultActionValues(resolved.template);
      }
      resetGeneratedOutput(ab);
      break;
    }
    case 'action.runTarget.game':
      ab.runTarget = { ...ab.runTarget, game: value as GameTarget['game'] };
      onRunTargetChanged(ab, project);
      break;
    case 'action.runTarget.language':
      ab.runTarget = { ...ab.runTarget, language: value as GameTarget['language'] };
      onRunTargetChanged(ab, project);
      break;
    case 'action.runTarget.revision':
      ab.runTarget = { ...ab.runTarget, revision: value as GameTarget['revision'] };
      onRunTargetChanged(ab, project);
      break;
    case 'action.field': {
      if (!id || !project) break;
      const resolved = resolveActionDefinition(ab, project);
      if (!resolved) break;
      const field = resolved.template.fields.find((f) => f.key === id);
      if (!field) break;
      ab.values[id] = coerceActionFieldValue(field, value, checked);
      break;
    }
    case 'action.field-search':
      if (id) ab.referenceSearch[id] = value;
      break;
  }
}

function applyPasteBackBinding(bind: string, value: string): void {
  const pb = state.actionBuilder.pasteBack;
  switch (bind) {
    case 'pasteback.rawText':
      pb.rawText = value;
      pb.parsed = null;
      pb.savedBlockId = null;
      break;
    case 'pasteback.label':
      pb.label = value;
      break;
  }
}

function applyBinding(bind: string, id: string | undefined, value: string, checked: boolean | undefined): void {
  const p = state.project;
  if (!p) return;
  switch (bind) {
    case 'metadata.revisionLabel': p.metadata.revisionLabel = value; break;
    case 'metadata.languageLabel': p.metadata.languageLabel = value; break;
    case 'metadata.projectTitle': p.metadata.projectTitle = value; break;
    case 'metadata.mode': p.metadata.mode = value as Project['metadata']['mode']; break;
    case 'status': p.projectStatus = value as Project['projectStatus']; break;
    case 'checklist.state': {
      const it = p.checklist.find((i) => i.id === id);
      if (it) it.state = value as ChecklistItem['state'];
      break;
    }
    case 'checklist.note': {
      const it = p.checklist.find((i) => i.id === id);
      if (it) it.note = value;
      break;
    }
    case 'note.sectionTitle': {
      const n = p.notes.find((x) => x.id === id);
      if (n) n.sectionTitle = value;
      break;
    }
    case 'note.body': {
      const n = p.notes.find((x) => x.id === id);
      if (n) n.body = value;
      break;
    }
    case 'script.notes': setScript(id, (s) => (s.notes = value)); break;
    case 'block.title': setBlock(id, (b) => (b.title = value)); break;
    case 'block.categoryLabel': setBlock(id, (b) => (b.categoryLabel = value)); break;
    case 'block.revisionLabel': setBlock(id, (b) => (b.revisionLabel = value)); break;
    case 'block.notes': setBlock(id, (b) => (b.notes = value)); break;
    case 'block.rawText': setBlock(id, (b) => (b.rawText = value)); break;
    case 'source.type': setBlock(id, (b) => (b.source.type = value as ImportedTextBlock['source']['type'])); break;
    case 'source.label': setBlock(id, (b) => (b.source.label = value)); break;
    case 'source.notes': setBlock(id, (b) => (b.source.notes = value)); break;
    case 'source.toolName': setBlock(id, (b) => (b.source.toolName = value)); break;
    case 'source.toolVersion': setBlock(id, (b) => (b.source.toolVersion = value)); break;
    case 'source.toolUrl': setBlock(id, (b) => (b.source.toolUrl = value)); break;
    case 'source.invocationNotes': setBlock(id, (b) => (b.source.invocationNotes = value)); break;
    case 'settings.maxLineLength': {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n) && n > 0) p.settings.maxLineLength = n;
      break;
    }
    case 'settings.countMode': p.settings.countMode = value === 'utf16' ? 'utf16' : 'codepoints'; break;
    case 'settings.expectedLineMin': p.settings.expectedLineMin = parseOptInt(value); break;
    case 'settings.expectedLineMax': p.settings.expectedLineMax = parseOptInt(value); break;
    case 'settings.allowedGlyphs': p.settings.allowedGlyphs = value; break;
    case 'finding.ack': {
      const f = p.latestValidation?.findings.find((x) => x.id === id);
      if (f) f.acknowledged = checked ?? false;
      break;
    }
  }
  commit();
}

function setBlock(id: string | undefined, fn: (b: ImportedTextBlock) => void): void {
  const b = state.project?.importedBlocks.find((x) => x.id === id);
  if (b) fn(b);
}

function setScript(id: string | undefined, fn: (s: ScriptFile) => void): void {
  const s = state.project?.scripts.find((x) => x.id === id);
  if (s) fn(s);
}

async function handleImportFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await readFileText(file);
    const project = importProjectJson(text);
    await putProject(project);
    await refreshSummaries();
    window.alert('Workspace imported.');
  } catch (err) {
    window.alert(`Import failed: ${(err as Error).message}`);
  }
}

async function handleBlockFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  const p = state.project;
  if (!file || !p) return;
  const text = await readFileText(file);
  const now = nowIso();
  p.importedBlocks.push({
    id: uid(),
    title: file.name,
    categoryLabel: '',
    revisionLabel: p.metadata.revisionLabel,
    rawText: text,
    notes: '',
    source: { type: 'file-import', label: file.name, importedAt: now, filename: file.name, schemaVersion: SOURCE_SCHEMA_VERSION },
  });
  commit();
}

async function handleScriptFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = '';
  const p = state.project;
  if (!file || !p) return;
  const text = await readFileText(file);
  const script: ScriptFile = { id: uid(), filename: file.name, rawText: text, importedAt: nowIso() };
  p.scripts.push(script);
  commit();
}

/** Reads only .txt scripts and recognized metadata files (e.g. list.json) out
 *  of a directory-picker selection — never fetched, never executed, no
 *  particular folder layout required. */
interface EsharkPackSource {
  sourceProfile: EsharkSourceProfile;
  packName: string;
  detectedRootPath: string;
  sourceUrl?: string;
  sourceRef?: string;
  fetchedAt?: string;
}

/**
 * Shared by local E-Sh4rk folder import and the GitHub fetch: turns
 * already-root-filtered CollectedFile[] into ScriptFile[] (pushed onto the
 * project) plus one ScriptPack carrying E-Sh4rk source metadata. Returns
 * null when no .txt scripts were found among the given files — callers
 * decide how to report that. Never mutates rawText.
 */
function importEsharkFiles(
  p: Project,
  filesUnderRoot: readonly CollectedFile[],
  source: EsharkPackSource,
): { scriptCount: number; hasMetadataFile: boolean; metadataParseError: boolean } | null {
  const { scripts, metadata, hasMetadataFile, metadataParseError } = collectScriptPackFiles(filesUnderRoot);
  if (scripts.length === 0) return null;
  const listEntries = parseEsharkListEntries(metadata);

  const now = nowIso();
  const packId = uid();
  const scriptIds: string[] = [];
  const categoriesDetected = new Set<EsharkCategory>();
  for (const cs of scripts) {
    const scriptId = uid();
    scriptIds.push(scriptId);
    const scriptFile: ScriptFile = {
      id: scriptId,
      filename: cs.filename,
      rawText: cs.rawText,
      importedAt: now,
      relativePath: cs.relativePath,
      packId,
    };
    if (cs.category) {
      scriptFile.category = cs.category;
      categoriesDetected.add(cs.category);
    }
    const listEntry = lookupEsharkListEntry(listEntries, cs.filename);
    if (listEntry?.displayName) scriptFile.displayName = listEntry.displayName;
    p.scripts.push(scriptFile);
  }

  const pack: ScriptPack = {
    id: packId,
    name: source.packName,
    importedAt: now,
    defaultTarget: state.pendingPackTarget,
    scriptIds,
    sourceProfile: source.sourceProfile,
    detectedRootPath: source.detectedRootPath,
    hasListJson: hasMetadataFile,
    categoriesDetected: Array.from(categoriesDetected).sort(),
  };
  const targetNotes = state.pendingPackTargetNotes.trim();
  if (targetNotes) pack.targetNotes = targetNotes;
  if (source.sourceUrl) pack.sourceUrl = source.sourceUrl;
  if (source.sourceRef) pack.sourceRef = source.sourceRef;
  if (source.fetchedAt) pack.fetchedAt = source.fetchedAt;
  p.scriptPacks.push(pack);

  return { scriptCount: scripts.length, hasMetadataFile, metadataParseError };
}

async function handleScriptFolderFile(input: HTMLInputElement): Promise<void> {
  const files = Array.from(input.files ?? []);
  input.value = '';
  const p = state.project;
  if (!files.length || !p) return;

  const allCollected: CollectedFile[] = [];
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    if (!isRelevantPackFile(relativePath)) continue;
    const text = await readFileText(file);
    allCollected.push({ relativePath, text });
  }

  const profile = state.pendingSourceProfile;

  if (profile !== 'generic') {
    const selection = selectEsharkFiles(allCollected);
    if (!selection) {
      window.alert(
        'No files_frlg folder was found in that selection. Select the files_frlg folder itself, or a folder that contains it (like the offline app or repo folder), then try again.',
      );
      return;
    }
    const sourceFolderName = detectSourceFolderName(selection.files);
    const imported = importEsharkFiles(p, selection.files, {
      sourceProfile: profile,
      packName: sourceFolderName ?? `Script pack (${nowIso().slice(0, 10)})`,
      detectedRootPath: displayRootPath(selection.root),
    });
    if (!imported) {
      window.alert('No .txt scripts found in that folder.');
      return;
    }
    commit();
    if (imported.hasMetadataFile && imported.metadataParseError) {
      window.alert('list.json was found but could not be parsed as JSON — it was ignored. Scripts still imported normally.');
    }
    return;
  }

  const { scripts } = collectScriptPackFiles(allCollected);
  if (scripts.length === 0) {
    window.alert('No .txt scripts found in that folder.');
    return;
  }

  const now = nowIso();
  const packId = uid();
  const scriptIds: string[] = [];
  for (const cs of scripts) {
    const scriptId = uid();
    scriptIds.push(scriptId);
    const scriptFile: ScriptFile = {
      id: scriptId,
      filename: cs.filename,
      rawText: cs.rawText,
      importedAt: now,
      relativePath: cs.relativePath,
      packId,
    };
    p.scripts.push(scriptFile);
  }
  const sourceFolderName = detectSourceFolderName(allCollected);
  const pack: ScriptPack = {
    id: packId,
    name: sourceFolderName ?? `Script pack (${now.slice(0, 10)})`,
    importedAt: now,
    defaultTarget: state.pendingPackTarget,
    scriptIds,
  };
  if (sourceFolderName) pack.sourceFolderName = sourceFolderName;
  const targetNotes = state.pendingPackTargetNotes.trim();
  if (targetNotes) pack.targetNotes = targetNotes;
  p.scriptPacks.push(pack);
  commit();
}

/**
 * The one function in the UI layer allowed to trigger a network request —
 * and only ever from this exact click handler, never from render() or app
 * init. Fetches read-only script text from GitHub and feeds it through the
 * same importEsharkFiles() pipeline as a local E-Sh4rk folder import.
 */
async function handleFetchEsharkGithub(): Promise<void> {
  const p = state.project;
  if (!p || state.esharkFetchInProgress) return;

  // Ask before fetching (not after) so a decline costs no network request —
  // and so a fetch that turns out empty never leaves the old pack removed.
  const existingPacks = findEsharkGithubPacks(p.scriptPacks);
  if (existingPacks.length > 0) {
    const confirmed = window.confirm(
      'Replace existing fetched E-Sh4rk scripts? Existing reviewed schemas and saved outputs will be preserved.',
    );
    if (!confirmed) return;
  }

  state.esharkFetchInProgress = true;
  render();

  try {
    const result = await fetchEsharkFilesFrlg();
    state.esharkFetchInProgress = false;

    if (collectScriptPackFiles(result.files).scripts.length === 0) {
      render();
      window.alert('No .txt scripts were found in the fetched files_frlg folder.');
      return;
    }

    if (existingPacks.length > 0) {
      const removal = removeScriptPacks(p.scripts, p.curatedSchemas, p.scriptPacks, new Set(existingPacks.map((pk) => pk.id)));
      p.scripts = removal.scripts;
      p.curatedSchemas = removal.curatedSchemas;
      p.scriptPacks = removal.scriptPacks;
    }

    const imported = importEsharkFiles(p, result.files, {
      sourceProfile: 'eshark-github',
      packName: `E-Sh4rk scripts (GitHub @ ${result.ref})`,
      detectedRootPath: displayRootPath(result.root),
      sourceUrl: result.sourceUrl,
      sourceRef: result.ref,
      fetchedAt: nowIso(),
    });
    if (!imported) {
      render();
      window.alert('No .txt scripts were found in the fetched files_frlg folder.');
      return;
    }
    commit();
    if (imported.hasMetadataFile && imported.metadataParseError) {
      window.alert('list.json was found but could not be parsed as JSON — it was ignored. Scripts still imported normally.');
    }
    window.alert(
      `Fetched ${imported.scriptCount} script(s) from GitHub. No generator was run — scripts were imported as plain text and stored locally.`,
    );
  } catch (err) {
    state.esharkFetchInProgress = false;
    render();
    window.alert(err instanceof EsharkFetchError ? `Fetch failed: ${err.message}` : 'Fetch failed: could not reach GitHub.');
  }
}

async function handleCuratedSchemaFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  const scriptId = input.dataset.id;
  input.value = '';
  const p = state.project;
  if (!file || !p || !scriptId) return;
  const script = p.scripts.find((s) => s.id === scriptId);
  if (!script) return;
  try {
    const text = await readFileText(file);
    const schema = importCuratedActionSchemaJson(text);
    // Attaching from a specific script always scopes the schema to it,
    // regardless of what scriptId/scriptFilename the JSON itself carried.
    schema.scriptId = script.id;
    schema.scriptFilename = script.filename;
    upsertCuratedSchema(p.curatedSchemas, schema);
    commit();
  } catch (err) {
    window.alert(`Curated schema import failed: ${(err as Error).message}`);
  }
}
