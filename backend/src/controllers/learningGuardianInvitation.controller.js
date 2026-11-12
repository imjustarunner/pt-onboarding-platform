import {listLearningGuardianInvitations,createLearningGuardianInvitation} from '../services/learningGuardianInvitations.service.js';

function scope(req) {
  if(req.guardianPreviewMode||!['client_guardian','guardian'].includes(req.user?.role))throw Object.assign(new Error('Sign in as the authorized guardian to manage this student’s invitations.'),{status:403});
  return {userId:Number(req.user.id),clientId:Number(req.params.clientId),agencyId:Number(req.query.agencyId||req.body?.agencyId)};
}
export async function list(req,res,next) {
  try{res.set('Cache-Control','no-store').json(await listLearningGuardianInvitations(scope(req)));}catch(error){next(error);}
}
export async function create(req,res,next) {
  try{const result=await createLearningGuardianInvitation({...scope(req),input:req.body});res.set('Cache-Control','no-store').status(result.reused?200:201).json(result);}catch(error){next(error);}
}
