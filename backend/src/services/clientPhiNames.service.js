import ClientGuardian from '../models/ClientGuardian.model.js';

/**
 * Collect known person names for a client (client + guardians) for PHI scrub / detection.
 */
export async function collectClientPhiNames(client) {
  const names = new Set();
  const add = (value) => {
    const s = String(value || '').trim();
    if (s) names.add(s);
  };

  add(client?.full_name);
  add(client?.first_name);
  add(client?.last_name);
  if (client?.full_name) {
    for (const part of String(client.full_name).split(/\s+/)) add(part);
  }

  try {
    const guardians = await ClientGuardian.listForClient(client?.id);
    for (const g of guardians || []) {
      add(`${g.first_name || ''} ${g.last_name || ''}`.trim());
      add(g.first_name);
      add(g.last_name);
    }
  } catch {
    // guardians table may be unavailable in older deployments
  }

  return [...names];
}
