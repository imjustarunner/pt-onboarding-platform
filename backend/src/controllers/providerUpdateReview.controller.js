import {enabledSectionKeys} from '../constants/providerUpdateSections.js';
import {getProviderUpdateRecords,saveProviderReviewProfile} from '../services/providerUpdateRecords.service.js';
import { saveStaffCommunicationChoices } from '../services/staffCommunicationChoices.service.js';
import {getCredentialStatus,createInitialPasscode} from '../services/quickViewAuth.service.js';
import VonageService from '../services/vonage.service.js';
import { requireProviderAvailabilityAccess } from '../services/providerAvailabilityAccess.service.js';
import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import StorageService from '../services/storage.service.js';
import { saveProviderLicenseUpload } from '../services/licenseCredentialSync.service.js';
import { getRecipientByToken, getMyOpenRecipient, normalizeSectionAudience, recipientSeesSection } from '../services/providerUpdate.service.js';
import { setOfficeAssignmentBookingAvailability } from '../services/officeAssignmentBookingAvailability.service.js';
import { forfeitAssignment, downgradeStandingAssignment, rescheduleStandingAssignment } from './officeSlotActions.controller.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function reviewRecipient(req) {
  const recipient = req.params.token ? await getRecipientByToken(req.params.token)
    : await getMyOpenRecipient(req.user.id, Number(req.body?.agencyId || req.query.agencyId));
  if (!recipient) throw fail('No open Provider Update was found.', 404);
  if (recipient.locked_at) throw fail('This update is locked.', 410);
  const agencies = await User.getAgencies(recipient.provider_user_id);
  if (!agencies.some(row => Number(row.id) === Number(recipient.agency_id))) throw fail('This provider no longer belongs to this agency.', 403);
  return recipient;
}
export function requireSection(recipient, key) {
  const config = typeof recipient.section_config_json === 'string' ? JSON.parse(recipient.section_config_json) : recipient.section_config_json;
  const audience=normalizeSectionAudience(typeof recipient.section_audience_json==='string'?JSON.parse(recipient.section_audience_json):recipient.section_audience_json||{});
  if (!enabledSectionKeys(config).includes(key)||!recipientSeesSection(key,audience,recipient.provider_user_id)) throw fail('This section is not enabled for this update.', 403);
}
export async function officeReviewAction(req, res, next) {
  try {
    const recipient = await reviewRecipient(req);
    if(recipient.previewOnly)throw fail('This preview is read-only.',403);
    requireSection(recipient, 'office_schedule');
    const id = Number(req.params.assignmentId);
    const [[assignment]] = await pool.execute('SELECT * FROM office_standing_assignments WHERE id = ? AND provider_id = ? AND is_active = TRUE', [id, recipient.provider_user_id]);
    if (!assignment || Number(assignment.booking_agency_id) !== Number(recipient.agency_id)) throw fail('This assignment is not part of your agency update.', 403);
    const action = req.params.action;
    if (action === 'availability') {
      await requireProviderAvailabilityAccess({ actor: { id: Number(recipient.provider_user_id), role: 'provider' }, agencyId: recipient.agency_id, providerId: recipient.provider_user_id });
      return res.json(await setOfficeAssignmentBookingAvailability({ assignmentId: id, providerId: recipient.provider_user_id, agencyId: recipient.agency_id, inPerson: req.body.inPerson, virtual: req.body.virtual }));
    }
    const handler = { forfeit: forfeitAssignment, unbook: downgradeStandingAssignment, move: rescheduleStandingAssignment }[action];
    if (!handler) throw fail('Unknown office review action.');
    // An emailed update link permits actions on this provider’s own assignments only.
    // It never inherits administrator approval privileges.
    req.user = req.params.token ? { id: Number(recipient.provider_user_id), role: 'provider', agencyId: recipient.agency_id } : req.user;
    req.params = { officeId: String(assignment.office_location_id), assignmentId: String(id) };
    req.body = { ...req.body, agencyId: recipient.agency_id, ...(action === 'unbook' ? { to: 'assigned' } : {}), ...(action === 'move' ? { blockHours: 1, sourceStartHour: Number(assignment.hour) } : {}) };
    return handler(req, res, next);
  } catch (error) { next(error); }
}
export function validateFallChecklist(body,actionKey,today=new Date().toISOString().slice(0,10)){
 const date=(value,label)=>{const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text||text>today)throw fail(`${label} must be a valid date on or before today.`);return text;};
 if(actionKey==='confirm_services_started')return {serviceDate:date(body.serviceDate,'First completed session')};
 if(actionKey!=='provider_intake')throw fail('This action is completed in the school workflow.');
 const data={};
 if(body.parentsContactedAt)data.parentsContactedAt=date(body.parentsContactedAt,'Parent contact');
 if(body.firstServiceAt)data.firstServiceAt=date(body.firstServiceAt,'First service');
 if(body.parentsContactedSuccessful!==''&&body.parentsContactedSuccessful!=null){
  if(typeof body.parentsContactedSuccessful!=='boolean')throw fail('Choose whether parent contact was successful.');
  data.parentsContactedSuccessful=body.parentsContactedSuccessful;
 }
 if(!Object.keys(data).length)throw fail('Enter the completed steps before saving.');
 return data;
}
export async function saveFallClientAction(req,res,next){
 try{const r=await reviewRecipient(req);if(r.previewOnly)throw fail('This preview is read-only.',403);requireSection(r,'client_fall_update');
  const {listFallActionClientsForProvider}=await import('../services/providerUpdate.service.js');
  const clients=await listFallActionClientsForProvider(r.provider_user_id,r.agency_id);
  const client=clients.find(c=>Number(c.id)===Number(req.params.clientId));
  if(!client)throw fail('This client is not assigned to you with an open action in this update.',403);
  const body=validateFallChecklist(req.body||{},client.lifecycleAction?.actionKey);
  const {default:User}=await import('../models/User.model.js');const user=await User.findById(r.provider_user_id);
  const scoped=Object.create(req);scoped.params={id:String(client.id)};scoped.user={...user,id:Number(r.provider_user_id),role:'provider'};scoped.body=body;scoped.query={agencyId:r.agency_id};
  if(client.lifecycleAction.actionKey==='confirm_services_started'){
   const {postConfirmServicesStarted}=await import('./clientLifecycle.controller.js');return postConfirmServicesStarted(scoped,res,next);
  }
  const {updateClientComplianceChecklist}=await import('./client.controller.js');return updateClientComplianceChecklist(scoped,res,next);
 }catch(e){next(e);}
}
export async function uploadReviewPhoto(req,res,next){
 try{const r=await reviewRecipient(req);if(r.previewOnly)throw fail('This preview is read-only.',403);requireSection(r,'directory_photo');
  const {uploadUserProfilePhoto}=await import('./userProfilePhoto.controller.js');
  const scoped=Object.create(req);scoped.params={id:String(r.provider_user_id)};scoped.user={id:Number(r.provider_user_id),role:'provider'};
  return uploadUserProfilePhoto(scoped,res,next);
 }catch(e){next(e);}
}
export async function reviewContext(req, res, next) {
  try {
    const recipient = await reviewRecipient(req);
    const [fields] = await pool.execute(`SELECT d.field_key, v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id = v.field_definition_id
      WHERE v.user_id = ? AND d.field_key IN ('provider_credential_license_type_number','provider_credential_license_issued_date','provider_credential_license_expiration_date','license_upload')`, [recipient.provider_user_id]);
    const values = Object.fromEntries(fields.map(row => [row.field_key, row.value]));
    const supervisors = await User.getSupervisors(recipient.provider_user_id, recipient.agency_id);
    const supervision = supervisors.length ? await SupervisionSession.getHoursSummaryForSupervisee(recipient.agency_id, recipient.provider_user_id) : null;
    res.json({ license: { number: values.provider_credential_license_type_number || '', issued: values.provider_credential_license_issued_date || '', expires: values.provider_credential_license_expiration_date || '', hasUpload: !!values.license_upload }, supervision, supervised: !!supervisors.length });
  } catch (error) { next(error); }
}
export async function uploadReviewDocument(req, res, next) {
  try {
    const recipient = await reviewRecipient(req);
    if(recipient.previewOnly)throw fail('This preview is read-only.',403);
    const kind = req.params.kind;
    if (!['license', 'supervision'].includes(kind)) throw fail('Unknown document type.');
    requireSection(recipient, kind === 'license' ? 'license' : 'supervision_hours');
    if (!req.file?.buffer) throw fail('Choose a PDF or image.');
    let document;
    if (kind === 'license') {
      document = await saveProviderLicenseUpload({ userId: recipient.provider_user_id, agencyId: recipient.agency_id, file: req.file,
        expirationDate: req.body.expirationDate || null, createdByUserId: recipient.provider_user_id, notes: 'Uploaded through Provider Update' });
    } else {
      const suffix = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[req.file.mimetype] || 'bin';
      const saved = await StorageService.saveComplianceDocument(req.file.buffer, `supervision-${crypto.randomUUID()}.${suffix}`, req.file.mimetype);
      document = await UserComplianceDocument.create({ userId: recipient.provider_user_id, agencyId: recipient.agency_id,
        documentType: 'supervision_hours', filePath: saved.relativePath, notes: 'Supporting evidence for Provider Update hours review', createdByUserId: recipient.provider_user_id });
    }
    res.status(201).json({ ok: true, documentId: document.id });
  } catch (error) { next(error); }
}

