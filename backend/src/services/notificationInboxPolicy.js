export function notificationInboxVisibilitySql(alias = 'n') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Invalid notification alias');
  return `(${alias}.type<>'new_packet_uploaded' AND ${alias}.type<>'school_group_email_received'
    AND NOT EXISTS (SELECT 1 FROM clients nd WHERE ${alias}.related_entity_type='client'
      AND nd.id=${alias}.related_entity_id AND nd.agency_id=${alias}.agency_id AND COALESCE(nd.created_via_dev_fill,0)=1)
    AND NOT EXISTS (SELECT 1 FROM user_communications ne WHERE ne.agency_id=${alias}.agency_id
      AND ${alias}.related_entity_type='client' AND ne.client_id=${alias}.related_entity_id
      AND (ne.template_type=${alias}.type OR (${alias}.type='client_assigned' AND ne.template_type='school_client_status_update'))
      AND ne.delivery_status IN ('sent','delivered') AND ne.sent_at>=${alias}.created_at-INTERVAL 5 MINUTE
      AND (${alias}.user_id IS NULL OR ne.user_id=${alias}.user_id)))`;
}
