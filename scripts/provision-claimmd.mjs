// Inspect by default. --apply stages a disabled connection on a no-traffic revision.
// This script never retrieves the API key or prints the service's environment.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function provisionClaimMd({ call, config, apply = false }) {
  const { service, region, accountId, agencyIds, secret, version } = config;
  if (!/^\d+$/.test(accountId) || !Array.isArray(agencyIds) || !agencyIds.length ||
      agencyIds.some(id => !Number.isSafeInteger(id) || id < 1) ||
      !/^[A-Za-z0-9_-]+$/.test(secret) || !/^[1-9]\d*$/.test(version)) {
    throw new Error('Use a numeric account, explicit agency IDs, and a pinned secret version.');
  }
  const current = call(['run', 'services', 'describe', service, `--region=${region}`]);
  const spec = current.spec.template.spec;
  const runtimeAccount = spec.serviceAccountName;
  if (!runtimeAccount) throw new Error('An explicit runtime service account is required.');
  const env = spec.containers[0].env || [];
  const configured = name => env.find(e => e.name === name);
  const previousAccount = configured('CLAIM_MD_ACCOUNT_ID')?.value;
  const previousAgencies = configured('CLAIM_MD_AGENCY_IDS')?.value;
  if (previousAccount && previousAccount !== accountId) throw new Error('A different Claim.MD account is configured; review the account migration first.');
  if (previousAgencies && previousAgencies.split(',').map(s => Number(s.trim())).some(id => !agencyIds.includes(id))) {
    throw new Error('This plan would remove an existing agency; review the allowlist first.');
  }
  if (configured('CLAIM_MD_ACCOUNT_KEY')?.value !== undefined) throw new Error('A literal API key is configured; migrate it explicitly before applying this plan.');
  const pinned = call(['secrets', 'versions', 'describe', version, `--secret=${secret}`]);
  if (pinned.state !== 'ENABLED') throw new Error('The pinned Claim.MD secret version is not enabled.');
  const policy = call(['secrets', 'get-iam-policy', secret]);
  const member = `serviceAccount:${runtimeAccount}`;
  const grantNeeded = !(policy.bindings || []).some(b => b.role === 'roles/secretmanager.secretAccessor' && !b.condition && b.members?.includes(member));
  const plan = { service, region, accountId, agencyIds, secret, version, runtimeAccount, grantNeeded, mode: 'disabled', applied: false };
  if (!apply) return plan;
  if (grantNeeded) call(['secrets', 'add-iam-policy-binding', secret, `--member=${member}`, '--role=roles/secretmanager.secretAccessor', '--condition=None']);
  const result = call(['run', 'services', 'update', service, `--region=${region}`, '--no-traffic',
    `--update-secrets=CLAIM_MD_ACCOUNT_KEY=${secret}:${version}`,
    `--update-env-vars=^|^CLAIM_MD_ACCOUNT_ID=${accountId}|CLAIM_MD_AGENCY_IDS=${agencyIds.join(',')}|CLAIM_MD_MODE=disabled`]);
  return { ...plan, applied: true, revision: result.status?.latestCreatedRevisionName };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(readFileSync(new URL('../docs/billing/claimmd-tisi.config.json', import.meta.url), 'utf8'));
    const call = args => {
      const r = spawnSync(process.env.GCLOUD_BIN || 'gcloud', [...args, `--project=${config.project}`,
        ...(process.env.GCLOUD_ACCOUNT ? [`--account=${process.env.GCLOUD_ACCOUNT}`] : []), '--quiet', '--format=json'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      // Cloud errors can contain service configuration; do not echo raw output.
      if (r.status !== 0) throw new Error(`Cloud operation failed (${args.slice(0, 3).join(' ')}). Check login and IAM permissions.`);
      return JSON.parse(r.stdout || '{}');
    };
    console.log(JSON.stringify(provisionClaimMd({ call, config, apply: process.argv.includes('--apply') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
