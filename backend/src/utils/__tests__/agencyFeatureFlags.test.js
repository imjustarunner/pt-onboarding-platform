import { expect, it } from 'vitest';
import { mergeAgencyFeatureFlags } from '../agencyFeatureFlags.js';

it('preserves enabled modules absent from an agency settings form', () => {
  const saved = { peopleOpsEnabled: true, hiringEnabled: true, customModuleEnabled: true, workspaceEmailDomain: 'example.test' };
  expect(mergeAgencyFeatureFlags(JSON.stringify(saved), { noteAidEnabled: true })).toEqual({ ...saved, noteAidEnabled: true });
  expect(mergeAgencyFeatureFlags(saved, { hiringEnabled: false })).toEqual({ ...saved, hiringEnabled: false });
  expect(saved.hiringEnabled).toBe(true);
});

it('does not silently discard malformed stored configuration', () => {
  expect(() => mergeAgencyFeatureFlags('{broken', { hiringEnabled: true })).toThrow();
  expect(mergeAgencyFeatureFlags(null, { hiringEnabled: true })).toEqual({ hiringEnabled: true });
});
