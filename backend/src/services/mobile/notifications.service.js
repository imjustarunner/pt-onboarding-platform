import pool from '../../config/database.js';
import {failure} from './policy.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {mobileAgencyIcon} from './agencyBrand.service.js';
import {presentMobileNotification} from './notificationPresentation.service.js';
import {listEffectiveNotificationPreferences} from '../notificationPreferences.service.js';

/** Personal inbox across fresh authorized memberships; never a managed/team feed. */
export function createMobileNotificationHandler({unlock,controllers,database=pool,agencies=listMobileAgencies,preferences=listEffectiveNotificationPreferences}) {
 return async function mobileNotifications(req,res,next){
  const context=await unlock(req);
  if(context.surface==='family')throw failure(403,'MOBILE_TARGET_UNAVAILABLE','Staff notifications are unavailable in the family portal.');
  req.user=context.user;
  const {agencies:available}=await agencies(context.user),ids=available.map(a=>Number(a.id));
  req.mobileNotificationAgencyIds=ids;
  const query=req.query || {},requested=query.agencyId && query.agencyId!=='all'?Number(query.agencyId):null;
  if(query.agencyId && query.agencyId!=='all' && (!Number.isSafeInteger(requested)||!ids.includes(requested)))throw failure(403,'MOBILE_TARGET_UNAVAILABLE','This agency is unavailable.');
  const settings=req.path.startsWith('/notification-settings'),settingsAgency=requested || Number(context.workspace?.id);
  if(settings && !ids.includes(settingsAgency))throw failure(403,'MOBILE_WORKSPACE_UNAVAILABLE','Choose a current workspace.');
  req.query={scope:'inbox',status:['all','unread','read','dismissed','snoozed'].includes(query.status)?query.status:'unread',page:String(Math.max(1,Math.min(10000,Number(query.page)||1))),pageSize:'25',sort:['newest','oldest','priority'].includes(query.sort)?query.sort:'newest',...(requested?{agencyId:String(requested)}:{}),...(settings?{agencyId:String(settingsAgency)}:{})};
  if(typeof query.search==='string')req.query.search=query.search.slice(0,200);
  const handlers=controllers || await import('../../controllers/notification.controller.js');
  if(req.params.id){
   const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This notification is unavailable.');
   const [[row]]=await database.execute('SELECT agency_id FROM notifications WHERE id=?',[id]);
   if(!row || !ids.includes(Number(row.agency_id)))throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This notification is unavailable.');
   const until=req.body?.snoozedUntil;
   req.body=Object.fromEntries(['read','dismissed'].filter(key=>typeof req.body?.[key]==='boolean').map(key=>[key,req.body[key]]));
   // Snooze is viewer state, never a change to the underlying task or clinical event.
   if(until!==undefined)req.body.snoozedUntil=until;
   return handlers.updateNotificationState(req,res,next);
  }
  if(req.params.type){
   const entries=await preferences({userId:context.user.id,userRole:context.user.role,agencyId:settingsAgency,user:context.user});
   const entry=entries.find(item=>item.type===req.params.type);
   if(entry?.locked)throw failure(403,'MOBILE_PREFERENCE_MANAGED',entry.lockReason || 'This notification preference is managed by the agency.');
   const deliveryMode=req.body?.deliveryMode;
   req.body=Object.fromEntries(['inApp'].filter(key=>typeof req.body?.[key]==='boolean').map(key=>[key,req.body[key]]));
   if(req.params.type==='school_closure_notice' && typeof deliveryMode==='string')req.body={deliveryMode};
   if(!Object.keys(req.body).length)throw failure(400,'MOBILE_REQUEST_INVALID','Choose whether this alert appears in the app.');
   return handlers.updateNotificationTypePreference(req,res,next);
  }
  if(req.path==='/notification-count')return handlers.getNotificationCounts(req,res,next);
  if(settings)return handlers.getNotificationCatalog(req,res,next);
  const json=res.json.bind(res);res.json=data=>json({...data,items:(data.items || []).map(item=>presentMobileNotification(item,available)),agencies:available.map(a=>({id:Number(a.id),name:a.name,logoUrl:mobileAgencyIcon(a)}))});
  return handlers.getNotificationFeed(req,res,next);
 };
}
