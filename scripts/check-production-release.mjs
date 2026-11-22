import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const commitId = value => /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(String(value || ''));
export function assertReleaseContainsProduction({ candidate, frontend, backend, cwd = process.cwd() }) {
  if (!commitId(candidate)) throw new Error('The candidate must identify a retained Git commit.');
  for (const [label, id] of [['frontend', frontend], ['backend', backend]]) {
    if (!commitId(id)) throw new Error(`Production ${label} has no verifiable source commit; stop and reconcile its release before deploying.`);
    try { execFileSync('git', ['cat-file', '-e', `${id}^{commit}`], { cwd, stdio:'pipe' }); }
    catch { throw new Error(`Production ${label} commit ${id} is missing from this checkout. Fetch full history and integrate it before deploying.`); }
    try { execFileSync('git', ['merge-base', '--is-ancestor', id, candidate], { cwd, stdio:'pipe' }); }
    catch { throw new Error(`Deployment would drop the production ${label} release ${id}. Merge the live release into ${candidate} before promoting it.`); }
  }
}
export async function checkProductionRelease({candidate, frontendUrl='https://app.itsco.health/version.json', backendUrl='https://app.itsco.health/api/app-version', cwd} = {}) {
  const read = async url => { const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw new Error(`Cannot verify production release (${response.status}).`);return response.json(); };
  const [front,back]=await Promise.all([read(frontendUrl),read(backendUrl)]);
  if(back.ready!==true)throw new Error('The current production backend is not ready; reconcile it before promoting another release.');
  assertReleaseContainsProduction({candidate,frontend:front.buildId,backend:back.buildId,cwd});
  return {candidate,frontend:front.buildId,backend:back.buildId};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const result=await checkProductionRelease({candidate:process.argv[2]||process.env.GITHUB_SHA});console.log(`Release preserves production frontend ${result.frontend} and backend ${result.backend}.`);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
