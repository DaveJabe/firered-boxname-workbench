// Data-driven audit: scans fetched scripts, reviewed presets, curated
// schemas, and the existing reference catalog registry to identify what
// catalogs/field presets are still missing — a review-prioritization
// report, not a claim of semantic correctness. Nothing here fetches data,
// invokes a generator, or silently rewrites a saved schema.

import type { CuratedActionSchema, GameTarget, Project, ReferenceCatalogId, ScriptFile, VariableCandidate, CuratedSchemaField } from './types.js';
import { REFERENCE_CATALOGS, REFERENCE_CATALOG_IDS } from '../reference/index.js';
import { getBoundedFieldPreset } from './boundedFieldPresets.js';
import {
  buildSupportedActionRegistry,
  type SupportedAction,
  type SupportedActionVariant,
  type SupportedActionVariantStatus,
} from './supportedActionRegistry.js';
import { summarizeVariantVerification, type ActionVariantVerificationStatus } from './schemaVerification.js';

export type CatalogNeedConfidence = 'high' | 'medium' | 'low';

export type FieldClassificationKind =
  | 'reference-catalog-needed'
  | 'existing-catalog-available'
  | 'existing-catalog-partial'
  | 'bounded-field-preset-needed'
  | 'plain-acceptable'
  | 'unknown-manual-review';

export interface FieldClassification {
  kind: FieldClassificationKind;
  variableName: string;
  scriptId?: string;
  scriptFilename?: string;
  catalogId?: ReferenceCatalogId;
  boundedPresetId?: string;
  confidence: CatalogNeedConfidence;
  reason: string;
}

// --- Part 2: classification heuristics --------------------------------------

/** Explicit `@input:xxx` annotation hints — checked first, and always "high" confidence. */
const ANNOTATION_HINT_CATALOGS: Readonly<Record<string, ReferenceCatalogId>> = {
  item: 'gen3-items',
  move: 'gen3-moves',
  species: 'gen3-species',
  pokemon: 'gen3-species',
  ability: 'gen3-abilities',
  nature: 'gen3-natures',
  type: 'gen3-types',
  flag: 'frlg-flags',
  var: 'frlg-vars',
  variable: 'frlg-vars',
  map: 'frlg-maps-warps',
  warp: 'frlg-maps-warps',
  trainer: 'frlg-trainers',
};

interface NameHeuristicRule {
  pattern: RegExp;
  catalogId?: ReferenceCatalogId;
  boundedPresetId?: string;
  plainAcceptable?: boolean;
  confidence: CatalogNeedConfidence;
  reason: string;
}

/** Conservative variable-name heuristics — checked only when no @input hint matched. Order matters: first match wins. */
const NAME_HEURISTIC_RULES: readonly NameHeuristicRule[] = [
  { pattern: /^(item|itemid|helditem)$/i, catalogId: 'gen3-items', confidence: 'medium', reason: 'Variable name suggests an item value.' },
  { pattern: /^(move|moveid)$/i, catalogId: 'gen3-moves', confidence: 'medium', reason: 'Variable name suggests a move value.' },
  { pattern: /^(species|pokemon|mon)$/i, catalogId: 'gen3-species', confidence: 'medium', reason: 'Variable name suggests a species value.' },
  { pattern: /^ability$/i, catalogId: 'gen3-abilities', confidence: 'medium', reason: 'Variable name suggests an ability value.' },
  { pattern: /^nature$/i, catalogId: 'gen3-natures', confidence: 'medium', reason: 'Variable name suggests a nature value.' },
  { pattern: /^type$/i, catalogId: 'gen3-types', confidence: 'medium', reason: 'Variable name suggests a type value.' },
  { pattern: /^flag$/i, catalogId: 'frlg-flags', confidence: 'low', reason: 'Variable name suggests a named flag, but "flag" alone is a weak signal.' },
  { pattern: /^(var|variable)$/i, catalogId: 'frlg-vars', confidence: 'low', reason: 'Variable name suggests a named variable, but this is a weak signal.' },
  { pattern: /^(mapgroup|mapnum|mapid|warp|warpid)$/i, catalogId: 'frlg-maps-warps', confidence: 'medium', reason: 'Variable name suggests a map/warp value.' },
  { pattern: /^(trainer|trainerid)$/i, catalogId: 'frlg-trainers', confidence: 'medium', reason: 'Variable name suggests a trainer value.' },
  { pattern: /^moveslot$/i, boundedPresetId: 'move-slot-0-based', confidence: 'medium', reason: 'Variable name suggests a move slot (0-3).' },
  { pattern: /^partyslot$/i, boundedPresetId: 'party-slot-1-based', confidence: 'low', reason: 'Variable name suggests a party slot, but whether it is 0- or 1-based must be confirmed manually.' },
  { pattern: /^(box|boxid|boxslot)$/i, boundedPresetId: 'box-slot-1-based', confidence: 'low', reason: 'Variable name suggests a box/slot value, but the exact numbering (which box field, 0- or 1-based) must be confirmed manually.' },
  { pattern: /^(quantity|count|amount)$/i, plainAcceptable: true, confidence: 'medium', reason: 'A plain bounded quantity — a raw number field is fine unless a specific range is known.' },
];

