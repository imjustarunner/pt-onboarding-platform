import { readCoverageVerificationSummary, latestPayerResponses } from '../services/coverageVerificationSummary.service.js';
import { requireClientChartImportAccess } from '../services/clientChartImportAccess.service.js';
import { chartSections, readChartRecord, saveChartRecord, importSupplementaryChartSection } from '../services/clientChartImport.service.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import {beginClientChartImport,completeClientChartImport} from '../services/clientChartImportProgress.service.js';
import {prepareImportedGuardianAccount} from '../services/importedGuardianAccount.service.js';

function sectionOf(req, allowWorkingDraft = false) {
  const section = req.params.section;
  if (!chartSections.includes(section) && !(allowWorkingDraft && section==='assignments')) throw Object.assign(new Error('Unknown chart section'), { status: 400 });
  return section;
}
function textOf(req) {
  const text = req.body?.text;
  if (typeof text !== 'string' || text.length > 200000) throw Object.assign(new Error('Chart text must be at most 200,000 characters'), { status: 400 });
  return text;
}
const scopeOf = req => requireClientChartImportAccess(req.user, req.params.id, req.get?.('X-Agency-Id') || req.query?.agencyId || null);
const accountSections = new Set(['insurance','payer','billingComments','assignments']);
const canManageAccount = req => ['super_admin','admin','support'].includes(req.user?.role);
function requireSectionAccess(req, section) {
  if (accountSections.has(section) && !canManageAccount(req)) throw Object.assign(new Error('Client account support access required for billing information'), { status: 403 });
}

export async function startChartRecordsImport(req,res,next){try{
 const scope=await scopeOf(req),sections=req.body?.sections;
 if(Array.isArray(sections))for(const section of sections)requireSectionAccess(req,section);
 const selectedSections=req.body?.selectedSections??null;
 if(Array.isArray(selectedSections))for(const section of selectedSections)requireSectionAccess(req,section);
 const progress=await (selectedSections===null?beginClientChartImport(scope,sections,Number(req.user.id)):beginClientChartImport(scope,sections,Number(req.user.id),{selectedSections}));
 await logAuditEvent(req,{actionType:'client_records_import_started',agencyId:scope.agencyId,targetType:'client',targetId:scope.clientId});
 res.set('Cache-Control','no-store').json({progress});
}catch(error){next(error);}}
export async function finishChartRecordsImport(req,res,next){try{
 const scope=await scopeOf(req),progress=await completeClientChartImport(scope,Number(req.user.id),{allowedSections:chartSections.filter(key=>canManageAccount(req)||!accountSections.has(key)),ifPending:req.body?.ifPending===true,keptBlankSections:req.body?.keptBlankSections||[]});
 await logAuditEvent(req,{actionType:'client_records_import_completed',agencyId:scope.agencyId,targetType:'client',targetId:scope.clientId});
 res.set('Cache-Control','no-store').json({progress});
}catch(error){next(error);}}

export async function getChartImportDrafts(req, res, next) {
  try {
    const scope = await scopeOf(req);
    const entries = await Promise.all(chartSections.filter(key => canManageAccount(req) || !accountSections.has(key)).map(async key => [key, await readChartRecord(scope, key, Number(req.user.id))]));
    await logAuditEvent(req, { actionType: 'client_chart_import_drafts_viewed', agencyId: scope.agencyId, targetType: 'client', targetId: scope.clientId });
    res.set('Cache-Control', 'no-store').json({ drafts: Object.fromEntries(entries) });
  } catch (error) { next(error); }
}

export async function getChartImportDraft(req,res,next){
 try{
  const scope=await scopeOf(req),section=sectionOf(req,true);requireSectionAccess(req,section);
  const draft=await readChartRecord(scope,section,Number(req.user.id));
  await logAuditEvent(req,{actionType:'client_chart_import_drafts_viewed',agencyId:scope.agencyId,targetType:'client',targetId:scope.clientId,metadata:{section}});
  res.set('Cache-Control','no-store').json({draft});
 }catch(error){next(error);}
}
export async function saveChartImportDraft(req, res, next) {
  try {
    const scope = await scopeOf(req), section = sectionOf(req,true), text = textOf(req);
    requireSectionAccess(req, section);
    const revision = req.body?.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) throw Object.assign(new Error('Draft revision is required'), { status: 400 });
    const metadata = req.body?.metadata || {};
    let coverageDrafts;
    if (section === 'insurance' && metadata.coverageDrafts) {
      coverageDrafts = {};
      for (const position of ['primary', 'secondary']) {
        const draft = metadata.coverageDrafts[position];
        if (!draft || typeof draft.text !== 'string' || draft.text.length > 200000) throw Object.assign(new Error('Coverage drafts must be at most 200,000 characters each'), { status: 400 });
        coverageDrafts[position] = { text: draft.text, imported: draft.imported === true };
      }
    }
    const value = { text, ...(typeof metadata.sourceDate === 'string' ? { sourceDate: metadata.sourceDate.slice(0, 10) } : {}),
      ...(typeof metadata.sourceAuthor === 'string' ? { sourceAuthor: metadata.sourceAuthor.slice(0, 255) } : {}),
      imported: metadata.imported === true,
      ...(section==='insurance'?{coverageMode:metadata.coverageMode==='self_pay'?'self_pay':'insurance',selfPay:{code:String(metadata.selfPay?.code||'').slice(0,32),amount:String(metadata.selfPay?.amount||'').slice(0,32),basis:metadata.selfPay?.basis==='unit'?'unit':'visit',reason:String(metadata.selfPay?.reason||'').slice(0,2000),imported:metadata.selfPay?.imported===true}}:{}),
      needsReview: metadata.needsReview === true,
      ...(section === 'intake' && ['H0031','90791'].includes(metadata.serviceCode) ? { serviceCode: metadata.serviceCode } : {}),
      ...(coverageDrafts ? { coverageDrafts } : {}),
      ...(section === 'demographics' && ['client','guardian'].includes(metadata.contactOwner) ? { contactOwner: metadata.contactOwner } : {}),
      ...(['primary','secondary'].includes(metadata.position) ? { position: metadata.position } : {}) };
    const saved = await saveChartRecord(scope, section, Number(req.user.id), value, Number(req.user.id), revision);
    res.set('Cache-Control', 'no-store').json({ revision: saved.revision });
  } catch (error) { next(error); }
}

