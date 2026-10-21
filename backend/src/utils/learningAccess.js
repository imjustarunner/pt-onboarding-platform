import {clientAgencyMembership,guardianServiceContext} from '../services/clientServiceEnrollment.service.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';

const ROLE_ALLOWLIST_BY_AGENCY = new Set([
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'clinical_practice_assistant',
  'intern',
  'intern_plus'
]);

export async function assertLearningClientAccess(req, clientId, resourceAgencyId = null) {
  const cid = Number.parseInt(clientId, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    const err = new Error('Invalid studentId');
    err.status = 400;
    throw err;
  }

  if (!req.user?.id) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  const role = String(req.user.role || '').toLowerCase();
  const client = await Client.findById(cid, { includeSensitive: false });
  if(!client)throw Object.assign(new Error('Student not found'),{status:404});
  const requested=Number(req.query?.agencyId||req.body?.agencyId)||null;
  if(requested&&resourceAgencyId&&requested!==Number(resourceAgencyId))throw Object.assign(new Error('This learning record belongs to a different agency.'),{status:403});
  const agencyId=Number(resourceAgencyId||requested||client.agency_id);
  if(!await clientAgencyMembership(cid,agencyId))throw Object.assign(new Error('Student is not enrolled with this agency.'),{status:403});
  if (role === 'super_admin') return {clientId:cid,client,agencyId};

  if (role === 'guardian' || role === 'client_guardian' || role === 'client') {
    const context=await guardianServiceContext({userId:req.user.id,clientId:cid,agencyId,serviceId:req.query?.serviceId||req.body?.serviceId,scope:null});
    const allowed = !ClientGuardian.isNoView(context.permissions_json) && context.permissions_json?.canViewProgress!==false;
    if(context.service && context.service.service_kind!=='tutoring')throw Object.assign(new Error('Choose a tutoring service to view learning records.'),{status:403});
    if (!allowed) {
      const err = new Error('You do not have access to this student');
      err.status = 403;
      throw err;
    }
    return { clientId: cid,client,agencyId,service:context.service,permissions:context.permissions_json };
  }


  if (!ROLE_ALLOWLIST_BY_AGENCY.has(role)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }

  const agencies = await User.getAgencies(req.user.id);
  const agencyIds = new Set((agencies || []).map((a) => Number(a.id)).filter((n) => Number.isInteger(n) && n > 0));

  if (!agencyIds.has(agencyId)) {
    const err = new Error('You do not have access to this student');
    err.status = 403;
    throw err;
  }
  if(['provider','provider_plus','intern','intern_plus'].includes(role)){
    const [[assigned]]=await pool.execute(`SELECT 1 FROM client_service_enrollments
      WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind='tutoring' AND is_active=1
      UNION SELECT 1 FROM student_subjects WHERE client_id=? AND agency_id=? AND primary_tutor_user_id=? AND status NOT IN ('completed','discharged','archived') LIMIT 1`,[cid,agencyId,req.user.id,cid,agencyId,req.user.id]);
    if(!assigned)throw Object.assign(new Error('Assigned tutoring access is required for this student.'),{status:403});
  }

  return { clientId: cid, client, agencyId };
}

export async function assertLearningWriteAccess(req,clientId,record=null){
 if(['guardian','client_guardian','client'].includes(String(req.user?.role||'').toLowerCase()))throw Object.assign(new Error('Only your learning team can edit learning records.'),{status:403});
 let recordAgencyId=null;
 if(record){const client=await Client.findById(clientId,{includeSensitive:false});recordAgencyId=Number(record.metadata_json?.agencyId||client?.agency_id);}
 return assertLearningClientAccess(req,clientId,recordAgencyId);
}