interface ClassifiableField {
  variableName: string;
  inputHint?: string;
  nearbyComment?: string;
  rawValue?: string;
}

function classificationForCatalog(
  catalogId: ReferenceCatalogId,
  confidence: CatalogNeedConfidence,
  reason: string,
): Pick<FieldClassification, 'kind' | 'catalogId' | 'confidence' | 'reason'> {
  const catalog = REFERENCE_CATALOGS[catalogId];
  if (catalog.entries.length === 0) {
    return { kind: 'reference-catalog-needed', catalogId, confidence, reason: `${reason} Matching catalog "${catalogId}" is registered but has no entries yet.` };
  }
  if (catalog.partial) {
    return { kind: 'existing-catalog-partial', catalogId, confidence, reason: `${reason} Matching catalog "${catalogId}" exists but is marked partial.` };
  }
  return { kind: 'existing-catalog-available', catalogId, confidence, reason };
}

function classifyFieldCore(input: ClassifiableField): Pick<FieldClassification, 'kind' | 'catalogId' | 'boundedPresetId' | 'confidence' | 'reason'> {
  if (input.inputHint) {
    const catalogId = ANNOTATION_HINT_CATALOGS[input.inputHint.toLowerCase()];
    if (catalogId) return classificationForCatalog(catalogId, 'high', `Explicit @input:${input.inputHint} annotation.`);
  }

  for (const rule of NAME_HEURISTIC_RULES) {
    if (!rule.pattern.test(input.variableName)) continue;
    if (rule.catalogId) return classificationForCatalog(rule.catalogId, rule.confidence, rule.reason);
    if (rule.boundedPresetId) return { kind: 'bounded-field-preset-needed', boundedPresetId: rule.boundedPresetId, confidence: rule.confidence, reason: rule.reason };
    if (rule.plainAcceptable) return { kind: 'plain-acceptable', confidence: rule.confidence, reason: rule.reason };
  }

  if (/^value$/i.test(input.variableName)) {
    const flagContext = /flag/i.test(input.nearbyComment ?? '') || input.rawValue === '0' || input.rawValue === '1';
    if (flagContext) {
      return {
        kind: 'bounded-field-preset-needed',
        boundedPresetId: 'boolean-set-clear',
        confidence: 'low',
        reason: 'Named "value" near flag-like context (0/1) — confirm this is really a boolean before applying.',
      };
    }
    return { kind: 'unknown-manual-review', confidence: 'low', reason: 'Named "value" with no further context — too generic to classify automatically.' };
  }

  return { kind: 'unknown-manual-review', confidence: 'low', reason: 'No recognized annotation or naming pattern matched — needs manual review.' };
}

/** Classify one scanned, user-facing candidate. Never claims semantic correctness — a review-prioritization signal only. */
export function classifyCandidate(candidate: VariableCandidate, scriptId: string, scriptFilename: string): FieldClassification {
  const core = classifyFieldCore({
    variableName: candidate.name,
    inputHint: candidate.inputHint,
    nearbyComment: candidate.nearbyComment,
    rawValue: candidate.rawValue,
  });
  return { ...core, variableName: candidate.name, scriptId, scriptFilename };
}

/** Classify one already-saved curated schema field, for stale-field detection. */
export function classifySchemaField(field: CuratedSchemaField, scriptId?: string, scriptFilename?: string): FieldClassification {
  const core = classifyFieldCore({ variableName: field.variableName, inputHint: field.inputHint });
  const result: FieldClassification = { ...core, variableName: field.variableName };
  if (scriptId) result.scriptId = scriptId;
  if (scriptFilename) result.scriptFilename = scriptFilename;
  return result;
}

// --- Part 7 support: stale schema field detection ---------------------------

