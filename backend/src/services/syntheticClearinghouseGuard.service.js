import pool from '../config/database.js';

// Drafts and local reviews remain available. Synthetic data never leaves for a payer.
export async function assertLiveClearinghouseAgency(agencyId, database = pool) {
  const deny = () => Object.assign(new Error('Demo organizations can review billing locally but cannot transmit claims, eligibility requests, or payer enrollments.'), { status: 403, code: 'SYNTHETIC_CLEARINGHOUSE_BLOCKED' });
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) throw deny();
  const [[agency]] = await database.execute('SELECT id,slug,feature_flags FROM agencies WHERE id = ?', [Number(agencyId)]);
  if (!agency) throw deny();
  let flags = agency.feature_flags;
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { throw deny(); } }
  if ([450,451,452].includes(Number(agency.id)) || String(agency.slug || '').startsWith('auricwell-qa-demo') || flags?.qaSandbox?.syntheticOnly === true) throw deny();
}
