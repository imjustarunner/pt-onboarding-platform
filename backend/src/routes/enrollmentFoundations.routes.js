import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireClinicalStaffSecurity } from '../middleware/clinicalStaffSecurity.middleware.js';
import pool from '../config/database.js';
import { foundationContext, assertFoundationAccess, listFoundationDocuments, saveFoundationDocument } from '../services/enrollmentFoundations.service.js';
import { getEnrollmentFoundationSource, getEnrollmentPacketDocuments, generateEnrollmentPacketPdf, enrollmentPacketOptions } from '../services/enrollmentPacket.service.js';
import { invalidateAgencyPrintablePacketCaches } from '../services/schoolPrintablePacketCache.service.js';
import { clientAccess, recipientOptions, recipientAccess } from '../services/safetyPlans/access.js';
import { ensureTenantFormsMailbox } from '../services/tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';

const router = Router();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) { res.status(error.status || error.statusCode || 503).json({ error: { message: error.status || error.statusCode ? error.message : 'Enrollment documents are temporarily unavailable. Please try again.' } }); }
};
router.use(authenticate, (req, res, next) => { res.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' }); next(); });

function packetOptions(input) {
  return enrollmentPacketOptions({ ...input, organizationId: input.schoolId || input.organizationId });
}
function sourceOptions(input) {
  const context = foundationContext({...input,audience:input.audience||'self'});
  const audience = input.audience || 'self';
  const channel = context.channel === 'tutoring' ? input.setting || 'office' : context.channel;
  return { context, packet: packetOptions({ ...context, channel, audience, service: context.channel === 'tutoring' ? 'tutoring' : 'counseling', schoolId: input.schoolId }) };
}
async function catalog(input) {
  const { context, packet } = sourceOptions(input);
  const source = await getEnrollmentFoundationSource({ ...context, audience: packet.audience });
  const foundations = await listFoundationDocuments({ ...context, html: source.html });
  const generated = await getEnrollmentPacketDocuments(packet);
  return {
    agency: { id: source.agency.id, name: source.agency.name },
    services: [{key:'counseling',label:'Counseling'}, {key:'tutoring',label:'Tutoring'}],
    documents: generated.documents.map(document => {
      const foundation = foundations.find(item => item.key === document.key);
      return {
        key: document.key, title: document.title, html: document.html,
        editable: foundation?.editable === true, editableHtml: foundation?.editableHtml || '',
        version: foundation?.version ?? document.version, hash: document.hash,
        protectedNote: foundation?.protectedNote || 'Generated from current enrollment settings. Saved client copies retain the version shared with them.',
        attachment: !!document.attachmentPath
      };
    })
  };
}

router.get('/', handle(async (req, res) => {
  const context = foundationContext(req.query);
  await assertFoundationAccess(req.user, context.agencyId);
  res.json({ ...await catalog(req.query), canEdit: ['admin','super_admin'].includes(req.user.role) });
}));

router.put('/:key', handle(async (req, res) => {
  const { context, packet } = sourceOptions(req.body);
  await assertFoundationAccess(req.user, context.agencyId, {edit:true});
  const source = await getEnrollmentFoundationSource({ ...context, audience: packet.audience });
  await saveFoundationDocument(req.user, { ...context, key:req.params.key, html:req.body.html, version:req.body.version, sourceHtml:source.html });
  // Issued version history remains intact. The packet cache also hashes current
  // foundation content, so a failed eviction cannot serve an outdated packet.
  await invalidateAgencyPrintablePacketCaches(context.agencyId).catch(() => {});
  const updated = await catalog(req.body);
  res.json(updated.documents.find(document => document.key === req.params.key));
}));

router.get('/packet.pdf', handle(async (req, res) => {
  const options = packetOptions(req.query);
  await assertFoundationAccess(req.user, options.agencyId);
  const pdf = await generateEnrollmentPacketPdf(options);
  res.set({ 'Content-Type':'application/pdf', 'Content-Disposition':`inline; filename="${options.service}-${options.channel}-${options.audience}-enrollment.pdf"` }).send(pdf);
}));

async function authorizedRecipients(user, input, write = false) {
  const context = foundationContext({agencyId:input.agencyId});
  await assertFoundationAccess(user, context.agencyId);
  const client = await clientAccess(user, input.clientId, {write});
  if (Number(client.agency_id) !== context.agencyId) throw fail('Choose a client in this organization.',403);
  const record = { agency_id:client.agency_id, client_id:client.id, document_key:'enrollment-document' };
  const allowed = await recipientOptions(user, record);
  const recipients = [];
  for (const recipient of allowed) {
    const [[account]] = await pool.execute('SELECT email FROM users WHERE id=? AND is_active=1', [recipient.id]);
    if (account?.email) recipients.push({userId:recipient.id,name:recipient.name,kind:recipient.kind,email:account.email});
  }
  return {record,recipients};
}
router.get('/packet-recipients', requireClinicalStaffSecurity, handle(async (req,res) => {
  const {recipients} = await authorizedRecipients(req.user,req.query);
  res.json({recipients});
}));

router.post('/packet-email', requireClinicalStaffSecurity, handle(async (req, res) => {
  const options = packetOptions(req.body);
  // No caller-supplied address is accepted. Resolve the destination from an active,
  // authorized self/guardian account on a client this clinician may access.
  const {record,recipients} = await authorizedRecipients(req.user,req.body,true);
  const recipient = recipients.find(item => Number(item.userId) === Number(req.body.recipientUserId));
  if (!recipient) throw fail('Choose an authorized client or guardian contact with an email address.',403);
  const source = await getEnrollmentFoundationSource({agencyId:options.agencyId,channel:options.service==='tutoring'?'tutoring':options.channel,locale:options.locale,audience:options.audience});
  const pdf = await generateEnrollmentPacketPdf(options);
  const { forms, domain } = await ensureTenantFormsMailbox(options.agencyId);
  // Recheck permissions after generation and resolve the current account address.
  await clientAccess(req.user,record.client_id,{write:true});
  await recipientAccess(record,recipient.userId,recipient.kind);
  const [[account]] = await pool.execute('SELECT email FROM users WHERE id=? AND is_active=1',[recipient.userId]);
  if (!account?.email) throw fail('The selected contact no longer has an active email address.',409);
  const name = source.agency.name;
  const text = `${name} has sent your enrollment documents and forms. The attached blank packet can be printed and completed on paper. Keep a copy of all included documents. Contact the agency to arrange a secure return of completed forms and insurance-card copies.\n\nAuricWell${options.channel==='school'?' · SchoolCareBridge':''} · ${name}`;
  const delivery = await sendEmailFromIdentity({
    senderIdentityId:forms.id, to:account.email, subject:`${name} · Enrollment documents and forms`, text,
    html:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#234238"><h2>AuricWell</h2><p>${escape(name)}${options.channel==='school'?' · SchoolCareBridge':''}</p><p>${escape(text).replace(/\n/g,'<br>')}</p></div>`,
    attachments:[{ filename:`${options.service}-${options.channel}-${options.audience}-enrollment.pdf`, contentType:'application/pdf', contentBase64:pdf.toString('base64') }],
    fromDisplayNameOverride:`${name} · AuricWell`, replyToOverride:`support@${domain}`,
    generatedByUserId:req.user.id, userId:recipient.userId, clientId:record.client_id,
    templateType:'blank_enrollment_packet', source:'manual', usedFallbackSender:false
  });
  if (!delivery?.id || delivery.skipped || delivery.blocked || delivery.queued || delivery.redirected) throw fail('The packet was not delivered to this recipient. Check the agency email delivery settings or download the PDF.',409);
  res.json({sent:true});
}));

export default router;