export async function persistReviewSection(recipient, key, data, completed) {
  if(recipient.previewOnly)throw fail('This preview is read-only.',403);
  requireSection(recipient, key);
  if(key==='pin'&&!completed)throw fail('Complete Quick View setup in your account before confirming this step.');
  if (key === 'notification_prefs') {
    if (!completed) throw fail('Review and sign your phone and text choices before saving this section.');
    const emailPrefs=data?.emailReminderPreferences;
    if(emailPrefs && (!['notification','forward_one_to_one'].includes(emailPrefs.personalEmailDeliveryMode)||!['immediate','business_day'].includes(emailPrefs.personalEmailDelayMode)))throw fail('Choose a personal email delivery option and timing.');
    const saved=await saveStaffCommunicationChoices({userId:recipient.provider_user_id,agencyId:recipient.agency_id,input:data,source:'provider_update',sendConfirmation:m=>VonageService.sendSms(m)});
    if(emailPrefs){const {updateCommunicationPrefs}=await import('../services/inboxDigest.service.js');await updateCommunicationPrefs(recipient.provider_user_id,{personalEmailNotify:true,personalEmailDeliveryMode:emailPrefs.personalEmailDeliveryMode,personalEmailDelayMode:emailPrefs.personalEmailDelayMode,personalEmailDelayHours:24});}
    for (const field of Object.keys(data)) delete data[field];
    Object.assign(data,{emailReminderPreferences:emailPrefs,choices:saved.choices,accessRequests:saved.accessRequests,reviewedAt:saved.reviewedAt});
  }
  if (!completed) return;
  if(key==='amendments'){
    const {listAmendmentTasksForRecipient}=await import('../services/providerUpdateAmendment.service.js');
    const tasks=await listAmendmentTasksForRecipient({userId:recipient.provider_user_id,pushId:recipient.push_id});
    if(!tasks.length||tasks.some(t=>t.status!=='completed'))throw fail('Your assigned amendment agreement must be signed before this section can be completed.');
  }
  await saveProviderReviewProfile(recipient,key,data);
  if(key==='pin'){
    const status=await getCredentialStatus(recipient.provider_user_id);
    if(!status.hasPasscode||status.isLocked)throw fail('Create or reset your six-digit Quick View passcode in your account, then return to confirm this step.');
    if(data?.quickViewConfirmed!==true)throw fail('Confirm that you can access Quick View with your six-digit passcode.');
    for(const field of Object.keys(data))delete data[field];
    Object.assign(data,{quickViewConfirmed:true});
  }
  if (key === 'supervision_hours') {
    const supervisors = await User.getSupervisors(recipient.provider_user_id, recipient.agency_id);
    if (!supervisors.length) return;
    if (!['confirmed', 'correction_requested'].includes(data?.decision)) throw fail('Confirm your supervision hours or request a correction.');
    if (data.decision === 'correction_requested' && (!String(data.reason || '').trim() || !Number.isFinite(Number(data.requestedHours)) || Number(data.requestedHours) < 0)) throw fail('Enter the requested hours and a reason for the correction.');
    // Store the attested ledger value, never overwrite the ledger from a self-report.
    data.breakdown = (await getProviderUpdateRecords(recipient.provider_user_id,recipient.agency_id)).supervision;
    data.recordedHours = data.breakdown.current.total;
    if (data.documentId) {
      const doc = await UserComplianceDocument.findById(Number(data.documentId));
      if (!doc || Number(doc.user_id) !== Number(recipient.provider_user_id) || Number(doc.agency_id) !== Number(recipient.agency_id) || doc.document_type !== 'supervision_hours') throw fail('Choose your own supervision evidence document.');
    }
  }
  if (key === 'license') {
    const license = data?.license;
    if (!license || !String(license.number || '').trim()) throw fail('Enter the license type and number.');
    for (const date of [license.issued, license.expires]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) throw fail('Enter valid license dates.');
    if (license.issued && license.expires && license.issued > license.expires) throw fail('The issue date must precede the expiration date.');
    const values = { provider_credential_license_type_number: license.number, provider_credential_license_issued_date: license.issued, provider_credential_license_expiration_date: license.expires };
    const resolved = [];
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      const [[field]] = await pool.execute('SELECT id FROM user_info_field_definitions WHERE field_key = ? AND (agency_id IS NULL OR agency_id = ?) ORDER BY (agency_id = ?) DESC, id DESC LIMIT 1', [key, recipient.agency_id, recipient.agency_id]);
      if (!field) throw fail('License fields are not configured for this agency. Contact an administrator.', 409);
      resolved.push([field.id, value]);
    }
    for (const [id, value] of resolved) await UserInfoValue.createOrUpdate(recipient.provider_user_id, id, value);
  }
}