export interface StaleFieldFinding {
  schemaId: string;
  schemaLabel: string;
  scriptFilename?: string;
  classification: FieldClassification;
  currentType: CuratedSchemaField['type'];
  suggestedType: 'reference-select' | 'select';
}

/** A schema field whose current type/options don't match what its classification would suggest — repair suggestions only, never auto-rewritten. */
export function findStaleSchemaFields(project: Project): StaleFieldFinding[] {
  const findings: StaleFieldFinding[] = [];
  for (const schema of project.curatedSchemas) {
    const script = schema.scriptId ? project.scripts.find((s) => s.id === schema.scriptId) : undefined;
    const scriptFilename = schema.scriptFilename ?? script?.filename;
    for (const field of schema.fields) {
      const classification = classifySchemaField(field, schema.scriptId, scriptFilename);
      if (classification.kind === 'existing-catalog-available' || classification.kind === 'existing-catalog-partial') {
        if (field.type !== 'reference-select' || field.referenceCatalogId !== classification.catalogId) {
          findings.push({ schemaId: schema.id, schemaLabel: schema.label, scriptFilename, classification, currentType: field.type, suggestedType: 'reference-select' });
        }
      } else if (classification.kind === 'bounded-field-preset-needed') {
        const preset = classification.boundedPresetId ? getBoundedFieldPreset(classification.boundedPresetId) : undefined;
        if (preset && preset.scope === 'global' && field.type !== 'select') {
          findings.push({ schemaId: schema.id, schemaLabel: schema.label, scriptFilename, classification, currentType: field.type, suggestedType: 'select' });
        }
      }
    }
  }
  return findings;
}

/**
 * Apply one stale-field repair suggestion, returning a NEW schema (the
 * original is untouched) — only ever called after a user has previewed
 * the before/after and explicitly confirmed; never invoked automatically.
 * Only the matching field's type/options/referenceCatalogId change —
 * everything else about the field and schema is preserved verbatim.
 */
export function applyStaleFieldRepair(schema: CuratedActionSchema, finding: StaleFieldFinding): CuratedActionSchema {
  const fields = schema.fields.map((field) => {
    if (field.variableName !== finding.classification.variableName) return field;
    if (finding.suggestedType === 'reference-select' && finding.classification.catalogId) {
      return { ...field, type: 'reference-select' as const, referenceCatalogId: finding.classification.catalogId };
    }
    if (finding.suggestedType === 'select' && finding.classification.boundedPresetId) {
      const preset = getBoundedFieldPreset(finding.classification.boundedPresetId);
      if (preset && preset.options.length > 0) return { ...field, type: 'select' as const, options: preset.options };
    }
    return field;
  });
  return { ...schema, fields };
}

// --- Part 3: catalog coverage + Part 8: full audit assembly -----------------

export interface CatalogCoverage {
  catalogId: ReferenceCatalogId;
  entryCount: number;
  partial: boolean;
  sourceNote: string;
  usedBySchemaIds: readonly string[];
  suggestedByFieldCount: number;
}

export interface CatalogNeed {
  catalogId: ReferenceCatalogId;
  registered: boolean;
  entryCount: number;
  suggestedByFields: readonly FieldClassification[];
}

export interface SuggestedFieldControl {
  boundedPresetId: string;
  label: string;
  suggestedByFields: readonly FieldClassification[];
}

export interface UnknownFieldNeed {
  variableName: string;
  scriptId?: string;
  scriptFilename?: string;
  reason: string;
}

export interface UnknownCatalogFieldFinding {
  schemaId: string;
  variableName: string;
  referenceCatalogId: string;
}

export interface CatalogEntryQualityFinding {
  catalogId: ReferenceCatalogId;
  duplicateValues: readonly number[];
  duplicateNames: readonly string[];
  unsorted: boolean;
}

export interface BlockedScript {
  scriptId: string;
  scriptFilename: string;
  blockedByCount: number;
}

export interface CatalogGapAudit {
  generatedAt: string;
  scriptCount: number;
  scannedScriptCount: number;
  catalogCoverage: readonly CatalogCoverage[];
  /** Registered-but-empty catalogs that scanned candidates suggest are needed. */
  missingCatalogs: readonly CatalogNeed[];
  /** Non-empty but partial catalogs that a saved schema field is actually using. */
  partialCatalogsUsed: readonly CatalogCoverage[];
  staleSchemaFields: readonly StaleFieldFinding[];
  unknownCatalogFields: readonly UnknownCatalogFieldFinding[];
  duplicateCatalogEntries: readonly CatalogEntryQualityFinding[];
  suggestedBoundedControls: readonly SuggestedFieldControl[];
  unknownFields: readonly UnknownFieldNeed[];
  topBlockedScripts: readonly BlockedScript[];
  /** catalogId/boundedPresetId keys, highest-impact (most scripts affected) first. */
  suggestedPriorityOrder: readonly string[];
}

