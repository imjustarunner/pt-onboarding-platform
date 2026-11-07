import pool from '../../config/database.js';
import {isQaPreviewIdentity} from '../auricwellPreviewPolicy.js';

export const mobileQaScopeError=()=>Object.assign(new Error('This action is outside the approved synthetic mobile messaging workspace.'),{status:403,code:'MOBILE_QA_SCOPE_REQUIRED'});
export function mobileQaAgencyId(req){
 const ids=req.quickView?.qaAgencyIds;if(ids==null)return null;
 if(!Array.isArray(ids)||ids.length!==1||Number(ids[0])!==450||(req.quickView.agencyId!=null&&Number(req.quickView.agencyId)!==450))throw mobileQaScopeError();return 450;
}
export function qaConversaRouteAllowed(method,path){
 if(method==='GET')return /^(?:\/messages\/inbox|\/messages\/preferences|\/directory|\/chat\/threads|\/chat\/inbox\/(?:threads|mentions|files)|\/chat\/threads\/\d+\/messages|\/messages\/chat\/\d+|\/messages\/files\/\d+|\/conversations\/\d+(?:\/attachments\/\d+|\/messages\/\d+\/delivery)?)$/.test(path);
 if(method==='PATCH')return /^(?:\/messages\/preferences|\/messages\/(?:chat|email|sms)\/\d+\/(?:archive|state)|\/conversations\/\d+)$/.test(path);
 return method==='POST'&&/^(?:\/chat\/direct|\/chat\/threads\/\d+\/(?:messages|read)|\/messages\/chat\/\d+\/viewed)$/.test(path);
}
export function assertMobileQaConversation(req,conversation){const agencyId=mobileQaAgencyId(req);if(agencyId&&Number(conversation?.agency_id)!==agencyId)throw mobileQaScopeError();return conversation;}
export async function assertMobileQaThread(req,threadId,{writing=false,db=pool}={}){
 const agencyId=mobileQaAgencyId(req);if(!agencyId)return;
 if(!Number.isSafeInteger(Number(threadId))||Number(threadId)<=0)throw mobileQaScopeError();
 const [rows]=await db.execute('SELECT t.id,t.agency_id,t.message_channel,t.client_id,c.agency_id AS client_agency_id FROM chat_threads t LEFT JOIN clients c ON c.id=t.client_id WHERE t.id=? LIMIT 1',[threadId]);
 const thread=rows[0];if(!thread||Number(thread.agency_id)!==agencyId||(thread.client_id&&Number(thread.client_agency_id)!==agencyId))throw mobileQaScopeError();
 if(!writing)return;
 if(thread.message_channel!=='internal')throw mobileQaScopeError();
 const [participants]=await db.execute(`SELECT u.id,u.email,u.role,u.is_demo,u.is_active,u.is_archived,ua.user_id AS member_id FROM chat_thread_participants p JOIN users u ON u.id=p.user_id LEFT JOIN user_agencies ua ON ua.user_id=p.user_id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 WHERE p.thread_id=?`,[agencyId,threadId]);
 if(!participants.length||participants.some(user=>!isQaPreviewIdentity(user)||!user.member_id||Number(user.is_active)!==1||Number(user.is_archived)===1))throw mobileQaScopeError();
 if(req.body?.attachments?.length||req.body?.clientId||req.body?.client_id)throw mobileQaScopeError();
}
export async function assertMobileQaRecipient(req,userId,{db=pool}={}){
 const agencyId=mobileQaAgencyId(req);if(!agencyId)return;
 if(!Number.isSafeInteger(Number(userId))||Number(userId)<=0)throw mobileQaScopeError();
 const [rows]=await db.execute('SELECT u.id,u.email,u.role,u.is_demo,u.is_active,u.is_archived FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 WHERE u.id=? LIMIT 1',[agencyId,userId]);
 const user=rows[0];if(!isQaPreviewIdentity(user)||Number(user?.is_active)!==1||Number(user?.is_archived)===1)throw mobileQaScopeError();
}