export async function reviewAsset(req,res,next){
 try{
  const r=await reviewRecipient(req);const kind=req.params.kind;
  if(!['license','photo'].includes(kind))throw fail('Unknown document.',404);
  requireSection(r,kind==='photo'?'directory_photo':'license');
  const records=await getProviderUpdateRecords(r.provider_user_id,r.agency_id);
  const path=kind==='photo'?records.photoPath:records.licensePath;
  if(!path||typeof path!=='string'||path.includes('..')||/^https?:/i.test(path))throw fail('No stored document is available.',404);
  const key=path.replace(/^\/?uploads\//,'');
  const url=await StorageService.getSignedUrl(kind==='license'&&key.startsWith('credentials/')?key:'uploads/'+key,5);
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.query?.open==='1')return res.redirect(303,url);
  res.json({url});
 }catch(e){next(e);}
}

// A valid scoped invitation may initialize a missing code. Existing codes cannot
// be retrieved or reset here; previews and closed/expired invitations cannot write.
export async function setupQuickView(req,res,next){
 try{
  const r=await reviewRecipient(req);
  if(r.previewOnly)throw fail('This preview is read-only.',403);
  requireSection(r,'pin');
  const status=await getCredentialStatus(r.provider_user_id);
  if(status.hasPasscode)throw fail('Your code is already set. Use account settings if you need to reset it.',409);
  const result=await createInitialPasscode({userId:r.provider_user_id,agencyId:r.agency_id});
  res.setHeader('Cache-Control','no-store');res.json({passcode:result.passcode,shownOnce:true});
 }catch(e){next(e);}
}

