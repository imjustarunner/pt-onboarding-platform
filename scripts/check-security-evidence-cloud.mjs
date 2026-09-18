#!/usr/bin/env node
// Read-only deployment inventory. Never prints environment secrets or tokens.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  project: { type: 'string' }, account: { type: 'string' }, region: { type: 'string', default: 'us-west3' },
  service: { type: 'string', default: 'onboarding-backend' }, sql: { type: 'string', default: 'ptonboard-mysql' },
  gcloud: { type: 'string', default: 'gcloud' }, help: { type: 'boolean' }
} });
if (values.help || !values.project || !values.account) {
  console.log('Usage: node scripts/check-security-evidence-cloud.mjs --project PROJECT --account EMAIL [--gcloud PATH] [--region REGION] [--service SERVICE] [--sql INSTANCE]');
  process.exit(values.help ? 0 : 1);
}
const report = { checkedAt: new Date().toISOString(), project: values.project, account: values.account, readOnly: true, checks: {} };
function read(name, args, select = data => data) {
  try {
    const output = execFileSync(values.gcloud, [...args, `--project=${values.project}`, `--account=${values.account}`, '--format=json'], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
    });
    const data = JSON.parse(output);
    report.checks[name] = { status: 'read', data: select(data) };
    return data;
  } catch (error) {
    // Commands contain no credentials. Do not print partial JSON from stdout.
    report.checks[name] = { status: 'unverified', error: String(error.stderr || error.code || 'Command failed').slice(0, 2000) };
    return null;
  }
}
const project = read('authentication', ['projects', 'describe', values.project], data => ({ projectId: data.projectId }));
if (!project) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
const run = read('backend', ['run', 'services', 'describe', values.service, `--region=${values.region}`], data => {
  const template = data.spec?.template || {};
  const environment = template.spec?.containers?.[0]?.env || [];
  return {
    service: data.metadata?.name, url: data.status?.url, readyRevision: data.status?.latestReadyRevisionName,
    ingress: data.metadata?.annotations?.['run.googleapis.com/ingress'],
    runtimeIdentity: template.spec?.serviceAccountName,
    cpuThrottling: template.metadata?.annotations?.['run.googleapis.com/cpu-throttling'],
    evidenceConfiguration: environment.filter(item => ['AUDIT_PROXY_MODE', 'AUDIT_GOOGLE_LB_IPS', 'APP_BUILD_ID'].includes(item.name)).map(item => ({ name: item.name, value: item.value ?? '(secret reference)' })),
    storageBuckets: environment.filter(item => ['PTONBOARDFILES', 'GCS_BUCKET_NAME', 'CLINICAL_AUDIO_BUCKET'].includes(item.name)).map(item => ({ name: item.name, value: item.value ?? '(secret reference)' }))
  };
});
read('database', ['sql', 'instances', 'describe', values.sql], data => ({ name: data.name, databaseVersion: data.databaseVersion, state: data.state }));
read('loadBalancerAddresses', ['compute', 'forwarding-rules', 'list'], rows => rows.map(row => ({ name: row.name, IPAddress: row.IPAddress, loadBalancingScheme: row.loadBalancingScheme, target: row.target })));
read('logSinks', ['logging', 'sinks', 'list'], rows => rows.map(row => ({ name: row.name, destination: row.destination, filter: row.filter, disabled: row.disabled || false, writerIdentity: row.writerIdentity })));
for (const location of new Set(['global', values.region])) {
  read(`logBuckets:${location}`, ['logging', 'buckets', 'list', `--location=${location}`], rows => rows.map(row => ({ name: row.name, retentionDays: row.retentionDays, locked: row.locked || false, lifecycleState: row.lifecycleState })));
}
read('auditPolicyAndRuntimeRoles', ['projects', 'get-iam-policy', values.project], data => ({
  auditConfigs: data.auditConfigs || [],
  // No organization/group/member inventory is written to the report.
  directRuntimeRoles: run ? (data.bindings || []).filter(binding => binding.members?.includes(`serviceAccount:${run.spec?.template?.spec?.serviceAccountName}`)).map(binding => ({ role: binding.role, conditional: !!binding.condition })) : null,
  limitation: 'Inherited policies and custom role definitions require separate review.'
}));
report.limitations = [
  'This inventory makes no changes and does not certify the deployment.',
  'Proxy verification requires end-to-end traffic and a direct-ingress bypass test.',
  'Retention, notifications and storage correlation require synthetic event delivery checks.'
];
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.checks).some(check => check.status !== 'read')) process.exitCode = 2;
