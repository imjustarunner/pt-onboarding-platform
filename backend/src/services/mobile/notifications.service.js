import pool from '../../config/database.js';
import {failure} from './policy.js';

/** Reuse the staff notification handlers with the current device actor and practice.
 * Neither a URL user ID nor managed/team scope can expand a device session. */
export function createMobileNotificationHandler({unlock,controllers,database=pool}) {
  return async function mobileNotifications(req,res,next){
    const context=await unlock(req);
    if(context.surface==='family')throw failure(403,'MOBILE_TARGET_UNAVAILABLE','Staff notifications are unavailable in the family portal.');
    req.user=context.user;
    const agencyId=Number(context.workspace?.id);
    if(!agencyId)throw failure(403,'MOBILE_WORKSPACE_UNAVAILABLE','Choose a current workspace.');
    const handlers=controllers || await import('../../controllers/notification.controller.js');
    const requestQuery=req.query || {};
    req.query={agencyId:String(agencyId),scope:'inbox',status:['all','unread','read','dismissed'].includes(requestQuery.status)?requestQuery.status:'unread',page:String(Math.max(1,Math.min(10000,Number(requestQuery.page)||1))),pageSize:'25'};
    if(req.params.id){
      const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This notification is unavailable.');
      const [[row]]=await database.execute('SELECT agency_id FROM notifications WHERE id=?',[id]);
      if(!row || Number(row.agency_id)!==agencyId)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This notification is unavailable in this workspace.');
      req.body=Object.fromEntries(['read','dismissed'].filter(key=>typeof req.body?.[key]==='boolean').map(key=>[key,req.body[key]]));
      return handlers.updateNotificationState(req,res,next);
    }
    if(req.params.type){
      req.body=Object.fromEntries(['inApp'].filter(key=>typeof req.body?.[key]==='boolean').map(key=>[key,req.body[key]]));
      if(!Object.keys(req.body).length)throw failure(400,'MOBILE_REQUEST_INVALID','Choose whether this alert appears in the app.');
      return handlers.updateNotificationTypePreference(req,res,next);
    }
    return req.path.startsWith('/notification-settings')?handlers.getNotificationCatalog(req,res,next):handlers.getNotificationFeed(req,res,next);
  };
}
