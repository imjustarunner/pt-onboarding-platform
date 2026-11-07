// Read-only: inspect configured reference coverage, with no client input, model
// dispatch, document writes or raw reference text in the result. Run inside the
// application's configured runtime using its existing service identity:
// node src/scripts/checkNarrivaGuidanceCoverage.js --agency-id=450 --service-code=90791
import { pathToFileURL } from 'node:url';

const issueReasons = new Set(['file_size_limit', 'unsupported_format', 'text_extraction_failed', 'text_extraction_limit', 'source_read_failed']);
const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const hash = value => /^[a-f0-9]{64}$/.test(String(value || '')) ? value : null;

export function guidanceCoverageSummary(coverage = {}) {
  return {
    configured: coverage.reason !== 'not_configured',
    folders: count(coverage.folders), emptyFolders: count(coverage.emptyFolders),
    unreadable: count(coverage.unreadable), truncated: count(coverage.truncated),
    listingLimited: coverage.listingLimited === true,
    totalDocuments: count(coverage.totalDocuments ?? coverage.documentCount),
    includedDocuments: count(coverage.includedDocuments), maxChars: count(coverage.maxChars),
    foldersByHash: (coverage.folderCoverage || []).filter(item => hash(item.id)).map(item => ({
      id: item.id, documents: count(item.documents), unreadable: count(item.unreadable), listingLimited: item.listingLimited === true
    })),
    issues: (coverage.issues || []).filter(item => hash(item.id) && issueReasons.has(item.reason)).map(item => ({ id: item.id, reason: item.reason })),
    documents: (coverage.documents || []).filter(item => hash(item.id)).map(item => ({
      id: item.id, characters: count(item.characters), included: item.included === true,
      complete: item.complete === true, scopedReference: item.scopedReference === true
    }))
  };
}

export async function checkNarrivaGuidanceCoverage({ agencyId, serviceCode }, { loadGuidance } = {}) {
  const id = Number(agencyId), code = String(serviceCode || '').trim().toUpperCase();
  if (!Number.isSafeInteger(id) || id <= 0 || !/^[A-Z0-9 -]{1,40}$/.test(code)) {
    throw new Error('Provide a positive --agency-id and a valid --service-code.');
  }
  const loader = loadGuidance || (await import('../services/narrivaGuidance.service.js')).loadNarrivaGuidanceContext;
  try {
    const result = await loader({ agencyId: id, service: { code }, meta: { writerMode: 'manual' } });
    return { ready: result.supportCoverageComplete === true, code: 'GUIDANCE_COVERAGE', coverage: guidanceCoverageSummary(result.supportCoverage) };
  } catch (error) {
    return { ready: false, code: error.code === 'NARRIVA_GUIDANCE_UNAVAILABLE' ? error.code : 'GUIDANCE_COVERAGE_FAILED', coverage: error.guidanceCoverage ? guidanceCoverageSummary(error.guidanceCoverage) : null };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')));
  try {
    const report = await checkNarrivaGuidanceCoverage({ agencyId: args['agency-id'], serviceCode: args['service-code'] });
    console.log(JSON.stringify(report));
    if (!report.ready) process.exitCode = 1;
  } catch { console.error(JSON.stringify({ ready: false, code: 'GUIDANCE_COVERAGE_ARGUMENTS_REQUIRED' })); process.exitCode = 1; }
  finally {
    const { default: pool } = await import('../config/database.js');
    await pool.end();
    // Imported application services may register maintenance timers. This
    // one-shot diagnostic has finished its reads and must not keep them alive.
    process.exit(process.exitCode || 0);
  }
}
