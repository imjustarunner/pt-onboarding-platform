import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
const staffRoles = new Set(['admin','super_admin','support','staff','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','schedule_manager','facilitator','tutor']);
const norm = value => String(value || '').trim().toLowerCase();
export function closureDashboardItems(events, schools, now = new Date()) {
  return events.flatMap(event => {
    const startsAt = utcMysqlToIso(event.starts_at), endsAt = utcMysqlToIso(event.ends_at);
    if (!Number(event.is_active) || !['scheduled','rescheduled'].includes(event.school_event_status)
      || !['school_holiday','school_day_off','school_sessions_prohibited'].includes(event.event_type)
      || !(new Date(startsAt) <= now && now < new Date(endsAt))) return [];
    const targets = schools.filter(school => Number(school.agency_id) === Number(event.agency_id)
      && (event.organization_id == null ? !!norm(event.district_name) && norm(school.district_name) === norm(event.district_name)
        : Number(school.id) === Number(event.organization_id)));
    if (!targets.length) return [];
    const revision = createHash('sha256').update(JSON.stringify([event.id,event.agency_id,event.organization_id,event.district_name,event.event_type,event.title,event.description,startsAt,endsAt])).digest('hex');
    return [{ eventId:Number(event.id), agencyId:Number(event.agency_id), revision, title:event.title,
      reason:event.description || null, district:event.district_name || targets[0].district_name || 'District not recorded',
      scope:event.organization_id == null ? 'district' : 'school', timeZone:event.timezone || 'America/Denver', startsAt, endsAt,
      schools:targets.map(school=>({id:Number(school.id),name:school.name})), splashDismissed:false }];
  });
}
export async function mySchoolClosureDashboard({user,agencyId=null,now=new Date(),db=pool}) {
  if (!staffRoles.has(user.role) && !user.has_provider_access) return [];
  const [schools] = await db.execute(`SELECT DISTINCT s.id,s.name,oa.agency_id,sp.district_name FROM agencies s
    JOIN organization_affiliations oa ON oa.organization_id=s.id AND oa.is_active=1
    JOIN agencies parent ON parent.id=oa.agency_id AND parent.is_active=1 AND COALESCE(parent.is_archived,0)=0
    JOIN user_agencies parent_member ON parent_member.agency_id=parent.id AND parent_member.user_id=? AND COALESCE(parent_member.is_active,1)=1
    LEFT JOIN school_profiles sp ON sp.school_organization_id=s.id
    WHERE s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
      AND (? IS NULL OR oa.agency_id=? OR s.id=?)
      AND (EXISTS(SELECT 1 FROM provider_school_assignments psa WHERE psa.provider_user_id=? AND psa.school_organization_id=s.id AND psa.is_active=1)
        OR EXISTS(SELECT 1 FROM user_agencies member WHERE member.user_id=? AND member.agency_id=s.id AND COALESCE(member.is_active,1)=1))`,
    [user.id,agencyId,agencyId,agencyId,user.id,user.id]);
  const agencies = [...new Set(schools.map(school=>Number(school.agency_id)))];
  if (!agencies.length) return [];
  const [events] = await db.execute(`SELECT * FROM company_events WHERE agency_id IN (${agencies.map(()=>'?').join(',')})
    AND is_active=1 AND school_event_status IN ('scheduled','rescheduled')
    AND event_type IN ('school_holiday','school_day_off','school_sessions_prohibited') AND starts_at<=? AND ends_at>?`, [...agencies,now,now]);
  const items = closureDashboardItems(events,schools,now);
  if (!items.length) return [];
  const [dismissals] = await db.execute('SELECT event_id,event_revision FROM school_closure_dashboard_dismissals WHERE user_id=?',[user.id]);
  const [preferences] = await db.execute("SELECT delivery_mode FROM user_notification_type_preferences WHERE user_id=? AND notification_type='school_closure_notice'",[user.id]);
  const suppressSplash = preferences[0]?.delivery_mode === 'none';
  return items.map(item=>({...item,splashDismissed:suppressSplash || dismissals.some(row=>Number(row.event_id)===item.eventId&&row.event_revision===item.revision)}));
}
export async function dismissMySchoolClosure({user,eventId,revision,db=pool,now=new Date()}) {
  const items = await mySchoolClosureDashboard({user,db,now});
  const item = items.find(item=>item.eventId===Number(eventId)&&item.revision===revision);
  if (!item) throw Object.assign(new Error('This active closure is not assigned to your account or has changed'),{status:404});
  await db.execute(`INSERT INTO school_closure_dashboard_dismissals (user_id,event_id,event_revision) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE dismissed_at=CURRENT_TIMESTAMP`,[user.id,item.eventId,item.revision]);
  return {dismissed:true};
}