export async function contactHours(req,res,next){
 try{const r=await reviewRecipient(req);requireSection(r,'office_schedule');
  const {getContactHours,saveContactHours}=await import('../services/providerUpdateContactHours.service.js');
  if(req.method==='PUT'&&r.previewOnly)throw fail('This preview is read-only.',403);
  res.json(req.method==='PUT'?await saveContactHours(r.provider_user_id,req.body):await getContactHours(r.provider_user_id));
 }catch(e){next(e);}
}
export async function schoolReview(req,res,next){
 try{const r=await reviewRecipient(req);requireSection(r,'school_availability');
  const {loadProviderSchoolSchedule,loadProviderPendingScheduleAdjustments}=await import('../services/providerYearUpdate.service.js');
  res.json({schools:await loadProviderSchoolSchedule(r.provider_user_id,r.agency_id),pending:await loadProviderPendingScheduleAdjustments(r.provider_user_id,r.agency_id)});
 }catch(e){next(e);}
}
export async function schoolAdjustment(req,res,next){
 try{const r=await reviewRecipient(req);requireSection(r,'school_availability');if(r.previewOnly)throw fail('This preview is read-only.',403);
  const {loadProviderSchoolSchedule}=await import('../services/providerYearUpdate.service.js');
  const schools=await loadProviderSchoolSchedule(r.provider_user_id,r.agency_id);
  const school=schools.find(s=>s.days.some(d=>Number(d.assignmentId)===Number(req.params.assignmentId)));
  const day=school?.days.find(d=>Number(d.assignmentId)===Number(req.params.assignmentId));if(!day)throw fail('School assignment not found.',404);
  const {startTime,endTime,slotsTotal,moveToDay,notes}=req.body||{};
  if(!Number.isInteger(slotsTotal)||slotsTotal<0||slotsTotal>40||moveToDay&&!['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(moveToDay))throw fail('Choose valid weekday hours and 0–40 client spots.');
  const clean=v=>String(v||'').replace(/[|\r\n]/g,' ').slice(0,600);
  const note=[`Schedule adjustment request for ${clean(school.schoolName)}`,`Day: ${day.dayOfWeek}`,moveToDay&&moveToDay!==day.dayOfWeek?`Requested day: ${moveToDay} | Change type: day_move`:null,`Current slots: ${day.clientCount||0} assigned / ${day.slotsTotal||0} total`,`Requested slots total: ${slotsTotal}`,`Current hours: ${String(day.startTime||'').slice(0,5)}–${String(day.endTime||'').slice(0,5)}`,`Requested hours: ${clean(startTime)}–${clean(endTime)}`,`Note: ${clean(notes)}`].filter(Boolean).join(' | ');
  const user=await User.findById(r.provider_user_id);
  const scoped={...req,user:{...user,id:r.provider_user_id},query:{agencyId:r.agency_id},body:{agencyId:r.agency_id,requestKind:'schedule_adjustment',preferredSchoolOrgIds:[school.schoolOrganizationId],notes:note,blocks:[{dayOfWeek:day.dayOfWeek,startTime,endTime,schoolOrganizationId:school.schoolOrganizationId}]}};
  const {createMySchoolAvailabilityRequest}=await import('./availability.controller.js');return createMySchoolAvailabilityRequest(scoped,res,next);
 }catch(e){next(e);}
}
