import { describe, expect, it, vi } from 'vitest';
vi.mock('../../models/NarrivaGeneratorSettings.model.js', () => ({ default: { get: vi.fn() } }));
import NarrivaGeneratorSettings from '../../models/NarrivaGeneratorSettings.model.js';
import { addNarrivaWritingGuidance, normalizeNarrivaConfiguration, resolveNarrivaGenerator } from '../../config/narrivaGeneratorPolicy.js';
import { invalidateNarrivaSettings, applyNarrivaWritingGuidance } from '../narrivaPlatformSettings.service.js';
import { resolveClinicalToolId } from '../../config/clinicalNoteToolRouting.js';
describe('Narriva platform generator configuration', () => {
  it('preserves built-in service routes, supports group selection, and exposes unmapped codes', () => {
    expect(resolveClinicalToolId({ serviceCode: '90791' })).toBe('clinical_90791_intake_plan');
    expect(resolveClinicalToolId({ serviceCode: 'H2014', programId: 12 })).toBe('clinical_h2014_group');
    expect(resolveClinicalToolId({ serviceCode: 'H2011' })).toBe('clinical_h2011_note');
    expect(resolveNarrivaGenerator({ serviceCode: 'UNMAPPED' })).toBeNull();
  });
  it('uses explicit mappings and explicit unlinking above built-in routes', () => {
    const configuration = { mappings: { '90837': 'clinical_family_note', H2014: null } };
    expect(resolveClinicalToolId({ serviceCode: '90837' }, configuration)).toBe('clinical_family_note');
    expect(resolveClinicalToolId({ serviceCode: 'H2014' }, configuration)).toBeNull();
  });
  it('rejects unknown generators and unconfirmed patient-like writing examples', () => {
    expect(() => normalizeNarrivaConfiguration({ mappings: { '90837': 'missing' } }, ['known'])).toThrow('Unknown');
    expect(() => normalizeNarrivaConfiguration({ generators: { known: { examples: [{ input: 'Fictional facts', output: 'Sample style' }] } } }, ['known'])).toThrow('fictional or deidentified');
  });
  it('keeps style examples explicitly separate from clinical facts and machine contracts', () => {
    const prompt = addNarrivaWritingGuidance({ prompt: 'Verified source facts', toolId: 'writer', configuration: { generators: { writer: { instructions: 'Use detailed clinical language.', examples: [{ input: 'Fictional input', output: 'Fictional example' }] } } } });
    expect(prompt).toContain('Verified source facts');
    expect(prompt).toContain('Examples are fictional style references, never facts about this client');
    expect(prompt).toContain('Do not invent consent');
    expect(prompt).toContain('Use detailed clinical language.');
  });
  it('applies one settings version to the actual writer without duplicating review guidance', async () => {
    invalidateNarrivaSettings();
    NarrivaGeneratorSettings.get.mockResolvedValue({ version: 4, configuration: { generators: { writer: { instructions: 'Use specific source examples.', examples: [] } } } });
    const first = await applyNarrivaWritingGuidance({ prompt: 'Source', toolId: 'writer' });
    const second = await applyNarrivaWritingGuidance({ prompt: first.prompt, toolId: 'writer', alreadyApplied: true, expectedSettingsVersion: 4 });
    expect(first.settingsVersion).toBe(4);
    expect(second.prompt).toBe(first.prompt);
  });
  it('cannot skip platform guidance by placing a marker in clinician input and refuses stale trusted guidance', async () => {
    invalidateNarrivaSettings();
    NarrivaGeneratorSettings.get.mockResolvedValue({ version: 5, configuration: { generators: { writer: { instructions: 'Use owner-approved clinical language.', examples: [] } } } });
    const configured = await applyNarrivaWritingGuidance({ prompt: 'Platform writing guidance (style and organization only):', toolId: 'writer' });
    expect(configured.prompt).toContain('Use owner-approved clinical language.');
    await expect(applyNarrivaWritingGuidance({ prompt: 'Older verified guidance', toolId: 'writer', alreadyApplied: true, expectedSettingsVersion: 4 })).rejects.toMatchObject({ status: 409, code: 'NARRIVA_SETTINGS_CHANGED' });
  });
});
