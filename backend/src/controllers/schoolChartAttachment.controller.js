import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import {schoolChartAttachments} from '../services/schoolChartAttachment.service.js';
import {viewPhiDocument} from './phiDocuments.controller.js';
async function access(req,clientId){
 if(!['super_admin','admin','support','staff','clinical_practice_assistant'].includes(req.user?.role))throw Object.assign(Error('Operations access required.'),{status:403});
 const client=await Client.findById(Number(clientId));if(!client)throw Object.assign(Error('Client not found.'),{status:404});
 const memberships=req.user.role==='super_admin'?null:await User.getAgencies(req.user.id);if(memberships&&!memberships.some(row=>Number(row.id)===Number(client.agency_id)&&row.is_active!==0))throw Object.assign(Error('Client not available.'),{status:403});
 return client;
}
export async function listSchoolChartAttachments(req,res,next){try{const client=await access(req,req.params.clientId);const rows=await schoolChartAttachments({clientId:client.id,agencyId:client.agency_id,schoolId:client.organization_id});return res.set('Cache-Control','no-store').json(rows);}catch(error){next(error);}}
export async function viewSchoolChartAttachment(req,res,next){try{const doc=await ClientPhiDocument.findById(Number(req.params.docId));if(!doc||!doc.client_id)throw Object.assign(Error('School attachment not found.'),{status:404});const client=await access(req,doc.client_id),allowed=await schoolChartAttachments({clientId:client.id,agencyId:client.agency_id,schoolId:client.organization_id});if(!allowed.some(row=>Number(row.id)===Number(doc.id)))throw Object.assign(Error('School attachment not found.'),{status:404});return viewPhiDocument(req,res,next);}catch(error){next(error);}}
