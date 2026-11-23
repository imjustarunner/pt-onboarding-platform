import pool from '../config/database.js';

const invalid = message => Object.assign(new Error(message), { status: 400 });

/** Historical providers may be inactive or no longer have a provider role. */
export async function listClientTerminationProviders(client, db = pool) {
  const [rows] = await db.execute(`SELECT u.id, u.first_name, u.last_name, u.is_active, u.is_archived
    FROM users u
    WHERE (
      u.role IN ('provider','provider_plus','intern','intern_plus')
      AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=?)
    ) OR u.id=? OR EXISTS (
      SELECT 1 FROM client_provider_assignments a WHERE a.client_id=? AND a.provider_user_id=u.id
    )
    ORDER BY u.last_name, u.first_name, u.id`, [client.agency_id, client.provider_id || null, client.id]);
  return rows;
}

export async function clientTerminationDetails(body, client, db = pool) {
  const reason = body?.termination_reason;
  if (reason != null && typeof reason !== 'string') throw invalid('Enter a termination reason as text.');
  if (reason?.trim().length > 2000) throw invalid('The termination reason must be 2,000 characters or fewer.');

  const date = body?.termination_date;
  let effectiveDate = null;
  if (date != null && date !== '') {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1000) throw invalid('Choose a valid termination date.');
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw invalid('Choose a valid termination date.');
    effectiveDate = date;
  }

  let provider = null;
  const rawProviderId = body?.termination_last_provider_id;
  // Omission keeps the existing action useful for currently assigned clients;
  // an explicit null always means no provider is being recorded.
  const providerId = rawProviderId === undefined ? client.provider_id : rawProviderId;
  if (providerId != null && providerId !== '') {
    if (!['string', 'number'].includes(typeof providerId) || !/^\d+$/.test(String(providerId)) || !Number.isSafeInteger(Number(providerId)) || Number(providerId) <= 0) {
      throw invalid('Choose a valid last provider.');
    }
    provider = (await listClientTerminationProviders(client, db)).find(row => Number(row.id) === Number(providerId));
    if (!provider) throw invalid('Choose a provider from this client’s agency or assignment history.');
  }

  return {
    termination_reason: reason?.trim() || null,
    termination_effective_date: effectiveDate,
    termination_last_provider_id: provider ? Number(provider.id) : null,
    termination_last_provider_name: provider ? ([provider.first_name, provider.last_name].filter(Boolean).join(' ').trim() || `Provider #${provider.id}`).slice(0, 255) : null
  };
}
