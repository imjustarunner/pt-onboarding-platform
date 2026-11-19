import {getFamilyMeta} from '../services/assessmentFamilyRegistry.js';
import {normalizeUpdateSelection} from '../services/clientUpdateSelection.js';
import {requireBillingStaff} from '../services/familyLedger/policy.js';
import Client from '../models/Client.model.js';
import * as ClientUpdate from '../services/clientUpdate.service.js';
import pool from '../config/database.js';
import {resolveClientRecordAccess} from '../services/clientRecordAccess.service.js';

function isUpdaterStaff(role) {
  return ['super_admin', 'admin', 'support', 'staff'].includes(String(role || '').trim().toLowerCase());
}

async function requireManagedClient(req, clientId) {
  const access=await resolveClientRecordAccess({userId:req.user?.id,role:req.user?.role,clientId});
  if(!access.ok)return access;
  const client=access.client||await Client.findById(clientId,{includeSensitive:true});
  if (!client) return { ok: false, status: 404, message: 'Client not found' };
  if (req.user?.role === 'super_admin') return { ok: true, client };
  const [[member]]=await pool.execute(`SELECT ua.user_id FROM user_agencies ua JOIN users u ON u.id=ua.user_id
    WHERE ua.user_id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND u.terminated_at IS NULL AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','TERMINATED','TERMINATED_PENDING','INACTIVE','INACTIVE_EMPLOYEE') LIMIT 1`,[req.user.id,client.agency_id]);
  if(!member)return {ok:false,status:403,message:'Active agency backoffice access is required.'};
  return { ok: true, client };
}

function sendError(res, error, next) {
  if (error?.status) return res.status(error.status).json({ error: { message: error.message } });
  return next(error);
}

export async function getClientUpdateCatalog(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const catalog = await ClientUpdate.listUpdateCatalog(access.client.agency_id);
    const agencyId = access.client.agency_id;
    if(!catalog.enabled)return res.json({client_id:clientId,...catalog});
    const recipients=await ClientUpdate.assignmentRecipients(clientId,agencyId);
    const [[school]]=await pool.execute(`SELECT org.id FROM agencies org WHERE org.organization_type='school'
      AND (org.id=? OR EXISTS(SELECT 1 FROM client_organization_assignments ca WHERE ca.client_id=? AND ca.organization_id=org.id AND ca.is_active=1))
      AND (EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.organization_id=org.id AND f.agency_id=? AND f.is_active=1)
      OR EXISTS(SELECT 1 FROM agency_schools f WHERE f.school_organization_id=org.id AND f.agency_id=? AND f.is_active=1)) LIMIT 1`,[access.client.organization_id||null,clientId,agencyId,agencyId]);
    const [packages] = await pool.execute('SELECT id,name,school_only,selection_json FROM portal_assignment_packages WHERE agency_id=? ORDER BY name',[agencyId]);
    const [items]=await pool.execute(`SELECT i.id,i.title,i.item_type,i.status,i.completed_at,i.reference_key,i.assessment_id,
      (d.id IS NOT NULL) AS has_result,JSON_UNQUOTE(JSON_EXTRACT(d.scores_snapshot_json,'$.scores.overall')) AS overall_score,
      r.id AS request_id,r.status AS request_status,r.sent_at,u.first_name,u.last_name
      FROM client_update_items i JOIN client_update_requests r ON r.id=i.request_id
      LEFT JOIN users u ON u.id=r.guardian_user_id
      LEFT JOIN client_assessment_deliverables d ON i.item_type='assessment' AND d.client_id=r.client_id AND d.agency_id=r.agency_id
        AND BINARY d.assessment_family=BINARY i.reference_key AND d.assessment_id=i.assessment_id AND d.kind='result'
      WHERE r.client_id=? AND r.agency_id=? AND r.status IN ('sent','in_progress','completed')
      AND COALESCE(r.purpose,'')<>'reenrollment' ORDER BY i.id DESC`,[clientId,agencyId]);
    const families=new Set(items.filter(i=>i.item_type==='assessment' && i.assessment_id && i.status!=='complete').map(i=>i.reference_key));
    for(const family of families){
      const meta=getFamilyMeta(family);
      if(!meta?.table)continue;
      const relevant=items.filter(i=>i.item_type==='assessment' && i.reference_key===family && i.assessment_id);
      const ids=[...new Set(relevant.map(i=>i.assessment_id))];
      const [rows]=await pool.execute(`SELECT id,status FROM ${meta.table} WHERE agency_id=? AND client_id=? AND id IN (${ids.map(()=>'?').join(',')})`,[agencyId,clientId,...ids]);
      const states=new Map(rows.map(r=>[Number(r.id),r.status]));
      for(const item of relevant){
        const state=states.get(Number(item.assessment_id));
        if(['completed','archived','reviewed'].includes(state))item.status='complete';
        else if(item.status==='pending' && ['in_progress','waiting_for_partner','shared_results_released','priority_selection','planning'].includes(state))item.status='in_progress';
      }
    }
    const requests = new Map();
    for (const item of items) {
      const progress = requests.get(item.request_id) || { total: 0, completed: 0 };
      progress.total++;
      if (item.status === 'complete') progress.completed++;
      requests.set(item.request_id, progress);
    }
    for (const item of items) {
      const { total, completed } = requests.get(item.request_id);
      item.requestTotal = total;
      item.requestCompleted = completed;
    }
    let canAssignPayments=true;
    try{await requireBillingStaff(req.user,agencyId);}catch(e){if(e.status!==403)throw e;canAssignPayments=false;}
    if(canAssignPayments){
      const [tasks]=await pool.execute(`SELECT task.id,'Payment authorization' AS title,'billing' AS item_type,
        CASE WHEN task.status='completed' THEN 'complete' WHEN task.status='pending' AND task.expires_at<=CURRENT_TIMESTAMP THEN 'expired' ELSE task.status END AS status,
        task.completed_at, task.expires_at, u.first_name,u.last_name FROM family_billing_tasks task JOIN users u ON u.id=task.guardian_user_id
        WHERE task.agency_id=? AND JSON_LENGTH(task.client_ids_json)=1 AND JSON_CONTAINS(task.client_ids_json,CAST(? AS JSON)) ORDER BY task.id DESC`,[agencyId,JSON.stringify(clientId)]);
      items.push(...tasks);
    }
    res.json({ client_id: clientId, ...catalog, canAssignPayments, recipients, items, schoolClient:!!school, schoolRoiExpiresAt:school?access.client.roi_expires_at:null, packages:packages.map(row=>({...row,selection_json:typeof row.selection_json==='string'?JSON.parse(row.selection_json):row.selection_json})) });
  } catch (error) {
    sendError(res, error, next);
  }
}