function auditCatalogEntryQuality(catalogId: ReferenceCatalogId): CatalogEntryQualityFinding | null {
  const catalog = REFERENCE_CATALOGS[catalogId];
  if (catalog.entries.length === 0) return null;

  const valueCounts = new Map<number, number>();
  const nameCounts = new Map<string, number>();
  for (const e of catalog.entries) {
    valueCounts.set(e.value, (valueCounts.get(e.value) ?? 0) + 1);
    const normalizedName = e.name.trim().toLowerCase();
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
  }
  const duplicateValues = Array.from(valueCounts.entries()).filter(([, n]) => n > 1).map(([v]) => v).sort((a, b) => a - b);
  const duplicateNames = Array.from(nameCounts.entries()).filter(([, n]) => n > 1).map(([n]) => n).sort();
  const sortedByValue = [...catalog.entries].sort((a, b) => a.value - b.value);
  const unsorted = catalog.entries.some((e, i) => e.value !== sortedByValue[i]!.value);

  if (duplicateValues.length === 0 && duplicateNames.length === 0 && !unsorted) return null;
  return { catalogId, duplicateValues, duplicateNames, unsorted };
}

/**
 * The full catalog-gap audit — a snapshot built entirely from data already
 * in the project plus the local reference-catalog/bounded-preset registries.
 * Never fetches, scans, fills, or invokes a generator; never silently
 * rewrites a saved schema.
 */
export function buildCatalogGapAudit(project: Project, nowIso: () => string): CatalogGapAudit {
  const scannedScripts = project.scripts.filter((s): s is ScriptFile & { lastScan: NonNullable<ScriptFile['lastScan']> } => Boolean(s.lastScan));

  const candidateClassifications: FieldClassification[] = [];
  for (const script of scannedScripts) {
    for (const candidate of script.lastScan.candidates.filter((c) => !c.internal)) {
      candidateClassifications.push(classifyCandidate(candidate, script.id, script.filename));
    }
  }

  const catalogCoverage: CatalogCoverage[] = REFERENCE_CATALOG_IDS.map((catalogId) => {
    const catalog = REFERENCE_CATALOGS[catalogId];
    const usedBySchemaIds = project.curatedSchemas.filter((s) => s.fields.some((f) => f.referenceCatalogId === catalogId)).map((s) => s.id);
    const suggestedByFieldCount = candidateClassifications.filter((c) => c.catalogId === catalogId).length;
    return { catalogId, entryCount: catalog.entries.length, partial: catalog.partial, sourceNote: catalog.sourceNote, usedBySchemaIds, suggestedByFieldCount };
  });

  const missingCatalogs: CatalogNeed[] = catalogCoverage
    .filter((c) => c.entryCount === 0 && c.suggestedByFieldCount > 0)
    .map((c) => ({
      catalogId: c.catalogId,
      registered: true,
      entryCount: c.entryCount,
      suggestedByFields: candidateClassifications.filter((cl) => cl.catalogId === c.catalogId),
    }));

  const partialCatalogsUsed = catalogCoverage.filter((c) => c.partial && c.entryCount > 0 && c.usedBySchemaIds.length > 0);

  const staleSchemaFields = findStaleSchemaFields(project);

  const unknownCatalogFields: UnknownCatalogFieldFinding[] = project.curatedSchemas.flatMap((schema) =>
    schema.fields
      .filter((f): f is CuratedSchemaField & { referenceCatalogId: string } =>
        Boolean(f.referenceCatalogId) && !REFERENCE_CATALOG_IDS.includes(f.referenceCatalogId as ReferenceCatalogId),
      )
      .map((f) => ({ schemaId: schema.id, variableName: f.variableName, referenceCatalogId: f.referenceCatalogId })),
  );

  const duplicateCatalogEntries = REFERENCE_CATALOG_IDS
    .map((id) => auditCatalogEntryQuality(id))
    .filter((f): f is CatalogEntryQualityFinding => f !== null);

  const boundedGroups = new Map<string, FieldClassification[]>();
  for (const c of candidateClassifications) {
    if (c.kind !== 'bounded-field-preset-needed' || !c.boundedPresetId) continue;
    const arr = boundedGroups.get(c.boundedPresetId) ?? [];
    arr.push(c);
    boundedGroups.set(c.boundedPresetId, arr);
  }
  const suggestedBoundedControls: SuggestedFieldControl[] = Array.from(boundedGroups.entries()).map(([boundedPresetId, fields]) => ({
    boundedPresetId,
    label: getBoundedFieldPreset(boundedPresetId)?.label ?? boundedPresetId,
    suggestedByFields: fields,
  }));

  const unknownFields: UnknownFieldNeed[] = candidateClassifications
    .filter((c) => c.kind === 'unknown-manual-review')
    .map((c) => ({ variableName: c.variableName, scriptId: c.scriptId, scriptFilename: c.scriptFilename, reason: c.reason }));

  const blockedCountByScript = new Map<string, number>();
  for (const c of candidateClassifications) {
    if (c.kind !== 'reference-catalog-needed' || !c.scriptId) continue;
    blockedCountByScript.set(c.scriptId, (blockedCountByScript.get(c.scriptId) ?? 0) + 1);
  }
  const topBlockedScripts: BlockedScript[] = Array.from(blockedCountByScript.entries())
    .map(([scriptId, blockedByCount]) => ({
      scriptId,
      scriptFilename: project.scripts.find((s) => s.id === scriptId)?.filename ?? scriptId,
      blockedByCount,
    }))
    .sort((a, b) => b.blockedByCount - a.blockedByCount || a.scriptFilename.localeCompare(b.scriptFilename))
    .slice(0, 10);

  const suggestedPriorityOrder = [
    ...missingCatalogs.map((n) => ({ key: n.catalogId as string, count: n.suggestedByFields.length })),
    ...suggestedBoundedControls.map((c) => ({ key: c.boundedPresetId, count: c.suggestedByFields.length })),
  ]
    .sort((a, b) => b.count - a.count)
    .map((x) => x.key);

  return {
    generatedAt: nowIso(),
    scriptCount: project.scripts.length,
    scannedScriptCount: scannedScripts.length,
    catalogCoverage,
    missingCatalogs,
    partialCatalogsUsed,
    staleSchemaFields,
    unknownCatalogFields,
    duplicateCatalogEntries,
    suggestedBoundedControls,
    unknownFields,
    topBlockedScripts,
    suggestedPriorityOrder,
  };
}

