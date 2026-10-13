// Used again immediately before delivery, including emails released from approval.
export const reminderRecipientSql = `
 FROM provider_update_recipients r
 JOIN provider_update_pushes p ON p.id=r.push_id AND p.agency_id=r.agency_id
 JOIN provider_update_reminder_settings settings ON settings.push_id=p.id AND settings.enabled=1
 JOIN agencies a ON a.id=p.agency_id
 JOIN users u ON u.id=r.provider_user_id
 WHERE p.status='sent' AND p.title NOT LIKE '[PREVIEW]%'
 AND r.status IN ('not_started','in_progress') AND r.finalized_at IS NULL AND r.locked_at IS NULL
 AND r.expires_at>UTC_TIMESTAMP() AND LEFT(r.token,8)<>'preview_'
 AND COALESCE(r.is_demo_snapshot,0)=0 AND COALESCE(u.is_demo,0)=0
 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE'
 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
 AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=r.agency_id AND COALESCE(ua.is_active,1)=1)
 AND EXISTS (SELECT 1 FROM provider_update_sends s
   LEFT JOIN user_communications c ON c.id=s.communication_id AND c.user_id=r.provider_user_id AND c.agency_id=r.agency_id
   WHERE s.recipient_id=r.id AND s.push_id=r.push_id AND s.provider_user_id=r.provider_user_id
   AND (CASE WHEN c.delivery_status IN ('sent','delivered','failed','bounced','skipped') THEN c.delivery_status ELSE s.delivery_status END) IN ('sent','delivered'))`;

export function reminderDay(now, timezone='America/Denver', localHour=9) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  // A late-starting worker can catch up during the day, never overnight.
  return {date:`${parts.year}-${parts.month}-${parts.day}`,due:Number(parts.hour)>=Number(localHour)&&Number(parts.hour)<18};
}

const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function providerUpdateReminderMessage({firstName,link}) {
  const greeting=firstName?`Hi ${firstName},`:'Hello,';
  const intro='Your Provider Update is still waiting to be completed. Your saved progress is ready when you return.';
  const finish='Please review any unfinished sections, then finish and submit your update from the overview. You can save and return using this same link.';
  const help='Need help? Reply to People Operations or use Need help in your update. Daily reminders stop once your update is submitted.';
  return {subject:'Reminder: please complete your Provider Update',text:`${greeting}\n\n${intro}\n\nContinue my Provider Update: ${link}\n\n${finish}\n\n${help}`,
    html:`<div style="font:16px/1.6 Arial,sans-serif;color:#244439;max-width:600px;margin:auto;padding:24px"><h1 style="font-size:24px">Please complete your Provider Update</h1><p>${escape(greeting)}</p><p>${intro}</p><p><a href="${escape(link)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#3e6d54;color:#fff;text-decoration:none;font-weight:bold">Continue my Provider Update →</a></p><p>${finish}</p><p>${help}</p><p style="font-size:13px;overflow-wrap:anywhere">Your return link: <a href="${escape(link)}">${escape(link)}</a></p></div>`};
}
