import pool from '../config/database.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { isCompanyEventInvitee } from '../services/companyEventAudience.service.js';
import { staffPollsForRequest } from './companyEvents.controller.js';
import { pendingEventSplashes, splashLoginKey, filterLoginSplashes, recordSplashInteraction } from '../services/companyEventSplashes.service.js';

const validUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const loginKey = req => splashLoginKey(req.user, req.query?.visitId || req.body?.visitId || 'legacy-session');
async function eligible(req) {
  return pendingEventSplashes({userId:Number(req.user.id),polls:await staffPollsForRequest(req,{pendingOnly:true})});
}
export async function listMyEventAnnouncements(req,res,next) {
  try {
    if (!req.query?.visitId) return res.set('Cache-Control','no-store').json(await legacyScheduledAnnouncements(req.user.id));
    const items = await filterLoginSplashes(await eligible(req),Number(req.user.id),loginKey(req));
    res.set('Cache-Control','no-store');res.json(items);
  } catch(error) { next(error); }
}
export async function recordMyEventSplash(req,res,next) {
  try {
    const {itemId,displayId,action} = req.body || {};
    if (!validUuid(displayId) || typeof itemId !== 'string' || itemId.length > 160 || !['viewed','dismissed','opened','responded'].includes(action)) return res.status(400).json({error:{message:'Invalid splash interaction'}});
    const userId=Number(req.user.id),key=loginKey(req);
    let item;
    if (action==='viewed') {
      item=(await eligible(req)).find(item=>item.id===itemId);
      if (!item) return res.status(404).json({error:{message:'This poll or RSVP is no longer available'}});
    } else {
      const [[record]] = await pool.execute(`SELECT company_event_id,kind FROM company_event_splash_views
        WHERE user_id=? AND login_key=? AND item_key=? AND display_id=?`,[userId,key,itemId,displayId]);
      if (!record) return res.status(404).json({error:{message:'Splash view not found'}});
      item={id:itemId,eventId:Number(record.company_event_id),kind:record.kind};
      if (action==='responded') {
        const [[response]]=await pool.execute('SELECT id FROM company_event_responses WHERE company_event_id=? AND user_id=? LIMIT 1',[item.eventId,userId]);
        if (!response) return res.status(409).json({error:{message:'Save your response before recording it'}});
      }
    }
    await recordSplashInteraction({userId,loginKey:key,item,displayId,action});
    res.json({ok:true});
  } catch(error) { next(error); }
}

// Older mobile/browser clients still dismiss numeric notification IDs. Keep their
// response shape until they reload; never make an old client dismiss a poll ID.
async function legacyScheduledAnnouncements(userId) {
  const [rows]=await pool.execute(`SELECT n.id AS notification_id,n.audience_json,e.* FROM notifications n
    JOIN company_events e ON e.id=n.related_entity_id WHERE n.user_id=? AND n.type='company_event_message'
      AND n.is_read=0 AND e.is_active=1 AND JSON_UNQUOTE(JSON_EXTRACT(n.audience_json,'$.displayType'))='splash'
    ORDER BY n.created_at DESC LIMIT 30`,[userId]);
  const result=[],seen=new Set();
  for(const row of rows){
    const metadata=typeof row.audience_json==='string'?JSON.parse(row.audience_json):row.audience_json||{};
    const announcement=readEventOperations(row).dashboardAnnouncements.find(item=>String(item.id)===String(metadata.announcementId));
    if(!announcement||new Date(announcement.scheduledAt)>new Date()||new Date(announcement.endsAt)<=new Date())continue;
    const key=`${row.id}:${announcement.id}`;
    if(seen.has(key)||!await isCompanyEventInvitee({event:row,userId}))continue;
    seen.add(key);result.push({id:row.notification_id,title:row.title,message:announcement.content,url:metadata.navigationUrl});
  }
  return result;
}
