import AgencyClaimMdCredentials from '../models/AgencyClaimMdCredentials.model.js';
import { decryptChatText } from './chatEncryption.service.js';

export function sharedClaimMdConnection(agencyId, env = process.env) {
  const ids = String(env.CLAIM_MD_AGENCY_IDS || '').split(',').map(s => Number(s.trim())).filter(n => Number.isSafeInteger(n) && n > 0);
  if (!ids.includes(Number(agencyId)) || !env.CLAIM_MD_ACCOUNT_KEY) return null;
  const accountId = String(env.CLAIM_MD_ACCOUNT_ID || '').trim();
  if (!accountId) throw Object.assign(new Error('Set CLAIM_MD_ACCOUNT_ID before using the shared connection'), { status: 409 });
  return { accountKey: env.CLAIM_MD_ACCOUNT_KEY, accountId, mode: env.CLAIM_MD_MODE || 'disabled', source: 'secret_manager', connectionId: `account:${accountId}` };
}

export async function resolveClaimMdConnection(agencyId) {
  const shared = sharedClaimMdConnection(agencyId);
  if (shared) return shared;
  const row = await AgencyClaimMdCredentials.findByAgencyId(agencyId);
  if (!row?.account_key_enc) throw Object.assign(new Error('Claim.MD is not configured for this agency'), { status: 409 });
  const parsed = JSON.parse(row.account_key_enc);
  return {
    accountKey: decryptChatText({ ciphertextB64: parsed.ciphertext, ivB64: parsed.iv, authTagB64: parsed.tag, keyId: parsed.keyId }),
    accountId: row.account_id, mode: process.env[`CLAIM_MD_MODE_${agencyId}`] || 'disabled', source: 'encrypted_database',
    connectionId: row.account_id ? `account:${row.account_id}` : `agency:${agencyId}`
  };
}

export async function claimMdConnectionMeta(agencyId) {
  const shared = sharedClaimMdConnection(agencyId);
  if (shared) return { configured: true, accountId: shared.accountId, mode: shared.mode, source: shared.source };
  return { ...await AgencyClaimMdCredentials.publicMeta(agencyId), mode: process.env[`CLAIM_MD_MODE_${agencyId}`] || 'disabled', source: 'encrypted_database' };
}

export function requireClaimMdTransmission(connection) {
  if (!['test', 'live'].includes(connection.mode)) throw Object.assign(new Error('Claim.MD transmission is disabled. Configure the verified account type as test or live.'), { status: 409 });
}
