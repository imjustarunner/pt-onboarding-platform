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
        `SELECT id, title, description, starts_at, ends_at,
                registration_eligible, medicaid_eligible, cash_eligible
         FROM company_events
         WHERE agency_id = ?
           AND id = ?
           AND (is_active = 1 OR is_active IS NULL)
           AND registration_eligible = 1
           AND (ends_at IS NULL OR ends_at >= NOW())
         LIMIT 1`,
        [aid, lockedId]
      );
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
          cashEligible: !!(r.cash_eligible === 1 || r.cash_eligible === true)
        });
      }
    } else {
      const [evRows] = await pool.execute(
        `SELECT id, title, description, starts_at, ends_at,
                registration_eligible, medicaid_eligible, cash_eligible
         FROM company_events
         WHERE agency_id = ?
           AND (is_active = 1 OR is_active IS NULL)
           AND registration_eligible = 1
           AND (ends_at IS NULL OR ends_at >= NOW())
         ORDER BY starts_at ASC
         LIMIT 200`,
        [aid]
      );
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
                c.registration_eligible, c.medicaid_eligible, c.cash_eligible
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
