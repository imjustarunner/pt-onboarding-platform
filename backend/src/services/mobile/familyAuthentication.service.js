import User from '../../models/User.model.js';
import {touchSession} from '../quickViewAuth.service.js';
import {mobileSessions,parsePrimaryAuthentication} from './session.service.js';
import {mobileFamilyRouteAllowed,FAMILY_ROLES} from './familyScope.service.js';
import {failure} from './policy.js';
export async function mobileFamilyPrincipal(req,{touch=touchSession,sessions=mobileSessions,findUser=id=>User.findById(id,{raw:true})}={}){
 const session=await touch(req.get('X-Quick-View-Session'));
 if(!session?.mobileDeviceSessionId || session.mobileSurface!=='family')throw failure(401,'MOBILE_FAMILY_REQUIRED','Unlock your family portal to continue.');
 if(!mobileFamilyRouteAllowed(req.method,req.originalUrl || req.path,session.userId))throw failure(403,'MOBILE_FAMILY_ONLY','This device opens your family portal only.');
 const user=await findUser(session.userId);
 if(!FAMILY_ROLES.has(String(user?.role)))throw failure(403,'MOBILE_FAMILY_UNAVAILABLE','Family portal access is no longer available.');
 const context=await sessions.access(session.mobileDeviceSessionId,session.userId,session.agencyId);
 const proof=parsePrimaryAuthentication(context.device.primary_authentication_json);
 return {user:{...user,role:user.role==='guardian'?'client_guardian':user.role,sessionId:`mobile:${session.sessionId}`,sessionCommentAgencyId:session.agencyId},
  authClaims:{id:user.id,role:user.role==='guardian'?'client_guardian':user.role,sessionId:`mobile:${session.sessionId}`,mobileFamily:true,authMethod:proof?.authMethod},
  ...(proof?{sessionSecurity:{key:proof.sessionKey}}:{})};
}