export async function previewUpdateItem(req,res,next) {
  try {
    const clientId=Number(req.params.id);
    if(!isUpdaterStaff(req.user?.role))return res.status(403).json({error:{message:'Backoffice access required'}});
    const access=await requireManagedClient(req,clientId);
    if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
    const agencyId=access.client.agency_id;
    const catalog=await ClientUpdate.listUpdateCatalog(agencyId);
    if(!catalog.enabled)return res.sendStatus(404);
    res.set('Cache-Control','no-store');
    if(req.params.kind==='assessment' && catalog.assessments.some(a=>a.family===req.params.key)){
      const {readAssignmentTemplate}=await import('../services/assessmentAssign.service.js');
      return res.json(await readAssignmentTemplate(req.params.key,agencyId));
    }
    if(req.params.kind==='document'){
      const id=Number(req.params.key);
      if(!catalog.documents.some(d=>d.id===id))return res.sendStatus(404);
      const [[doc]]=await pool.execute('SELECT template_type,file_path,html_content FROM document_templates WHERE id=? AND is_active=1 AND (agency_id=? OR agency_id IS NULL)',[id,agencyId]);
      if(!doc)return res.sendStatus(404);
      if(doc.template_type==='pdf'){
        const {default:storage}=await import('../services/storage.service.js');
        return res.type('application/pdf').send(await storage.readTemplate(String(doc.file_path).split('/').pop()));
      }
      return res.json({html:doc.html_content||''});
    }
    if (req.params.kind === 'portalSteps' && !catalog.portalSteps.some(step => step.key === req.params.key)) {
      return res.sendStatus(404);
    }
    if (req.params.kind === 'portalSteps' && req.params.key === 'information') {
      const { demographicFields } = await import('../services/guardianDemographics.service.js');
      return res.json({ fields: demographicFields });
    }
    if (req.params.kind === 'portalSteps' && req.params.key === 'notifications') {
      const { FAMILY_ACCOUNT_UPDATE_CATEGORIES } = await import('../utils/familyNotificationChoices.js');
      return res.json({ categories: FAMILY_ACCOUNT_UPDATE_CATEGORIES });
    }
    if(req.params.kind==='portalSteps' && ['authorization','payment'].includes(req.params.key)){
      await requireBillingStaff(req.user,agencyId);
      const {requirePaymentAuthorizationLink,resolveBillingTerms,TUTORING_BILLING_TERMS}=await import('../services/familyBillingPolicy.service.js');
      const userId=Number(req.query.recipientId);
      const link=await requirePaymentAuthorizationLink(userId,clientId,agencyId);
      const terms=link.tutoringAuthorizationOnly ? TUTORING_BILLING_TERMS : (await resolveBillingTerms({userId,agencyId,clientId})).terms;
      return res.json({terms});
    }
    return res.sendStatus(404);
  } catch(error){return sendError(res,error,next);}
}

