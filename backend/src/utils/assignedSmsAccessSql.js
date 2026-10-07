// Three bound parameters, all the current user ID. The message alias is fixed.
// A legacy provider is used only when the client has no active assignment rows.
export const assignedSmsAccessSql = `EXISTS (
  SELECT 1 FROM clients care_client
  JOIN user_agencies care_member ON care_member.agency_id = care_client.agency_id
    AND care_member.user_id = ? AND care_member.is_active = TRUE
  JOIN users care_user ON care_user.id = care_member.user_id
    AND care_user.is_active = TRUE AND care_user.terminated_at IS NULL
    AND COALESCE(care_user.is_archived, 0) = 0
    AND care_user.status NOT IN ('TERMINATED', 'TERMINATED_PENDING', 'ARCHIVED', 'INACTIVE_EMPLOYEE')
  WHERE care_client.id = ml.client_id AND care_client.agency_id = ml.agency_id
    AND (EXISTS (SELECT 1 FROM client_provider_assignments care_assignment
      WHERE care_assignment.client_id = care_client.id
        AND care_assignment.provider_user_id = ? AND care_assignment.is_active = TRUE)
      OR (care_client.provider_id = ? AND NOT EXISTS (
        SELECT 1 FROM client_provider_assignments any_assignment
        WHERE any_assignment.client_id = care_client.id AND any_assignment.is_active = TRUE)))
)`;

export const assignedSmsConversationSql = `(c.channel = 'sms' AND EXISTS (
  SELECT 1 FROM message_logs ml WHERE ml.agency_id = c.agency_id
    AND ml.sms_thread_key = c.external_thread_id AND ${assignedSmsAccessSql}
))`;
