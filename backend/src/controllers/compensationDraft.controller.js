import {assertAgencyAdmin} from '../services/providerUpdate.service.js';
import * as drafts from '../services/compensationDraft.service.js';

async function requireCompensationAdmin(user,agencyId){
 if(!['admin','super_admin','superadmin'].includes(String(user?.role||'').toLowerCase()))throw Object.assign(new Error('Administrator access required for compensation drafts.'),{status:403});
 return assertAgencyAdmin(user,agencyId);
}

export const list=async(req,res,next)=>{try{const aid=await requireCompensationAdmin(req.user,req.query.agencyId);res.set('Cache-Control','no-store');res.json({drafts:await drafts.listCompensationDrafts(aid)});}catch(e){next(e);}};
export const get=async(req,res,next)=>{try{const aid=await requireCompensationAdmin(req.user,req.query.agencyId);res.set('Cache-Control','no-store');res.json(await drafts.getCompensationDraft(aid,Number(req.params.draftId)));}catch(e){next(e);}};
export const save=async(req,res,next)=>{try{const aid=await requireCompensationAdmin(req.user,req.body.agencyId);res.set('Cache-Control','no-store');res.json(await drafts.saveCompensationDraft(aid,Number(req.params.draftId),req.body,req.user.id));}catch(e){next(e);}};
export const release=async(req,res,next)=>{try{const aid=await requireCompensationAdmin(req.user,req.body.agencyId);res.set('Cache-Control','no-store');res.json(await drafts.releaseCompensationDraft(aid,Number(req.params.draftId),req.body,req.user.id));}catch(e){next(e);}};
