import {resolveClientRecordAccess} from '../services/clientRecordAccess.service.js';
import {clientAgencyMembership} from '../services/clientServiceEnrollment.service.js';

export async function requireOverviewAccess(user, clientId, agencyId) {
  if (!Number.isSafeInteger(clientId) || clientId<1 || !Number.isSafeInteger(agencyId) || agencyId<1) {
    throw Object.assign(new Error('Choose a client and agency.'),{status:400});
  }
  if (!['admin','super_admin','support','staff','provider','provider_plus','intern','intern_plus','clinical_practice_assistant','supervisor'].includes(user.role)
      || (user.scopedAgencyId && Number(user.scopedAgencyId)!==agencyId)) {
    throw Object.assign(new Error('Chart access required.'),{status:403});
  }
  const access=await resolveClientRecordAccess({userId:user.id,role:user.role,clientId});
  if (!access.ok) throw Object.assign(new Error(access.message),{status:access.status});
  if (!await clientAgencyMembership(clientId,agencyId)) throw Object.assign(new Error('Chart not found in this agency.'),{status:404});
}
import {clientSessionSnapshots} from '../services/clientSessionSnapshot.service.js';
import Task from '../models/Task.model.js';
import {clientUnreadFamilyCounts,clientUnreadCorrespondenceCounts} from '../services/clientUnreadFamilyMessages.service.js';

export async function caseloadSessionDates(req,res,next) {
  try {
    const agencyId=Number(req.body?.agencyId);
    const clientIds=Array.isArray(req.body?.clientIds)?[...new Set(req.body.clientIds)]:[];
    if (!Number.isSafeInteger(agencyId) || agencyId<1 || !Array.isArray(req.body?.clientIds) ||
        clientIds.length>200 || clientIds.some(id=>!Number.isSafeInteger(id)||id<1)) {
      return res.status(400).json({error:{message:'Choose an agency and up to 200 clients.'}});
    }
    const allowed=[];
    for (const id of clientIds) {
      try { await requireOverviewAccess(req.user,id,agencyId); allowed.push(id); }
      catch(error) { if (![403,404].includes(error.status)) throw error; }
    }
    const items=await clientSessionSnapshots(agencyId,allowed,undefined,undefined,
      ['provider','provider_plus','intern','intern_plus','clinical_practice_assistant'].includes(req.user.role)?Number(req.user.id):null);
    for(const item of items)item.agencyId=agencyId;
    try {const counts=await clientUnreadFamilyCounts({agencyId,clientIds:allowed,userId:req.user.id});
      for(const item of items){item.unreadFamilyMessages=counts.get(item.clientId)||0;item.messagesUnavailable=false;}
    } catch {for(const item of items){item.unreadFamilyMessages=null;item.messagesUnavailable=true;}}
    try {const result=await clientUnreadCorrespondenceCounts({agencyId,clientIds:allowed,userId:req.user.id});
      for(const item of items){item.unreadCorrespondence=result.counts.get(item.clientId)||0;item.correspondenceUnavailable=result.partial;}
    } catch {for(const item of items){item.unreadCorrespondence=null;item.correspondenceUnavailable=true;}}
    res.set('Cache-Control','private, no-store').json({items});
  } catch(error) { next(error); }
}

export async function clientQuickViewTasks(req,res,next) {
  try {
    const clientId=Number(req.params.id),agencyId=Number(req.query.agencyId);
    await requireOverviewAccess(req.user,clientId,agencyId);
    const rows=await Task.findByUser(req.user.id,{});
    const tasks=rows.filter(task=>{
      let metadata=task.metadata;
      if (typeof metadata==='string') { try { metadata=JSON.parse(metadata); } catch {return false;} }
      return Number(metadata?.clientId)===clientId && Number(metadata?.agencyId || task.assigned_to_agency_id)===agencyId
        && !['completed','overridden','cancelled','canceled'].includes(task.status);
    }).slice(0,20).map(task=>({id:task.id,title:task.title,dueDate:task.due_date,status:task.status}));
    res.set('Cache-Control','private, no-store').json({tasks});
  } catch(error) { next(error); }
}
