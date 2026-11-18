import pool from '../config/database.js';
import { staffPollsForRequest } from './companyEvents.controller.js';
import { pendingEventSplashes, splashLoginKey, filterLoginSplashes, recordSplashInteraction } from '../services/companyEventSplashes.service.js';

const validUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const loginKey = req => splashLoginKey(req.user, req.query?.visitId || req.body?.visitId || 'legacy-session');
async function eligible(req) {
  return pendingEventSplashes({userId:Number(req.user.id),polls:await staffPollsForRequest(req,{pendingOnly:true})});
}
export async function listMyEventAnnouncements(req,res,next) {
  try {
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
