import { readEventOperations } from '../utils/companyEventOperations.js';
import pool from '../config/database.js';
import { isCompanyEventInvitee } from '../services/companyEventAudience.service.js';

export async function listMyEventAnnouncements(req,res,next) {
  try {
    const [notifications]=await pool.execute(`SELECT n.id AS notification_id,n.title AS notification_title,n.message,n.audience_json,e.*
      FROM notifications n JOIN company_events e ON e.id=n.related_entity_id
      WHERE n.user_id=? AND n.type='company_event_message' AND n.is_read=0 AND e.is_active=1
        AND JSON_UNQUOTE(JSON_EXTRACT(n.audience_json,'$.displayType'))='splash'
      ORDER BY n.created_at DESC LIMIT 30`,[req.user.id]);
    const items=[], seen=new Set();
    for(const row of notifications){
      const meta=typeof row.audience_json==='string'?JSON.parse(row.audience_json):row.audience_json || {};
      const announcement=readEventOperations(row).dashboardAnnouncements.find(item=>String(item.id)===String(meta.announcementId));
      if(!announcement || new Date(announcement.scheduledAt).getTime()>Date.now() || (announcement.endsAt && new Date(announcement.endsAt).getTime()<=Date.now()))continue;
      const key=`${row.id}:${announcement.id}:${announcement.scheduledAt}`;if(seen.has(key))continue;
      if(!await isCompanyEventInvitee({event:row,userId:req.user.id}))continue;
      seen.add(key);items.push({id:row.notification_id,title:row.title,message:announcement.content,url:meta.navigationUrl});
    }
    res.set('Cache-Control','no-store');res.json(items);
  }catch(error){next(error);}
}
