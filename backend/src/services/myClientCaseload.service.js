import pool from '../config/database.js';
import { clientServiceAssignmentSql } from '../utils/clientServiceAssignmentSql.js';

// Match the direct, service and legacy school assignments used by My Clients.
export function ownClientCaseloadScope(userId) {
  const service = clientServiceAssignmentSql({ providerId: userId, serviceKind: 'counseling', sameClientAgency: true });
  return {
    sql: `EXISTS (
      SELECT 1 FROM user_agencies membership
      JOIN agencies a ON a.id = membership.agency_id
      JOIN users u ON u.id = membership.user_id
      WHERE membership.user_id = ? AND membership.agency_id = c.agency_id
        AND COALESCE(membership.is_active, 1) = 1
        AND COALESCE(a.is_active, 1) = 1 AND COALESCE(a.is_archived, 0) = 0
        AND COALESCE(a.organization_type, 'agency') NOT IN ('school', 'program')
        AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
        AND COALESCE(u.status, '') NOT IN ('TERMINATED', 'TERMINATED_PENDING', 'ARCHIVED', 'INACTIVE_EMPLOYEE')
    )
    AND c.compliance_archived_at IS NULL
    AND UPPER(COALESCE(c.status, '')) NOT IN ('ARCHIVED', 'TERMINATED')
    AND COALESCE(cs.status_key, '') NOT IN ('archived', 'terminated')
    AND (${service.sql} OR EXISTS (
      SELECT 1 FROM client_provider_assignments assignment
      WHERE assignment.client_id = c.id AND assignment.agency_id = c.agency_id
        AND assignment.provider_user_id = ? AND assignment.is_active = 1
    ) OR (c.provider_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM client_provider_assignments assignment
        WHERE assignment.client_id = c.id AND assignment.agency_id = c.agency_id AND assignment.is_active = 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM client_service_enrollments enrollment
        WHERE enrollment.client_id = c.id AND enrollment.agency_id = c.agency_id
          AND enrollment.service_kind = 'counseling' AND enrollment.is_active = 1
          AND COALESCE(enrollment.service_status, 'active') = 'active'
      )))`,
    params: [userId, ...service.params, userId, userId]
  };
}

export async function readCaseloadEmailClients(userId, { agencyId, clientIds } = {}) {
  const scope = ownClientCaseloadScope(userId);
  const filters = [];
  const params = [...scope.params];
  if (agencyId) {
    filters.push('AND c.agency_id = ?');
    params.push(agencyId);
  }
  if (clientIds?.length) {
    filters.push(`AND c.id IN (${clientIds.map(() => '?').join(',')})`);
    params.push(...clientIds);
  }
  const [rows] = await pool.execute(`SELECT c.id, c.agency_id, a.name AS agency_name
    FROM clients c JOIN agencies a ON a.id = c.agency_id
    LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
    WHERE ${scope.sql} ${filters.join(' ')}
    ORDER BY a.name, c.id`, params);
  return rows;
}
