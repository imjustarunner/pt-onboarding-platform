import Task from '../../models/Task.model.js';
import User from '../../models/User.model.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {getMobileDocumentationQueue} from './documentationQueue.service.js';

export const isOpenDocumentation=item=>item.queueKind==='cosign' || item.status==='awaiting_cosign' || item.status!=='signed';

export function createWorkspaceCounts({work=getMobileDocumentationQueue,findUser=id=>User.findById(id,{raw:true}),agencies=listMobileAgencies,countTasks=(id,options)=>Task.findByUser(id,options)}={}) {
 return async request=>{
  const user=await findUser(request.quickView.userId);
  if(!user || [0,false,'0'].includes(user.is_active))throw Object.assign(new Error('Your account is no longer active.'),{status:403});
  const {agencies:memberships}=await agencies(user);
  const ids=memberships.map(agency=>Number(agency.id)).filter(id=>!request.quickView.qaAgencyIds || request.quickView.qaAgencyIds.map(Number).includes(id));
  const [documentation,tasks]=await Promise.allSettled([work(request),countTasks(user.id,{view:'assigned',countOpen:true,authorizedAgencyIds:ids})]);
  return {mywork:documentation.status==='fulfilled' && !documentation.value.failures?.length?documentation.value.items.filter(item=>ids.includes(Number(item.agencyId)) && isOpenDocumentation(item)).length:null,
   tasks:tasks.status==='fulfilled'?tasks.value:null};
 };
}
export const getWorkspaceCounts=createWorkspaceCounts();
