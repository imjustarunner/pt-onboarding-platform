import {plotlineFailure} from './plotlineSelfService.service.js';
const deny=()=>plotlineFailure(403,'PLOTLINE_PRODUCT_BOUNDARY','This company can manage its own job application forms, not clinical or another company’s forms.');
export async function assertPlotlineHiringResources(req,agencyId,path,db) {
  const read=['GET','HEAD','OPTIONS'].includes(req.method);
  req.query ||= {};
  const catalog=path.match(/^\/api\/(onboarding-packages|document-templates)\/?$/);
  if(catalog){
    if(!read)throw deny();
    req.plotlineHiringAgencyId=agencyId;
    req.query.agencyId=String(agencyId);
    return;
  }
  if(!path.startsWith('/api/intake-links'))return;
  req.plotlineHiringAgencyId=agencyId;
  if(req.query.companyEventId || req.query.programId || req.query.learningClassId)throw deny();
  const fromJob=path.match(/^\/api\/intake-links\/from-job\/(\d+)\/?$/);
  const byId=path.match(/^\/api\/intake-links\/(\d+)\/?$/);
  if(fromJob){
    const [[job]]=await db.execute('SELECT agency_id FROM hiring_job_descriptions WHERE id=?',[Number(fromJob[1])]);
    if(!job || Number(job.agency_id)!==agencyId)throw deny();
  }else if(byId){
    const [[form]]=await db.execute('SELECT form_type,scope_type,organization_id FROM intake_links WHERE id=?',[Number(byId[1])]);
    if(!form || form.form_type!=='job_application' || form.scope_type!=='agency' || Number(form.organization_id)!==agencyId)throw deny();
  }else if(!/^\/api\/intake-links\/?$/.test(path))throw deny();
  if(read)return;
  const body=req.body || (req.body={});
  // Translation/duplication is outside the job-create recovery path. Do not
  // permit a job form to link a different company's private or clinical form.
  if(body.linkedEsFormId || body.documentTranslationMap || path.endsWith('/duplicate') || path.endsWith('/linked-translation'))throw deny();
  if(!fromJob && !byId && body.formType!=='job_application')throw deny();
  if((body.formType && body.formType!=='job_application') || (body.scopeType && body.scopeType!=='agency')
    || (body.organizationId!=null && Number(body.organizationId)!==agencyId)
    || [body.createClient,body.createGuardian].some(value=>value===true || value===1 || value==='1' || value==='true')
    || body.companyEventId || body.programId || body.learningClassId)throw deny();
  if(body.jobDescriptionId){
    const [[job]]=await db.execute('SELECT agency_id FROM hiring_job_descriptions WHERE id=?',[Number(body.jobDescriptionId)]);
    if(!job || Number(job.agency_id)!==agencyId)throw deny();
  }
  if(body.allowedDocumentTemplateIds){
    const ids=typeof body.allowedDocumentTemplateIds==='string'?JSON.parse(body.allowedDocumentTemplateIds):body.allowedDocumentTemplateIds;
    if(!Array.isArray(ids))throw deny();
    for(const id of ids){
      const [[template]]=await db.execute('SELECT agency_id,is_user_specific FROM document_templates WHERE id=?',[Number(id)]);
      if(!template || Number(template.agency_id)!==agencyId || Number(template.is_user_specific))throw deny();
    }
  }
  body.formType='job_application';body.scopeType='agency';body.organizationId=agencyId;body.createClient=false;body.createGuardian=false;
}
