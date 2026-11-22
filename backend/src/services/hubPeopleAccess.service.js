import pool from '../config/database.js';

// Company-specific staff roles apply independently to each returned chart.
function agencyStaffScope(agencyColumn, roles = "'admin','support'") {
  return `EXISTS (SELECT 1 FROM users hub_viewer WHERE hub_viewer.id=? AND (hub_viewer.role='super_admin' OR EXISTS (
    SELECT 1 FROM user_agencies m LEFT JOIN user_agency_access_profiles ap ON ap.user_id=m.user_id AND ap.agency_id=m.agency_id
    WHERE m.user_id=hub_viewer.id AND m.agency_id=${agencyColumn} AND m.is_active=1
      AND COALESCE(NULLIF(ap.effective_role,''),NULLIF(m.agency_role,''),hub_viewer.role) IN (${roles}))))`;
}

// Use the same predicate before LIMIT in searches and when opening a person by ID.
// Supervision is derived from current assignments, scoped to the client's tenant.
export function hubClientScope(userId, alias = 'c') {
  const c = alias;
  return {
    sql: `(${agencyStaffScope(`${c}.agency_id`)}
      OR EXISTS (SELECT 1 FROM client_service_enrollments service
        JOIN user_agencies member ON member.user_id=service.provider_user_id AND member.agency_id=service.agency_id AND member.is_active=1
        WHERE service.client_id=${c}.id AND service.agency_id=${c}.agency_id AND service.provider_user_id=?
          AND service.service_kind='counseling' AND service.is_active=1 AND service.service_status='active')
      OR ${c}.provider_id = ?
      OR EXISTS (SELECT 1 FROM client_provider_assignments hub_assignment WHERE hub_assignment.client_id = ${c}.id AND hub_assignment.provider_user_id = ? AND hub_assignment.is_active = 1)
      OR EXISTS (SELECT 1 FROM supervisor_assignments hub_supervision
        JOIN users hub_supervisee ON hub_supervisee.id = hub_supervision.supervisee_id
        WHERE hub_supervision.supervisor_id = ? AND hub_supervision.agency_id = ${c}.agency_id
          AND COALESCE(hub_supervisee.is_archived, 0) = 0
          AND UPPER(COALESCE(hub_supervisee.status, '')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','TERMINATED_PENDING','ARCHIVED','DELETED')
          AND (${c}.provider_id = hub_supervision.supervisee_id OR EXISTS (
            SELECT 1 FROM client_provider_assignments hub_supervised_assignment
            WHERE hub_supervised_assignment.client_id = ${c}.id AND hub_supervised_assignment.provider_user_id = hub_supervision.supervisee_id AND hub_supervised_assignment.is_active = 1))))`,
    params: [userId, userId, userId, userId, userId]
  };
}

export function hubContactScope(userId, alias = 'ac') {
  const clinical = hubClientScope(userId);
  return {
    sql: `((${alias}.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM clients c WHERE c.id = ${alias}.client_id AND c.agency_id = ${alias}.agency_id AND ${clinical.sql}))
      OR (${alias}.client_id IS NULL AND (${alias}.share_with_all = 1 OR ${alias}.created_by_user_id = ?
        OR EXISTS (SELECT 1 FROM contact_provider_assignments hub_contact_assignment WHERE hub_contact_assignment.contact_id = ${alias}.id AND hub_contact_assignment.provider_user_id = ?)
        OR ${agencyStaffScope(`${alias}.agency_id`)})))`,
    params: [...clinical.params, userId, userId, userId]
  };
}

export async function canAccessHubClient({userId, clientId, agencyId}) {
  const scope = hubClientScope(userId);
  const [rows] = await pool.execute(`SELECT c.id FROM clients c WHERE c.id = ? AND c.agency_id = ? AND ${scope.sql} LIMIT 1`, [clientId, agencyId, ...scope.params]);
  return !!rows?.length;
}

export async function canAccessHubContact({userId, contactId, agencyId}) {
  const scope = hubContactScope(userId);
  const [rows] = await pool.execute(`SELECT ac.id FROM agency_contacts ac WHERE ac.id = ? AND ac.agency_id = ? AND ac.is_active = 1 AND ${scope.sql} LIMIT 1`, [contactId, agencyId, ...scope.params]);
  return !!rows?.length;
}

