import pool from '../config/database.js';
import { groupClientsByFirstLastName } from '../utils/clientNameDuplicate.js';

export async function findNameDuplicateGroups({
  agencyId,
  organizationId = null,
  includeArchived = false
} = {}) {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid <= 0) {
    return { groups: [], groupCount: 0, clientCount: 0 };
  }

  const values = [aid];
  let sql = `
    SELECT
      c.id,
      c.full_name,
      c.initials,
      c.identifier_code,
      c.date_of_birth,
      c.status,
      c.client_status_id,
      cs.label AS client_status_label,
      cs.status_key AS client_status_key,
      c.organization_id,
      org.name AS organization_name,
      org.slug AS organization_slug,
      c.agency_id,
      a.name AS agency_name,
      c.provider_id,
      TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS provider_name,
      c.grade,
      c.school_year
    FROM clients c
    LEFT JOIN agencies org ON org.id = c.organization_id
    LEFT JOIN agencies a ON a.id = c.agency_id
    LEFT JOIN users p ON p.id = c.provider_id
    LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
    WHERE c.agency_id = ?
      AND c.full_name IS NOT NULL
      AND TRIM(c.full_name) <> ''
  `;
  if (!includeArchived) {
    sql += ` AND UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'`;
  }
  const orgId = Number(organizationId);
  if (Number.isFinite(orgId) && orgId > 0) {
    sql += ' AND c.organization_id = ?';
    values.push(orgId);
  }
  sql += ' ORDER BY c.id ASC';

  const [rows] = await pool.execute(sql, values);
  const groups = groupClientsByFirstLastName(rows || []);
  return {
    groups,
    groupCount: groups.length,
    clientCount: groups.reduce((sum, group) => sum + (group.memberCount || 0), 0)
  };
}
