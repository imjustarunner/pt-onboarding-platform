import {listContactDocumentation,contactDocumentationDetail,saveContactDocumentation} from '../services/contactDocumentation.service.js';
const run=fn=>async(req,res)=>{
  try{
    const agencyId=Number(req.auricwellPreview?.agencyId || req.query.agencyId || req.body?.agencyId);
    if(!Number.isSafeInteger(agencyId)||agencyId<1)return res.status(400).json({error:{message:'Select an agency.'}});
    res.set('Cache-Control','no-store');
    return res.json(await fn(req,agencyId));
  }catch(e){console.warn('[Contact documentation]',e.code || e.status || 'failed');return res.status(e.status || 500).json({error:{message:e.status?e.message:'Unable to load or save contact documentation. Please retry.'}});}
};
export const list=run(async(req,a)=>({items:await listContactDocumentation(req.user.id,a)}));
export const detail=run((req,a)=>contactDocumentationDetail(req.user.id,a,req.params.type,Number(req.params.id)));
export const save=run((req,a)=>saveContactDocumentation(req.user.id,a,req.params.type,Number(req.params.id),req.body));
