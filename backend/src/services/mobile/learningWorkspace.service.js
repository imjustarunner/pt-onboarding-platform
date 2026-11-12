import {mobileSessions} from './session.service.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {readAgencyAccess} from '../agencyAccessProfiles.service.js';
import {applyAgencyAccess} from '../../utils/agencyAccessPolicy.js';
import {runWithAgencyAccess} from '../../utils/agencyAccessContext.js';
import {tutoringWorkspace} from '../tutoringWorkspace.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createMobileLearningWorkspace({sessions=mobileSessions,agencies=listMobileAgencies,agencyAccess=readAgencyAccess,apply=applyAgencyAccess,scope=runWithAgencyAccess,workspace=tutoringWorkspace,overview=null}={}){
 async function actor(req){
  const qv=req.quickView;if(!qv?.mobileDeviceSessionId)throw fail(403,'Sign in with your own mobile account.');
  const current=await sessions.access(qv.mobileDeviceSessionId,qv.userId,qv.agencyId,qv.credentialVersion??null);
  if(current.surface==='family')throw fail(403,'Use your family portal for shared learning records.');
  const id=Number(req.body?.agencyId||req.query?.agencyId||qv.agencyId);
  if(!Number.isSafeInteger(id)||id<=0)throw fail(400,'Choose an agency.');
  const available=await agencies(current.user);
  if(!available.agencies.some(agency=>Number(agency.id)===id)||qv.qaAgencyIds&&!qv.qaAgencyIds.includes(id))throw fail(403,'This agency is not available to your mobile account.');
  const profile=await agencyAccess(current.user.id,id);
  if(!profile)throw fail(403,'Your agency access could not be verified.');
  return {user:apply(current.user,profile),agencyId:id,profile};
 }
 return Object.assign(async(req,res,next)=>{res.set('Cache-Control','no-store');try{
  const context=await actor(req);req.user=context.user;
  return await scope(context.agencyId,async()=>{
   if(req.mobileLearningOperation==='overview'){
    const handler=overview||(await import('../../controllers/tutoringLearningOs.controller.js')).getOverview;
    const learning=await workspace.context(context.user,context.agencyId);
    if(!learning.canTutor)throw fail(403,'Tutoring is not enabled for this account.');
    req.query={...req.query,agencyId:context.agencyId};return handler(req,res,next);
   }
   const operation=req.mobileLearningOperation;
   if(!['context','profile','save','students'].includes(operation))throw fail(404,'This learning action is unavailable.');
   res.json(await workspace[operation](context.user,context.agencyId,req.body));
  },{userId:context.user.id,access:context.profile});
 }catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}}, {actor});
}
export const mobileLearningWorkspace=createMobileLearningWorkspace();