export async function importChartSection(req, res, next) {
  try {
    const scope = await scopeOf(req), section = sectionOf(req), text = textOf(req).trim();
    requireSectionAccess(req, section);
    if (!text) throw Object.assign(new Error('Paste content before importing'), { status: 400 });
    const position = req.body?.position || 'primary';
    if (!['primary','secondary'].includes(position)) throw Object.assign(new Error('Choose primary or secondary coverage'), { status: 400 });
    const guardianContactNames = req.body?.guardianContactNames || [];
    if (!Array.isArray(guardianContactNames) || guardianContactNames.length > 100 || guardianContactNames.some(name => typeof name !== 'string' || name.length > 255)) throw Object.assign(new Error('Select valid contacts for portal preparation'), { status: 400 });
    if (section === 'contacts' && (req.body?.preparePrimaryGuardian === true || guardianContactNames.length) && !['super_admin','admin','support'].includes(req.user?.role)) throw Object.assign(new Error('Account support access is required to prepare portal accounts'), { status: 403 });
    const result = await importSupplementaryChartSection(scope, section, text, Number(req.user.id), { position,
      ...(section === 'contacts' ? { preparePrimaryGuardian: req.body?.preparePrimaryGuardian === true, guardianContactNames, syncGuardianReminders:canManageAccount(req) } : {}) });
    await logAuditEvent(req, { actionType: 'client_chart_section_imported', agencyId: scope.agencyId, targetType: 'client', targetId: scope.clientId, metadata: { section } });
    res.set('Cache-Control', 'no-store').json({ result });
  } catch (error) { next(error); }
}

export async function getChartSupplementaryRecords(req, res, next) {
  try {
    const scope = await scopeOf(req);
    const accountAccess = canManageAccount(req);
    const [contacts, comments, insurance, payer, billingComments] = await Promise.all([readChartRecord(scope, 'contacts'), readChartRecord(scope, 'comments'), readClientInsurance(scope.clientId, scope.agencyId), accountAccess ? readChartRecord(scope, 'payer') : null, accountAccess ? readChartRecord(scope, 'billingComments') : null]);
    const [verification, payerResponses] = await Promise.all([readCoverageVerificationSummary(scope,insurance), latestPayerResponses(scope,insurance)]);
    const policyForViewer = policy => !policy ? null : accountAccess ? policy : { insurerName: policy.insurerName || '', isMedicaid: policy.isMedicaid === true, programType: policy.programType || '' };
    await logAuditEvent(req, { actionType: 'client_chart_supplementary_viewed', agencyId: scope.agencyId, targetType: 'client', targetId: scope.clientId });
    res.set('Cache-Control', 'no-store').json({ verification, payerResponses, contacts: Object.values(contacts.value || {}), administrativeNote: comments.value?.message || '', insurance: insurance ? { primary: policyForViewer(insurance.primary), secondary: policyForViewer(insurance.secondary) } : null, payer: payer?.value || null, billingComments: billingComments?.value?.message || '', accountAccess });
  } catch (error) { next(error); }
}

export async function prepareChartContactGuardian(req,res,next){try{
 if(!canManageAccount(req))throw Object.assign(new Error('Account support access is required to add a guardian account.'),{status:403});
 const scope=await scopeOf(req),affiliationId=Number(req.params.affiliationId);
 const result=await prepareImportedGuardianAccount(scope,affiliationId,Number(req.user.id));
 await logAuditEvent(req,{actionType:'client_imported_guardian_account_prepared',agencyId:scope.agencyId,targetType:'client',targetId:scope.clientId,metadata:{affiliationId,guardianUserId:result.portalAccount.userId,invitationSent:false,accessGranted:false}});
 res.set('Cache-Control','no-store').json({result});
}catch(error){next(error);}}
