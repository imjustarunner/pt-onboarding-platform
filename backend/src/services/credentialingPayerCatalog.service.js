import { createHash } from 'node:crypto';

const nameKey = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** Link only exact, unique names to already verified electronic routes. */
export function planCredentialingPayerCatalog({ agencyId, payers, definitions, links, onlyPayerId = null }) {
  const routes = new Map();
  for (const payer of payers.filter(p => Number(p.agency_id) === Number(agencyId))) {
    const id = String(payer.claimmd_payer_id || '').trim();
    if (!id || payer.directory_status !== 'id_match') continue;
    const route = routes.get(id) || { payerId: id, requestId: payer.id, name: payer.payer_name || payer.directory_name, names: new Set() };
    for (const name of [payer.payer_name, payer.directory_name]) if (nameKey(name)) route.names.add(nameKey(name));
    routes.set(id, route);
  }
  const scopedDefinitions = definitions.filter(d => Number(d.agency_id) === Number(agencyId));
  const scopedLinks = links.filter(l => Number(l.agency_id) === Number(agencyId));
  const operations = [], conflicts = [];
  for (const route of routes.values()) {
    if (onlyPayerId && route.payerId !== String(onlyPayerId)) continue;
    if (scopedLinks.some(link => String(link.payer_id) === route.payerId)) continue;
    const matches = scopedDefinitions.filter(d => route.names.has(nameKey(d.name)));
    const routeNameAmbiguous = [...route.names].some(name => [...routes.values()].filter(r => r.names.has(name)).length > 1);
    const conflicting = !nameKey(route.name) || routeNameAmbiguous || matches.length > 1 || matches.some(d =>
      scopedLinks.some(l => Number(l.insurance_definition_id) === Number(d.id))
      || [...routes.values()].filter(r => r.names.has(nameKey(d.name))).length > 1);
    if (conflicting) { conflicts.push({ payerId: route.payerId, definitionIds: matches.map(d => Number(d.id)), reason: 'An existing payer name or mapping needs review.' }); continue; }
    operations.push({ action: matches.length ? 'link_existing' : 'create_definition', payerId: route.payerId,
      requestId: Number(route.requestId), definitionId: matches.length ? Number(matches[0].id) : null,
      name: matches[0]?.name || route.name });
  }
  return { agencyId: Number(agencyId), operations, conflicts };
}

export const payerCatalogPlanToken = plan => createHash('sha256').update(JSON.stringify(plan)).digest('hex');

export async function syncCredentialingPayerCatalog({ agencyId, actorUserId, apply = false, onlyPayerId = null, withinTransaction = false, planToken = null, trustedPayerWrite = false }, database = null) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) throw fail('Select a valid practice.');
  if (apply && (!Number.isSafeInteger(Number(actorUserId)) || Number(actorUserId) < 1)) throw fail('A billing actor is required.');
  database ||= (await import('../config/database.js')).default;
  const owned = apply && !withinTransaction;
  const db = owned ? await database.getConnection() : database;
  try {
    if (owned) await db.beginTransaction();
    if (apply) {
      const [[agency]] = await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
      if (!agency) throw fail('Practice not found.', 404);
    }
    const [payers] = await db.execute(`SELECT r.id,r.agency_id,r.payer_name,d.claimmd_payer_id,d.directory_name,d.directory_status
      FROM medical_payer_setup_requests r JOIN medical_payer_setup_details d ON d.request_id=r.id
      WHERE r.agency_id=? AND d.directory_status='id_match' ORDER BY r.id${apply ? ' FOR UPDATE' : ''}`, [agencyId]);
    const [definitions] = await db.execute(`SELECT id,agency_id,name FROM insurance_credentialing_definitions WHERE agency_id=? ORDER BY id${apply ? ' FOR UPDATE' : ''}`, [agencyId]);
    const [links] = await db.execute(`SELECT agency_id,insurance_definition_id,payer_id FROM credentialing_payer_links WHERE agency_id=?${apply ? ' FOR UPDATE' : ''}`, [agencyId]);
    const plan = planCredentialingPayerCatalog({ agencyId, payers, definitions, links, onlyPayerId });
    const currentToken = payerCatalogPlanToken({ ...plan, onlyPayerId });
    if (!apply) return { ...plan, planToken: currentToken, applied: false };
    // The UI can apply only the reviewed set. Internal directory saves already
    // verified their payer within this transaction and never accept this flag
    // from request input.
    if (!(withinTransaction && trustedPayerWrite) && planToken !== currentToken) throw fail('The payer sync preview changed. Preview the current payer catalog before applying.', 409);
    const applied = [];
    for (const operation of plan.operations) {
      let id = operation.definitionId;
      if (!id) {
        const [created] = await db.execute('INSERT INTO insurance_credentialing_definitions (agency_id,name,sort_order) VALUES (?,?,0)', [agencyId, operation.name]);
        id = created.insertId;
      }
      const [[record]] = await db.execute('SELECT id FROM insurance_credentialing_definitions WHERE agency_id=? AND id=? FOR UPDATE', [agencyId, id]);
      if (!record) throw fail('The payer definition changed; reload before syncing.', 409);
      const [[existing]] = await db.execute('SELECT payer_id FROM credentialing_payer_links WHERE agency_id=? AND insurance_definition_id=? FOR UPDATE', [agencyId, id]);
      if (existing) {
        if (String(existing.payer_id) !== operation.payerId) throw fail('A credentialing payer mapping changed. Preview again before syncing.', 409);
        continue;
      }
      const evidence = `Verified billing payer catalog request #${operation.requestId}; ${operation.action === 'link_existing' ? 'exact unique payer-name match' : 'definition created from verified billing payer'}.`;
      await db.execute('INSERT INTO credentialing_payer_links (agency_id,insurance_definition_id,payer_id,evidence_reference,updated_by_user_id) VALUES (?,?,?,?,?)', [agencyId, id, operation.payerId, evidence, actorUserId]);
      await db.execute('INSERT INTO credentialing_workflow_events (agency_id,subject_type,record_id,actor_user_id,before_json,after_json) VALUES (?,?,?,?,?,?)', [agencyId, 'payer', id, actorUserId, null, JSON.stringify({ action: operation.action, payerId: operation.payerId, evidenceReference: evidence, source: 'verified_billing_payer_catalog' })]);
      applied.push({ ...operation, definitionId: Number(id) });
    }
    if (owned) await db.commit();
    return { ...plan, planToken: currentToken, applied: true, results: applied };
  } catch (error) { if (owned) await db.rollback(); throw error; }
  finally { if (owned) db.release(); }
}
