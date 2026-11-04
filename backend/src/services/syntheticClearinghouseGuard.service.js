import pool from '../config/database.js';

const deny = () => Object.assign(new Error('Demo organizations can review billing locally but cannot transmit claims, eligibility requests, or payer enrollments.'), { status: 403, code: 'SYNTHETIC_CLEARINGHOUSE_BLOCKED' });

function parsedFlags(agency) {
  let flags = agency.feature_flags;
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { throw deny(); } }
  return flags || {};
}

// Demo and synthetic-only organizations never reach a payer. Ordinary agencies do.
export function agencyBlocksLiveClearinghouse(agency) {
  if (!agency) throw deny();
  const flags = parsedFlags(agency);
  return [450, 451, 452].includes(Number(agency.id)) || String(agency.slug || '').startsWith('auricwell-qa-demo') || flags?.qaSandbox?.syntheticOnly === true;
}

async function loadClearinghouseAgency(agencyId, database) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) throw deny();
  const [[agency]] = await database.execute('SELECT id,slug,feature_flags FROM agencies WHERE id = ?', [Number(agencyId)]);
  if (!agency) throw deny();
  return agency;
}

export async function isSyntheticClearinghouseAgency(agencyId, database = pool) {
  return agencyBlocksLiveClearinghouse(await loadClearinghouseAgency(agencyId, database));
}

// Drafts and local reviews remain available. Synthetic data never leaves for a payer.
export async function assertLiveClearinghouseAgency(agencyId, database = pool) {
  if (await isSyntheticClearinghouseAgency(agencyId, database)) throw deny();
}