/** Serialize the audit for local export only (no network) — never includes raw script text, only ids/filenames/variable names/reasons. */
export function exportCatalogGapAuditJson(audit: CatalogGapAudit): string {
  return JSON.stringify(audit, null, 2);
}

// --- Grouping by supported action/variant (core/supportedActionRegistry.ts) -
//
// The functions above are unchanged and remain independently useful (raw
// classification, the flat CatalogGapAudit, JSON export) — everything below
// is an additive presentation layer that reorganizes the same findings
// around actions/variants, for Setup's Catalog Audit panel.

export interface ActionVariantCatalogAudit {
  actionKey: string;
  actionLabel: string;
  variantId: string;
  schemaId: string;
  target: GameTarget;
  scriptFilename?: string;
  scriptRelativePath?: string;
  status: SupportedActionVariantStatus;
  /** This variant's own schema fields classified as needing a registered-but-empty or partial catalog. */
  catalogNeeds: readonly FieldClassification[];
  /** This variant's own stale-field findings (see findStaleSchemaFields). */
  staleFieldRepairs: readonly StaleFieldFinding[];
  /** This variant's live verification standing (core/schemaVerification.ts) — "not-available" whenever the schema can't be verified at all right now (detached/missing script/disabled/draft-only), not just when no review case exists. */
  verificationStatus: ActionVariantVerificationStatus;
}

export interface ActionCatalogAuditGroup {
  actionKey: string;
  actionLabel: string;
  variants: readonly ActionVariantCatalogAudit[];
}

export interface UnsupportedScriptCatalogAudit {
  scriptId: string;
  scriptFilename: string;
  /** This script's own scanned candidates classified as needing a catalog/bounded control — same data as the flat audit, scoped to this one script. */
  catalogNeeds: readonly FieldClassification[];
}

