import { describe, it, expect } from 'vitest';
import { BOUNDED_FIELD_PRESETS, getBoundedFieldPreset } from '../src/core/boundedFieldPresets.js';

describe('BOUNDED_FIELD_PRESETS', () => {
  it('every global preset has a non-empty, contiguous options list', () => {
    for (const preset of BOUNDED_FIELD_PRESETS.filter((p) => p.scope === 'global')) {
      expect(preset.options.length).toBeGreaterThan(0);
      const values = preset.options.map((o) => Number(o.value));
      const sorted = [...values].sort((a, b) => a - b);
      expect(values).toEqual(sorted);
    }
  });

  it('move-slot-0-based is exactly 0-3', () => {
    const preset = getBoundedFieldPreset('move-slot-0-based')!;
    expect(preset.options.map((o) => o.value)).toEqual(['0', '1', '2', '3']);
  });

  it('box-number-frlg is exactly 1-14', () => {
    const preset = getBoundedFieldPreset('box-number-frlg')!;
    expect(preset.options.map((o) => o.value)).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 1)));
  });

  it('boolean-set-clear is exactly 0/1', () => {
    const preset = getBoundedFieldPreset('boolean-set-clear')!;
    expect(preset.options.map((o) => o.value)).toEqual(['0', '1']);
  });

  it('npc-index-small is script-specific with no global options — never a safe default', () => {
    const preset = getBoundedFieldPreset('npc-index-small')!;
    expect(preset.scope).toBe('script-specific');
    expect(preset.options).toEqual([]);
  });

  it('getBoundedFieldPreset returns undefined for an unknown id', () => {
    expect(getBoundedFieldPreset('nonexistent')).toBeUndefined();
  });

  it('every preset id is unique', () => {
    const ids = BOUNDED_FIELD_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
