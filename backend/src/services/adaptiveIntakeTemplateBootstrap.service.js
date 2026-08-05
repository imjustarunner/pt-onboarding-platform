import pool from '../config/database.js';

/**
 * Copy a framed practitioner pathway template into an agency intake_link's
 * intake_fields when the link has no fields yet. Does not overwrite configured forms.
 */
export async function ensurePractitionerIntakeFrame({ agencyId, verticalKey, intakeLinkId }) {
  const aid = Number(agencyId);
  const linkId = Number(intakeLinkId);
  if (!aid || !linkId) throw new Error('agencyId and intakeLinkId are required');

  const [tplRows] = await pool.execute(
    `SELECT fields_json FROM adaptive_intake_pathway_templates WHERE vertical_key = ? LIMIT 1`,
    [verticalKey]
  );
  const fields = tplRows[0]?.fields_json
    ? typeof tplRows[0].fields_json === 'string'
      ? JSON.parse(tplRows[0].fields_json)
      : tplRows[0].fields_json
    : null;
  if (!Array.isArray(fields) || !fields.length) {
    throw new Error(`No pathway template for vertical ${verticalKey}`);
  }

  const [linkRows] = await pool.execute(
    `SELECT id, intake_fields FROM intake_links WHERE id = ? AND organization_id = ? LIMIT 1`,
    [linkId, aid]
  );
  const link = linkRows[0];
  if (!link) throw new Error('Intake link not found');

  let existing = link.intake_fields;
  if (typeof existing === 'string') {
    try {
      existing = JSON.parse(existing);
    } catch {
      existing = [];
    }
  }
  if (Array.isArray(existing) && existing.length) {
    return { updated: false, reason: 'link_already_has_fields', fieldCount: existing.length };
  }

  await pool.execute(`UPDATE intake_links SET intake_fields = ? WHERE id = ?`, [
    JSON.stringify(fields),
    linkId
  ]);
  return { updated: true, fieldCount: fields.length };
}

export async function listPathwayTemplates() {
  try {
    const [rows] = await pool.execute(
      `SELECT vertical_key, name, description, fields_json FROM adaptive_intake_pathway_templates ORDER BY vertical_key`
    );
    return rows.map((r) => ({
      verticalKey: r.vertical_key,
      name: r.name,
      description: r.description,
      fields: typeof r.fields_json === 'string' ? JSON.parse(r.fields_json) : r.fields_json
    }));
  } catch {
    return [];
  }
}