export async function scopeHubPeople(people, userId) {
  let visible = people;
  const contactIds = [...new Set(people.map(p => Number(p.contactId)).filter(Boolean))];
  if (contactIds.length) {
    const scope = hubContactScope(userId);
    const [rows] = await pool.execute(`SELECT ac.id, ac.agency_id FROM agency_contacts ac WHERE ac.id IN (${contactIds.map(()=>'?').join(',')}) AND ac.is_active = 1 AND ${scope.sql}`, [...contactIds, ...scope.params]);
    const allowed = new Set(rows.map(r=>`${r.agency_id}:${r.id}`));
    visible = visible.filter(p=>!p.contactId || allowed.has(`${p.agencyId}:${p.contactId}`));
  }
  const clinical = visible.filter(p=>p.clientId || p.kinds?.some(k=>['client','guardian'].includes(k)));
  if (!clinical.length) return visible;
  const clientIds = [...new Set(clinical.map(p=>Number(p.clientId)).filter(Boolean))];
  const userIds = [...new Set(clinical.filter(p=>p.kinds?.some(k=>['client','guardian'].includes(k))).map(p=>Number(p.userId)).filter(Boolean))];
  if (!clientIds.length && !userIds.length) return visible.filter(p=>!clinical.includes(p));
  const selector = [], args = [];
  if (clientIds.length) { selector.push(`c.id IN (${clientIds.map(()=>'?').join(',')})`); args.push(...clientIds); }
  if (userIds.length) { selector.push(`cg.guardian_user_id IN (${userIds.map(()=>'?').join(',')})`); args.push(...userIds); }
  const scope = hubClientScope(userId);
  const [rows] = await pool.execute(`SELECT c.id, c.agency_id, c.full_name, c.initials, c.client_type, cs.status_key AS client_status_key, cg.guardian_user_id, cg.access_enabled,
      ${agencyStaffScope('c.agency_id',"'admin','support','staff'")} AS can_edit_email,
      (c.provider_id = ? OR EXISTS (SELECT 1 FROM client_provider_assignments own_assignment WHERE own_assignment.client_id = c.id AND own_assignment.provider_user_id = ? AND own_assignment.is_active = 1)) AS own_caseload,
      (SELECT GROUP_CONCAT(DISTINCT TRIM(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) SEPARATOR ', ')
       FROM supervisor_assignments sa JOIN users p ON p.id = sa.supervisee_id
       WHERE sa.supervisor_id = ? AND sa.agency_id = c.agency_id
         AND COALESCE(p.is_archived,0) = 0 AND UPPER(COALESCE(p.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','TERMINATED_PENDING','ARCHIVED','DELETED')
         AND (c.provider_id = p.id OR EXISTS (SELECT 1 FROM client_provider_assignments cpa WHERE cpa.client_id = c.id AND cpa.provider_user_id = p.id AND cpa.is_active = 1))) AS supervisee_names
    FROM clients c LEFT JOIN client_guardians cg ON cg.client_id = c.id
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cg.permissions_json, '$.relationshipRevoked')), 'false') <> 'true'
    LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
    WHERE (${selector.join(' OR ')}) AND ${scope.sql}`, [userId,userId,userId,userId,...args,...scope.params]);
  return visible.flatMap(p=>{
    if (!clinical.includes(p)) return [p];
    const matches = rows.filter(r=>Number(r.agency_id)===Number(p.agencyId) &&
      (p.kinds?.some(k=>['guardian','client'].includes(k)) && p.userId ? Number(r.guardian_user_id)===Number(p.userId) || (p.kinds?.includes('client') && Number(r.id)===Number(p.clientId)) : Number(r.id)===Number(p.clientId)));
    if (!matches.length) return [];
    const unique=[...new Map(matches.map(r=>[Number(r.id),r])).values()];
    const row=unique.find(r=>Number(r.id)===Number(p.clientId)) || unique[0];
    const labels=unique.map(r=>Number(r.own_caseload) ? 'Your client' : r.supervisee_names ? `Supervisee’s client — ${r.supervisee_names}` : 'Agency client');
    const accessLabel=[...new Set(labels)].join(' · ');
    const guardian=p.kinds?.includes('guardian');
    const relationship=guardian ? `Guardian of ${unique.map(r=>r.full_name || r.initials || `Client #${r.id}`).join(', ')}` : p.relationshipMeta;
    return [{...p,clientId:row.id,clientType:row.client_type || null,clientStatusKey:row.client_status_key || null,
      ...(guardian ? {portalAccess:!!row.access_enabled, guardianClientNames:unique.map(r=>r.full_name || r.initials || `Client #${r.id}`)}:{}),
      canEditClientEmail:p.personKey?.startsWith('client:') && Number(row.can_edit_email) === 1,
      accessLabel,relationshipMeta:[relationship,accessLabel].filter(Boolean).join(' · ')}];
  });
}

// Receiving/replying is separate from clinical directory access. A known sender
// in the viewer's own mail stays readable without exposing their client record.
export async function ownEmailCorrespondent(person, userId) {
  if (!person?.email || !userId) return null;
  const [rows] = await pool.execute(`SELECT c.id FROM communication_conversations c
    JOIN communication_messages m ON m.conversation_id = c.id
    WHERE c.agency_id = ? AND c.channel = 'email'
      AND EXISTS (SELECT 1 FROM communication_participants p WHERE p.conversation_id = c.id AND LOWER(p.email) = ?)
      AND (c.owner_user_id = ? OR m.author_user_id = ? OR EXISTS (
        SELECT 1 FROM communication_inboxes pi WHERE pi.id = c.inbox_id AND pi.kind = 'personal' AND pi.owner_user_id = ?))
      AND COALESCE(m.is_internal_note,0) = 0 AND COALESCE(m.send_status,'sent') NOT IN ('cancelled','failed')
    LIMIT 1`, [person.agencyId, String(person.email).toLowerCase(), userId,userId,userId]);
  if (!rows.length) return null;
  return {personKey:person.personKey,agencyId:person.agencyId,agencyName:person.agencyName,
    displayName:person.displayName,email:person.email,kinds:['external'],
    userId:null,clientId:null,contactId:null,portalAccess:false,
    relationshipMeta:'Email correspondent',directoryRestricted:true};
}
