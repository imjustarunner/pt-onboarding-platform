const paths=new Set(['.github/workflows/deploy-backend.yml','.github/workflows/deploy-frontend.yml']);
const active=new Set(['requested','queued','pending','waiting','in_progress']);
/** Only older main deployments can be cancelled. The caller additionally proves
 * ancestry through GitHub and rechecks the current main head before each cancel. */
export function supersededDeploymentRuns(runs,{head,liveBuilds=[]}){
 if(!/^[a-f0-9]{40}$/.test(head||''))throw Error('A retained release commit is required.');
 if(liveBuilds.length!==2||liveBuilds.some(s=>!/^[a-f0-9]{40}$/.test(s||'')))throw Error('Both live source commits must be verified.');
 return runs.filter(r=>paths.has(r.path)&&r.head_branch==='main'&&['push','workflow_dispatch'].includes(r.event)
  &&active.has(r.status)&&/^[a-f0-9]{40}$/.test(r.head_sha||'')&&r.head_sha!==head&&!liveBuilds.includes(r.head_sha));
}
