import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function schedulingRevisionProblems(service, revisions) {
  const problems=[];
  const live=new Set((service.status?.traffic || []).filter(t=>Number(t.percent)>0).map(t=>t.revisionName));
  if(live.size!==1) problems.push('Scheduling workers require one production revision.');
  const template=service.spec?.template?.metadata?.annotations || {};
  if(Number(template['autoscaling.knative.dev/minScale'] || 0)!==0) problems.push('Revision-level minimum instances must be zero; use the service minimum.');
  for(const r of revisions){
    const name=r.metadata?.name;
    const active=(r.status?.conditions || []).some(c=>c.type==='Active'&&c.status==='True');
    const minimum=Number(r.metadata?.annotations?.['autoscaling.knative.dev/minScale'] || 0);
    if(active&&!live.has(name)&&minimum>0) problems.push(`Obsolete active revision retains background capacity: ${name}`);
  }
  for(const t of service.status?.traffic || [])if(t.tag&&!live.has(t.revisionName)) problems.push(`Non-production revision retains a callable tag: ${t.tag}`);
  return problems;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [servicePath,revisionsPath]=process.argv.slice(2);
  const issues=schedulingRevisionProblems(JSON.parse(fs.readFileSync(servicePath,'utf8')),JSON.parse(fs.readFileSync(revisionsPath,'utf8')));
  if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
  else console.log('Scheduling revision check passed: one live revision, no obsolete pinned workers or preview tags.');
}
