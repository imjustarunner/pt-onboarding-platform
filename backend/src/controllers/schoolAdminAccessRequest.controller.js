import {schoolAdminRequestStatus,requestSchoolAdminAccess,reviewSchoolAdminAccess} from '../services/schoolAdminAccessRequest.service.js';
const input=req=>({schoolId:req.params.organizationId,actorUserId:req.user.id});
export async function getSchoolAdminRequests(req,res,next){try{res.set('Cache-Control','private, no-store');res.json(await schoolAdminRequestStatus(input(req)));}catch(e){next(e);}}
export async function createSchoolAdminRequest(req,res,next){try{res.status(201).json(await requestSchoolAdminAccess(input(req)));}catch(e){next(e);}}
export async function decideSchoolAdminRequest(req,res,next){try{res.json(await reviewSchoolAdminAccess({...input(req),requestId:req.params.requestId,decision:req.body?.decision,note:req.body?.note}));}catch(e){next(e);}}
