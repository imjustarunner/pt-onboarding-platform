/** Staff deliberately available on mobile can receive push without foreground heartbeats.
 * A revoked/expired device or disabled notification destination never advertises reachability. */
export function backgroundChatDeviceSql(staff='c') {
 return `EXISTS(SELECT 1 FROM mobile_device_sessions md WHERE md.id=${staff}.mobile_device_session_id
  AND md.user_id=${staff}.user_id AND md.revoked_at IS NULL AND md.push_enabled=1
  AND (NULLIF(md.push_token,'') IS NOT NULL OR md.web_push_subscription IS NOT NULL)
  AND COALESCE(FROM_UNIXTIME(JSON_UNQUOTE(JSON_EXTRACT(md.primary_authentication_json,'$.issuedAt'))),md.enrolled_at)>UTC_TIMESTAMP()-INTERVAL 30 DAY)`;
}
export function availableChatStaffSql(staff='c',presence='p') {
 return `((${staff}.last_seen_at>UTC_TIMESTAMP()-INTERVAL 75 SECOND AND ${presence}.last_heartbeat_at>UTC_TIMESTAMP()-INTERVAL 90 SECOND)
  OR ${backgroundChatDeviceSql(staff)})`;
}
export function visitorChatAvailable(session,now=Date.now()) {
 const seen=new Date(session.last_seen_at ?? session.lastSeen).getTime(),expires=new Date(session.expires_at ?? session.expiresAt).getTime();
 return !session.visitor_left_at&&!session.leftAt&&!session.visitor_ended_at&&!session.endedAt&&Number.isFinite(expires)&&expires>now&&Number.isFinite(seen)&&seen>now-40000;
}
