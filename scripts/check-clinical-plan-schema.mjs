import { pathToFileURL } from 'node:url';

export function verifyClinicalPlanStorage(version, { sourceCommit, revision }) {
  if (!/^[a-f0-9]{40}$/i.test(sourceCommit || '') || !String(revision || '').trim()) {
    throw new Error('The clinical schema gate requires the exact source commit and candidate revision.');
  }
  if (version?.buildId !== sourceCommit || version?.revision !== revision || version?.ready !== true) {
    throw new Error('The expected backend candidate is not ready. Production traffic was not promoted.');
  }
  const objective = version.clinicalTreatmentObjectiveDateSchema;
  const frequency = version.clinicalPlanFrequencySchema;
  if (objective?.migration !== '035_treatment_objective_target_dates' || objective?.dataType !== 'date'
      || typeof objective.applied !== 'boolean') {
    throw new Error('The candidate has not verified clinical migration 035. Production traffic was not promoted.');
  }
  if (frequency?.migration !== '039_preserve_imported_treatment_frequency'
      || !['mediumtext', 'longtext'].includes(frequency?.dataType) || typeof frequency.applied !== 'boolean') {
    throw new Error('The candidate has not verified clinical migration 039. Production traffic was not promoted.');
  }
  return {
    buildId: version.buildId, revision: version.revision, ready: true,
    clinicalTreatmentObjectiveDateSchema: { migration: objective.migration, dataType: objective.dataType, applied: objective.applied },
    clinicalPlanFrequencySchema: { migration: frequency.migration, dataType: frequency.dataType, applied: frequency.applied }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [candidateUrl, sourceCommit, revision] = process.argv.slice(2);
  try {
    const url = new URL('/api/app-version', candidateUrl);
    if (url.protocol !== 'https:') throw new Error('The candidate version check requires HTTPS.');
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) throw new Error('The candidate version endpoint is unavailable.');
    console.log(JSON.stringify(verifyClinicalPlanStorage(await response.json(), { sourceCommit, revision })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
