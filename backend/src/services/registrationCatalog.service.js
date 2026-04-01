import pool from '../config/database.js';

/** Learning classes use agencies.id as organization_id; include parent agency and affiliated org rows. */
export async function learningClassOrgIdsForAgency(agencyId) {
  const aid = Number(agencyId);
  const ids = new Set(aid > 0 ? [aid] : []);
  const [orgRows] = await pool.execute(
    `SELECT organization_id FROM organization_affiliations
     WHERE agency_id = ? AND is_active = TRUE`,
    [aid]
  );
  for (const r of orgRows || []) {
    const oid = Number(r.organization_id);
    if (oid > 0) ids.add(oid);
  }
  return [...ids];
}

/**
 * Registration-eligible company events and learning classes for an agency (non-PHI catalog).
 * @param {number} agencyId
 * @param {{ lockedCompanyEventId?: number|null }} [options]
 * @returns {Promise<Array<{ kind: string, id: number, title: string, summary: string, startsAt, endsAt, enrollmentOpensAt, enrollmentClosesAt, medicaidEligible: boolean, cashEligible: boolean }>>}
 */
export async function fetchRegistrationCatalogItems(agencyId, options = {}) {
  const aid = Number(agencyId);
  if (!aid) return [];

  const lockedId = Number(options.lockedCompanyEventId || 0) || null;
  const items = [];

  try {
    if (lockedId) {
      const [evRows] = await pool.execute(
        `SELECT ce.id, ce.title, ce.description, ce.starts_at, ce.ends_at,
                ce.registration_eligible, ce.medicaid_eligible, ce.cash_eligible,
                ce.snacks_available, ce.snack_options_json, ce.meals_available, ce.meal_options_json,
                linked_form.title AS linked_form_title,
                linked_form.public_key AS linked_form_public_key,
                linked_form.form_type AS linked_form_type
         FROM company_events ce
         LEFT JOIN intake_links linked_form
           ON linked_form.id = (
             SELECT il2.id
             FROM intake_links il2
             WHERE il2.company_event_id = ce.id
               AND (il2.is_active = 1 OR il2.is_active IS TRUE)
             ORDER BY il2.updated_at DESC, il2.id DESC
             LIMIT 1
           )
         WHERE ce.agency_id = ?
           AND ce.id = ?
           AND (ce.is_active = 1 OR ce.is_active IS NULL)
           AND ce.registration_eligible = 1
           AND (ce.ends_at IS NULL OR ce.ends_at >= NOW())
         LIMIT 1`,
        [aid, lockedId]
      );
      const parseJsonArr = (raw) => { try { const p = raw ? JSON.parse(raw) : null; return Array.isArray(p) ? p : []; } catch { return []; } };
      for (const r of evRows || []) {
        items.push({
          kind: 'company_event',
          id: Number(r.id),
          title: r.title || `Event ${r.id}`,
          summary: r.description ? String(r.description).slice(0, 240) : '',
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          enrollmentOpensAt: null,
          enrollmentClosesAt: null,
          medicaidEligible: !!(r.medicaid_eligible === 1 || r.medicaid_eligible === true),
          cashEligible: !!(r.cash_eligible === 1 || r.cash_eligible === true),
          snacksAvailable: r.snacks_available === undefined ? true : !!(r.snacks_available === 1 || r.snacks_available === true),
          snackOptions: parseJsonArr(r.snack_options_json),
          mealsAvailable: !!(r.meals_available === 1 || r.meals_available === true),
          mealOptions: parseJsonArr(r.meal_options_json),
          linkedIntakeTitle: r.linked_form_title ? String(r.linked_form_title).trim() || null : null,
          linkedIntakePublicKey: r.linked_form_public_key ? String(r.linked_form_public_key).trim() || null : null,
          linkedIntakeFormType: r.linked_form_type ? String(r.linked_form_type).trim().toLowerCase() || null : null
        });
      }
    } else {
      const [evRows] = await pool.execute(
        `SELECT ce.id, ce.title, ce.description, ce.starts_at, ce.ends_at,
                ce.registration_eligible, ce.medicaid_eligible, ce.cash_eligible,
                ce.snacks_available, ce.snack_options_json, ce.meals_available, ce.meal_options_json,
                linked_form.title AS linked_form_title,
                linked_form.public_key AS linked_form_public_key,
                linked_form.form_type AS linked_form_type
         FROM company_events ce
         LEFT JOIN intake_links linked_form
           ON linked_form.id = (
             SELECT il2.id
             FROM intake_links il2
             WHERE il2.company_event_id = ce.id
               AND (il2.is_active = 1 OR il2.is_active IS TRUE)
             ORDER BY il2.updated_at DESC, il2.id DESC
             LIMIT 1
           )
         WHERE ce.agency_id = ?
           AND (ce.is_active = 1 OR ce.is_active IS NULL)
           AND ce.registration_eligible = 1
           AND (ce.ends_at IS NULL OR ce.ends_at >= NOW())
         ORDER BY ce.starts_at ASC
         LIMIT 200`,
        [aid]
      );
      const parseJsonArr2 = (raw) => { try { const p = raw ? JSON.parse(raw) : null; return Array.isArray(p) ? p : []; } catch { return []; } };
      for (const r of evRows || []) {
        items.push({
          kind: 'company_event',
          id: Number(r.id),
          title: r.title || `Event ${r.id}`,
          summary: r.description ? String(r.description).slice(0, 240) : '',
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          snacksAvailable: r.snacks_available === undefined ? true : !!(r.snacks_available === 1 || r.snacks_available === true),
          snackOptions: parseJsonArr2(r.snack_options_json),
          mealsAvailable: !!(r.meals_available === 1 || r.meals_available === true),
          mealOptions: parseJsonArr2(r.meal_options_json),
          linkedIntakeTitle: r.linked_form_title ? String(r.linked_form_title).trim() || null : null,
          linkedIntakePublicKey: r.linked_form_public_key ? String(r.linked_form_public_key).trim() || null : null,
          linkedIntakeFormType: r.linked_form_type ? String(r.linked_form_type).trim().toLowerCase() || null : null,
          enrollmentOpensAt: null,
          enrollmentClosesAt: null,
          medicaidEligible: !!(r.medicaid_eligible === 1 || r.medicaid_eligible === true),
          cashEligible: !!(r.cash_eligible === 1 || r.cash_eligible === true)
        });
      }
    }
  } catch (err) {
    if (!String(err?.message || '').includes('Unknown column') && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }

  if (lockedId) {
    items.sort((a, b) => {
      const ta = new Date(a.startsAt || a.enrollmentOpensAt || 0).getTime();
      const tb = new Date(b.startsAt || b.enrollmentOpensAt || 0).getTime();
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
    });
    return items;
  }

  try {
    const orgIds = await learningClassOrgIdsForAgency(aid);
    if (orgIds.length) {
      const ph = orgIds.map(() => '?').join(',');
      const [classRows] = await pool.execute(
        `SELECT c.id, c.class_name, c.description, c.starts_at, c.ends_at,
                c.enrollment_opens_at, c.enrollment_closes_at,
                c.registration_eligible, c.medicaid_eligible, c.cash_eligible, c.delivery_mode
         FROM learning_program_classes c
         WHERE c.organization_id IN (${ph})
           AND c.registration_eligible = 1
           AND c.is_active = 1
           AND LOWER(c.status) = 'active'
           AND (c.ends_at IS NULL OR c.ends_at >= NOW())
           AND (c.enrollment_opens_at IS NULL OR c.enrollment_opens_at <= NOW())
           AND (c.enrollment_closes_at IS NULL OR c.enrollment_closes_at >= NOW())
         ORDER BY COALESCE(c.starts_at, c.created_at) ASC
         LIMIT 200`,
        orgIds
      );
      for (const r of classRows || []) {
        items.push({
          kind: 'learning_class',
          id: Number(r.id),
          title: r.class_name || `Class ${r.id}`,
          summary: r.description ? String(r.description).slice(0, 240) : '',
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          enrollmentOpensAt: r.enrollment_opens_at,
          enrollmentClosesAt: r.enrollment_closes_at,
          deliveryMode: String(r.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group',
          medicaidEligible: !!(r.medicaid_eligible === 1 || r.medicaid_eligible === true),
          cashEligible: !!(r.cash_eligible === 1 || r.cash_eligible === true)
        });
      }
    }
  } catch (err) {
    if (!String(err?.message || '').includes('Unknown column') && err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }

  items.sort((a, b) => {
    const ta = new Date(a.startsAt || a.enrollmentOpensAt || 0).getTime();
    const tb = new Date(b.startsAt || b.enrollmentOpensAt || 0).getTime();
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });

  return items;
}
