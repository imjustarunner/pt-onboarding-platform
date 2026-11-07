import { expect, it, vi } from 'vitest';
import { checkNarrivaGuidanceCoverage, guidanceCoverageSummary } from '../checkNarrivaGuidanceCoverage.js';
const id = 'a'.repeat(64);
it('reports only counts and opaque source identifiers even if an error carries reference contents', async () => {
  const coverage = { folders: 1, unreadable: 1, sourceText: 'PRIVATE_CANARY', name: 'PRIVATE_CANARY', folderCoverage: [{ id, documents: 0, name: 'PRIVATE_CANARY' }], documents: [{ id, characters: 10, included: false, name: 'PRIVATE_CANARY', text: 'PRIVATE_CANARY' }], issues: [{ id, reason: 'source_read_failed', message: 'PRIVATE_CANARY' }, { id, reason: 'PRIVATE_CANARY' }] };
  const loadGuidance = vi.fn().mockRejectedValue({ code: 'NARRIVA_GUIDANCE_UNAVAILABLE', message: 'PRIVATE_CANARY', guidanceCoverage: coverage });
  const report = await checkNarrivaGuidanceCoverage({ agencyId: 7, serviceCode: '90791' }, { loadGuidance });
  expect(report.ready).toBe(false); expect(report.coverage.unreadable).toBe(1);
  expect(report.coverage.issues).toEqual([{ id, reason: 'source_read_failed' }]);
  expect(JSON.stringify(report)).not.toContain('PRIVATE_CANARY');
  expect(loadGuidance).toHaveBeenCalledWith({ agencyId: 7, service: { code: '90791' }, meta: { writerMode: 'manual' } });
});
it('reports absent reference configuration and never prints arbitrary runtime errors', async () => {
  expect(guidanceCoverageSummary({ reason: 'not_configured' }).configured).toBe(false);
  const result = await checkNarrivaGuidanceCoverage({ agencyId: 7, serviceCode: '90837' }, { loadGuidance: async () => { throw Error('PRIVATE_CANARY'); } });
  expect(result).toEqual({ ready: false, code: 'GUIDANCE_COVERAGE_FAILED', coverage: null });
});