export interface SupportedActionCatalogAudit {
  /** "Ready supported actions" — every action with at least one ready variant, all of its variants shown together (never duplicated as separate top-level rows). */
  readyActions: readonly ActionCatalogAuditGroup[];
  /** "Action variants with missing catalog coverage" — every variant (any status) whose schema has a catalog need or a stale field. */
  variantsWithGaps: readonly ActionVariantCatalogAudit[];
  /** "Unsupported scripts" — scripts with no curated schema attached at all yet. */
  unsupportedScripts: readonly UnsupportedScriptCatalogAudit[];
  /** "Unknown/manual-review fields" — unchanged from the flat audit. */
  unknownFields: readonly UnknownFieldNeed[];
}

function buildVariantCatalogAudit(
  action: SupportedAction,
  variant: SupportedActionVariant,
  project: Project,
  audit: CatalogGapAudit,
): ActionVariantCatalogAudit {
  const schema = project.curatedSchemas.find((s) => s.id === variant.schemaId);
  // Only fields that STILL need catalog work — a field already correctly
  // reference-select for the matching catalog classifies the same way
  // (classifySchemaField only looks at the variable name/hint) but isn't a
  // "need" anymore, mirroring findStaleSchemaFields' own staleness check.
  const catalogNeeds = schema
    ? schema.fields
        .map((f) => ({ field: f, classification: classifySchemaField(f, variant.scriptId, variant.scriptFilename) }))
        .filter(
          ({ field, classification }) =>
            (classification.kind === 'reference-catalog-needed' || classification.kind === 'existing-catalog-partial') &&
            (field.type !== 'reference-select' || field.referenceCatalogId !== classification.catalogId),
        )
        .map(({ classification }) => classification)
    : [];
  const staleFieldRepairs = audit.staleSchemaFields.filter((f) => f.schemaId === variant.schemaId);
  const verificationStatus: ActionVariantVerificationStatus = schema
    ? summarizeVariantVerification(schema, project, project.schemaReviewCases).status
    : 'not-available';

  const result: ActionVariantCatalogAudit = {
    actionKey: action.actionKey,
    actionLabel: action.label,
    variantId: variant.variantId,
    schemaId: variant.schemaId,
    target: variant.target,
    status: variant.status,
    catalogNeeds,
    staleFieldRepairs,
    verificationStatus,
  };
  if (variant.scriptFilename) result.scriptFilename = variant.scriptFilename;
  if (variant.relativePath) result.scriptRelativePath = variant.relativePath;
  return result;
}

/**
 * Reorganize a flat CatalogGapAudit around the supported-action/variant
 * model — Setup's Catalog Audit panel renders from this, not the flat
 * shape directly. Never invents data: an action/variant's catalog needs
 * and stale-field repairs are the exact same findings the flat audit
 * already computed, just grouped differently.
 */
export function groupCatalogAuditBySupportedAction(project: Project, audit: CatalogGapAudit): SupportedActionCatalogAudit {
  const registry = buildSupportedActionRegistry(project);

  const readyActions: ActionCatalogAuditGroup[] = registry
    .filter((action) => action.variants.some((v) => v.status === 'ready'))
    .map((action) => ({
      actionKey: action.actionKey,
      actionLabel: action.label,
      variants: action.variants.map((v) => buildVariantCatalogAudit(action, v, project, audit)),
    }));

  const allVariantAudits = registry.flatMap((action) => action.variants.map((v) => buildVariantCatalogAudit(action, v, project, audit)));
  const variantsWithGaps = allVariantAudits.filter((v) => v.catalogNeeds.length > 0 || v.staleFieldRepairs.length > 0);

  // "Unsupported" here means "no curated schema/variant attached at all yet" —
  // broader than getUnsupportedScripts' "zero candidates" bucket, since a
  // scanned-but-not-yet-curated script still belongs here (it has no action
  // either way), and its own candidates' catalog needs are worth surfacing.
  const unsupportedScripts: UnsupportedScriptCatalogAudit[] = project.scripts
    .filter((s) => !project.curatedSchemas.some((cs) => cs.scriptId === s.id))
    .map((s) => ({
      scriptId: s.id,
      scriptFilename: s.filename,
      catalogNeeds: (s.lastScan?.candidates ?? [])
        .filter((c) => !c.internal)
        .map((c) => classifyCandidate(c, s.id, s.filename))
        .filter((c) => c.kind === 'reference-catalog-needed' || c.kind === 'existing-catalog-partial'),
    }));

  return {
    readyActions,
    variantsWithGaps,
    unsupportedScripts,
    unknownFields: audit.unknownFields,
  };
}
