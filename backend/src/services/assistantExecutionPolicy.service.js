import { ASSISTANT_POLICY_VERSION, assistantError, assistantConfigurationHash, assistantStoredConfigurationHash, assertAccountCapability } from './assistantTeamPolicy.js';

// Browser permissions are checked on each operation, including resumed runs.
// A previous activation is not a substitute for a current passing verification.
export async function assertAssistantExecution(account, capability, db) {
  if (!account.configuration_fingerprint || account.configuration_fingerprint !== assistantStoredConfigurationHash(account)) {
    throw assistantError(409, 'ASSISTANT_CONFIGURATION_CHANGED', 'Assistant configuration requires owner review.');
  }
  assertAccountCapability(account, capability);
  if (account.group_status !== 'ready') throw assistantError(409, 'ASSISTANT_GROUP_NOT_READY', 'Group setup requires review.');
  if ([450, 453].includes(Number(account.agency_id))) return;
  const [[proof]] = await db.execute(`SELECT id FROM assistant_verifications
    WHERE account_id=? AND capability=? AND policy_version=? AND configuration_hash=? AND outcome='PASS'`,
    [account.id, capability, ASSISTANT_POLICY_VERSION, assistantConfigurationHash(account)]);
  if (!proof) throw assistantError(409, 'CAPABILITY_NOT_VERIFIED', 'This duty needs a current passing verification.');
}

export function assertUnchangedAssistantConfiguration(previous, current) {
  if (!current || Number(previous.policy_revision) !== Number(current.policy_revision)
    || assistantConfigurationHash(previous) !== assistantConfigurationHash(current)) {
    throw assistantError(409, 'ASSISTANT_CONFIGURATION_CHANGED', 'Assistant configuration changed. Reload the workspace.');
  }
}