export async function listClientUpdates(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const updates = await ClientUpdate.listClientUpdates(clientId, access.client.agency_id);
    res.json({ client_id: clientId, updates });
  } catch (error) {
    sendError(res, error, next);
  }
}

export async function createClientUpdate(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const agencyId = Number(req.body?.agencyId || access.client.agency_id || 0);
    if (!agencyId || agencyId !== Number(access.client.agency_id)) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const request = await ClientUpdate.createClientUpdate({
      agencyId,
      clientId,
      body: req.body || {},
      actorUserId: req.user?.id || null
    });
    if (req.body?.send === true) {
      const sent = await ClientUpdate.sendClientUpdate(request.id, {
        actorUserId: req.user?.id || null,
        guardianEmail: req.body?.guardianEmail,
        guardianFirstName: req.body?.guardianFirstName,
        guardianLastName: req.body?.guardianLastName
      });
      return res.status(201).json({ ok: true, ...sent });
    }
    res.status(201).json({ ok: true, request });
  } catch (error) {
    sendError(res, error, next);
  }
}

export async function sendClientUpdate(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    const requestId = Number(req.params.requestId || 0);
    if (!clientId || !requestId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const updates = await ClientUpdate.listClientUpdates(clientId, access.client.agency_id);
    if (!(updates || []).some((row) => Number(row.id) === requestId)) {
      return res.status(404).json({ error: { message: 'Client update not found for this client' } });
    }
    const result = await ClientUpdate.sendClientUpdate(requestId, {
      actorUserId: req.user?.id || null,
      guardianEmail: req.body?.guardianEmail,
      guardianFirstName: req.body?.guardianFirstName,
      guardianLastName: req.body?.guardianLastName
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error, next);
  }
}

export async function createAssignmentPackage(req,res,next) {
  try {
    const access=await requireManagedClient(req,Number(req.params.id));
    if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
    const name=String(req.body.name||'').trim();
    const keys=req.body.foundationKeys ?? [];
    if(!Array.isArray(keys) || keys.length>30 || keys.some(key=>typeof key!=='string'))return res.status(400).json({error:{message:'Choose up to 30 enrollment forms.'}});
    const selection=normalizeUpdateSelection(req.body,{allowEmpty:keys.length>0});
    if(keys.length){
      const {enrollmentPortalCatalog}=await import('../services/enrollmentPortal.service.js');
      const {documents,context}=await enrollmentPortalCatalog(req.user,Number(req.params.id),{
        channel:req.body.context?.channel,audience:req.body.context?.audience,service:req.body.context?.service,locale:req.body.context?.locale
      });
      if(keys.some(key=>!documents.some(d=>d.key===key)))return res.status(400).json({error:{message:'Choose available enrollment forms.'}});
      selection.foundationKeys=[...new Set(keys)];
      selection.context={channel:context.channel,audience:context.audience,service:context.service,locale:context.locale};
    }
    const catalog=await ClientUpdate.listUpdateCatalog(access.client.agency_id);
    if(!name || name.length>100 || !catalog.enabled || selection.documents.some(id=>!catalog.documents.some(d=>d.id===id)) || selection.assessments.some(key=>!catalog.assessments.some(a=>a.family===key)))return res.status(400).json({error:{message:'Enter a package name and select current agency items.'}});
    const [result]=await pool.execute('INSERT INTO portal_assignment_packages (agency_id,name,school_only,selection_json,created_by_user_id) VALUES (?,?,?,?,?)',[access.client.agency_id,name,req.body.schoolOnly===true,JSON.stringify(selection),req.user.id]);
    res.status(201).json({id:result.insertId});
  } catch(error) {
    if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:{message:'This agency already has a package with that name.'}});
    sendError(res,error,next);
  }
}

export async function remindAssignment(req,res,next){
  try{
    const clientId=Number(req.params.id);
    const access=await requireManagedClient(req,clientId);
    if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
    res.json(await ClientUpdate.remindUpdateItem({clientId,agencyId:access.client.agency_id,itemId:Number(req.params.itemId),actorUserId:req.user.id}));
  }catch(error){sendError(res,error,next);}
}
