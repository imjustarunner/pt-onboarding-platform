// Provision once through the normal backend deployment identity. Never print keys,
// rotate an existing key, or substitute a different application's encryption key.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MFA_ENV = 'MFA_ENCRYPTION_KEY_BASE64';
export function validKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(value.trim()) && Buffer.from(value.trim(), 'base64').length === 32;
}
export function provisionMfaSecret({ call, service, region, makeKey = () => randomBytes(32).toString('base64') }) {
  const current = call(['run', 'services', 'describe', service, `--region=${region}`]);
  const spec = current.spec.template.spec;
  const entries = (spec.containers[0].env || []).filter(e => e.name === MFA_ENV);
  if (entries.length > 1) throw new Error('Duplicate MFA configuration; reconcile it before deploying.');
  const entry = entries[0];
  const ref = entry?.valueFrom?.secretKeyRef;
  const runtimeAccount = spec.serviceAccountName;
  if (!runtimeAccount) throw new Error('An explicit backend runtime service account is required.');
  function grantRuntimeAccess(secret) {
    const policy = call(['secrets', 'get-iam-policy', secret]);
    const member = `serviceAccount:${runtimeAccount}`;
    if (!(policy.bindings || []).some(b => b.role === 'roles/secretmanager.secretAccessor' && !b.condition && b.members?.includes(member))) {
      call(['secrets', 'add-iam-policy-binding', secret, `--member=${member}`, '--role=roles/secretmanager.secretAccessor', '--condition=None']);
    }
  }
  // Only secrets actually referenced by this service, never guessed key names
  // or project-wide access. The deployment identity does not receive key access.
  const referenced = new Set((spec.containers[0].env || []).map(e => e.valueFrom?.secretKeyRef?.name).filter(Boolean));
  for (const name of referenced) grantRuntimeAccess(name);
  if (ref?.name && /^[1-9][0-9]*$/.test(ref.key)) return { changed: false, secret: ref.name, version: ref.key, runtimeAccount };
  const literal = entry?.value;
  if (literal !== undefined && !validKey(literal)) throw new Error('Existing MFA key is invalid; refusing to replace it automatically.');
  const secret = ref?.name || MFA_ENV;
  if (!/^[A-Za-z0-9_-]+$/.test(secret)) throw new Error('Cross-project MFA reference requires explicit provisioning.');
  const available = call(['secrets', 'list', `--filter=name:${secret}`]);
  const exists = available.some(s => s.name.split('/').pop() === secret);
  let versionToDescribe = 'latest';
  if (ref && !exists) throw new Error('Configured MFA secret is missing; refusing to replace an existing key.');
  if (!exists) {
    const key = literal || makeKey();
    if (!validKey(key)) throw new Error('Invalid MFA encryption key.');
    call(['secrets', 'create', secret, '--replication-policy=automatic', '--data-file=-'], { input: key });
    versionToDescribe = '1';
  }
  // If Cloud Run still has a literal key, that exact value is authoritative for
  // decrypting existing MFA records. Preserve it in a new pinned version rather
  // than reading/comparing another version or switching to a different key.
  if (literal && exists) {
    const added = call(['secrets', 'versions', 'add', secret, '--data-file=-'], { input: literal.trim() });
    versionToDescribe = added.name?.split('/').pop();
    if (!/^[1-9][0-9]*$/.test(versionToDescribe)) throw new Error('Could not identify the exact preserved MFA key version.');
  }
  const latest = call(['secrets', 'versions', 'describe', versionToDescribe, `--secret=${secret}`]);
  const version = latest.name?.split('/').pop();
  if (latest.state !== 'ENABLED' || !/^[1-9][0-9]*$/.test(version)) throw new Error('MFA secret needs an enabled numeric version.');
  if (!referenced.has(secret)) grantRuntimeAccess(secret);
  call(['run', 'services', 'update', service, `--region=${region}`, '--no-traffic', ...(literal !== undefined ? [`--remove-env-vars=${MFA_ENV}`] : []), `--update-secrets=${MFA_ENV}=${secret}:${version}`]);
  return { changed: true, secret, version, runtimeAccount };
}

function cloudCall(args, { input, raw = false } = {}) {
  const result = spawnSync('gcloud', [...args, '--quiet', ...(raw ? [] : ['--format=json'])], { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Cloud operation failed: ${args.join(' ')}. Check the deployment account's permissions. Secret values have not been logged.`);
  return raw ? result.stdout : JSON.parse(result.stdout || '{}');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = provisionMfaSecret({ call: cloudCall, service: process.env.SERVICE_NAME || 'onboarding-backend', region: process.env.REGION || 'us-west3' });
    console.log(JSON.stringify({ ...result, note: 'Only the reference is reported. No encryption key was logged.' }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
