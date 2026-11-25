import { matchingGuardian } from '../../../frontend/src/navigation/recordsContactOwnership.js';
import {readChartRecord,chartRecordContext as recordContext} from './clientChartRecordRead.service.js';
import { payerLinkFingerprint, exactCatalogPayer } from '../utils/chartPayerLink.js';
import { clientInsurancePayers } from './clientInsurancePayers.service.js';
import pool from '../config/database.js';
import { encryptDemographicsPayload, decryptDemographicsPayload } from './demographicsImport.service.js';
import { readClientInsurance, writeClientInsurance, insuranceDemographics, mergePatientDefaults } from './clientInsurance.service.js';
import { parseChartContacts, parseChartInsurance, normalizeImportedSubscriberRelationship, parsePatientComments, parsePayerInformation, parseBillingComments } from './chartPasteParser.service.js';
import { upsertClientAffiliatedContact } from './clientContactAffiliation.service.js';
import ClientContactAffiliation from '../models/ClientContactAffiliation.model.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { prepareGuardianAccount } from './guardianAccountPreparation.service.js';
import {seedImportedGuardianNotifications} from './importedGuardianNotifications.service.js';
import { policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';
import { queueInsuranceVerificationSafely } from './insuranceVerificationTask.service.js';

export const chartSections = ['demographics', 'intake', 'plan', 'insurance', 'contacts', 'comments', 'payer', 'billingComments'];
export {readChartRecord} from './clientChartRecordRead.service.js';

export async function saveChartRecord(scope, section, owner, value, actorId, expectedRevision = null) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // Serialize changes, including a first insert and contact imports, per chart.
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [scope.clientId, scope.agencyId]);
    const result = await saveLockedChartRecord(scope, section, owner, value, actorId, expectedRevision, db);
    await db.commit();
    return result;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}

async function saveLockedChartRecord(scope, section, owner, value, actorId, expectedRevision, db) {
    const previous = await readChartRecord(scope, section, owner, db);
    if (expectedRevision != null && expectedRevision !== Number(previous.revision)) throw Object.assign(new Error('This draft changed in another window. Reopen the import panel before editing further.'), { status: 409 });
    const merged = ['contacts','payer','payerLinks','insuranceHandoff'].includes(section) && owner === 0
      ? { ...previous.value, ...Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, { ...previous.value?.[key], ...entry }])) }
      : value;
    const revision = Number(previous.revision) + 1;
    const encrypted = JSON.stringify(encryptDemographicsPayload({ context: recordContext(scope, section, owner), value: merged }));
    await db.execute(`INSERT INTO client_chart_import_records (agency_id,client_id,section_key,owner_user_id,payload_enc,revision,updated_by_user_id)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE payload_enc=VALUES(payload_enc),revision=VALUES(revision),updated_by_user_id=VALUES(updated_by_user_id)`,
    [scope.agencyId, scope.clientId, section, owner, encrypted, revision, actorId]);
    return { value: merged, revision };
}

function comparableName(name) {
  const words = name.trim().split(',').map(part => part.trim());
  const formatted = words.length === 2 ? words.reverse().join(' ') : name;
  return formatted.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function handOffChartInsurance(scope, position, text, actorId) {
  const taskId = await queueInsuranceVerificationSafely({ ...scope, actorUserId: actorId, reason: 'records_import_handoff' });
  if (!taskId) throw Object.assign(new Error('Billing follow-up could not be created. The original paste remains in your draft. Retry, or ask your agency administrator to check the insurance verification task list.'), { status: 503 });
  await saveChartRecord(scope, 'insuranceHandoff', 0, {
    [position]: { text, taskId, sentAt: new Date().toISOString() }
  }, actorId);
  return { taskId };
}

export async function importSupplementaryChartSection(scope, section, text, actorId, { position = null, preparePrimaryGuardian = false, guardianContactNames = [], syncGuardianReminders = false } = {}) {
  if (section === 'insurance') {
    const parsed = parseChartInsurance(text, { position });
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [scope.clientId, scope.agencyId]);
      const previous = await readClientInsurance(scope.clientId, scope.agencyId, db) || {};
      const chartPatient = await insuranceDemographics(scope.clientId, scope.agencyId, db);
      const patientName = comparableName([chartPatient.firstName, chartPatient.lastName].filter(Boolean).join(' '));
      for (const policy of Object.values(parsed)) {
        const relation = normalizeImportedSubscriberRelationship(policy.relationshipToSubscriber);
        const holderNames = [policy.policyHolder, policy.subscriberName].filter(Boolean);
        const holderIsPatient = chartPatient.firstName && chartPatient.lastName && holderNames.length
          && holderNames.every(name => comparableName(name) === patientName)
          && (!policy.subscriberDob || policy.subscriberDob === chartPatient.dateOfBirth);
        if (relation || holderIsPatient) policy.relationshipToSubscriber = relation || 'self';
      }
      const changed = Object.fromEntries(['primary', 'secondary'].filter(slot => parsed[slot]).map(slot => [slot, { ...previous[slot], ...parsed[slot] }]));
      // Source system IDs are not trusted clearinghouse routes. Preserve an
      // existing link only when its source ID is unchanged; verify new routes.
      for (const slot of ['primary', 'secondary']) if (parsed[slot]?.payerId) {
        changed[slot].sourcePayerId = parsed[slot].payerId;
        changed[slot].payerId = previous[slot]?.sourcePayerId === parsed[slot].payerId || previous[slot]?.payerId === parsed[slot].payerId ? previous[slot]?.payerId || '' : '';
      }
      for (const [slot, policy] of Object.entries(changed)) {
        const prior = previous[slot];
        if (!prior) continue;
        const differentCarrier = parsed[slot].insurerName && String(prior.insurerName).trim().toLowerCase() !== parsed[slot].insurerName.trim().toLowerCase();
        const differentId = parsed[slot].payerId && ![prior.payerId, prior.sourcePayerId].includes(parsed[slot].payerId);
        const update = parsed[slot];
        const changedHolder = ['relationshipToSubscriber','subscriberFirstName','subscriberLastName'].some(key =>
          update[key] && String(prior[key] || '').trim().toLowerCase() !== String(update[key]).trim().toLowerCase());
        if (!update.subscriberDob && (changedHolder || differentCarrier || differentId)) delete policy.subscriberDob;
        if (differentCarrier || differentId) {
          delete policy.payerCatalogId;
          delete policy.eligibilityPayerId;
          if (policy.payerId || parsed[slot].payerId) policy.payerId = '';
          if (!parsed[slot].payerId) delete policy.sourcePayerId;
        }
      }
      const catalog = await clientInsurancePayers(scope.agencyId, db);
      const linked = {};
      for (const [slot, policy] of Object.entries(changed)) {
        const match = exactCatalogPayer(policy, catalog);
        if (match) {
          policy.payerId = String(match.payerId);
          policy.eligibilityPayerId = match.eligibilityPayerId;
          if (match.isMedicaid) policy.isMedicaid = true;
          policy.payerCatalogId = String(match.id);
          linked[slot] = policy.payerId;
        }
      }
      for (const policy of Object.values(changed)) {
        if (policyIsMedicaid(policy)) policy.relationshipToSubscriber = 'self';
        if (policy.relationshipToSubscriber && !normalizeImportedSubscriberRelationship(policy.relationshipToSubscriber)) {
          throw Object.assign(new Error('Choose the client’s relationship to the subscriber, or send the policy to Billing for review.'), { status: 400 });
        }
      }
      const useChartIdentity = Object.values(changed).some(policy => policy.relationshipToSubscriber === 'self');
      const patient = useChartIdentity ? mergePatientDefaults(chartPatient, previous.patient || {}) : previous.patient;
      const insurance = await writeClientInsurance({ ...previous, ...changed, ...scope, patient, confirmedBy: actorId, verifiedForClaims: false, queueEligibility: Object.keys(linked).length > 0 }, db);
      if (Object.keys(linked).length) {
        const checkedAt = new Date().toISOString();
        const evidence = Object.fromEntries(Object.entries(linked).map(([slot, payerId]) => [slot, { payerId, checkedAt, policyFingerprint: payerLinkFingerprint(insurance[slot]) }]));
        await saveLockedChartRecord(scope, 'payerLinks', 0, evidence, actorId, null, db);
      }
      await db.commit();
      if(Object.keys(changed).some(slot=>!linked[slot] && !changed[slot].payerId))await queueInsuranceVerificationSafely({...scope,actorUserId:actorId,reason:'missing_payer'});
      return { primary: insurance.primary, secondary: insurance.secondary, needsBillingReview: true, automaticEligibility: insurance.automaticEligibility, eligibilityQueueWarning: insurance.eligibilityQueueWarning };
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
  }
  if (section === 'comments') {
    const message = parsePatientComments(text);
    if (!message) throw Object.assign(new Error('Paste patient comments to import'), { status: 400 });
    return (await saveChartRecord(scope, section, 0, { message }, actorId)).value;
  }
  if (section === 'payer') return (await saveChartRecord(scope, section, 0, { [position || 'primary']: parsePayerInformation(text) }, actorId)).value;
  if (section === 'billingComments') {
    const message = parseBillingComments(text);
    if (!message) throw Object.assign(new Error('Paste billing comments to import'), { status: 400 });
    return (await saveChartRecord(scope, section, 0, { message }, actorId)).value;
  }
  if (section === 'contacts') {
    const contacts = parseChartContacts(text);
    const imported = {};
    const existing = await ClientContactAffiliation.listForClient(scope.clientId, { includeInactive: true });
    const nameKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const requestedAccounts = new Set(guardianContactNames.map(nameKey));
    let client = null, primaryContact = null, inheritedChannels = null;
    if (preparePrimaryGuardian || requestedAccounts.size || syncGuardianReminders) {
      client = await Client.findById(scope.clientId, { includeSensitive: true });
      if (!client || Number(client.agency_id) !== Number(scope.agencyId)) throw Object.assign(new Error('Client not found in this agency'), { status: 404 });
      let demographics = {};
      if (client.demographics_phi_enc) demographics = decryptDemographicsPayload(client.demographics_phi_enc) || {};
      const source = demographics.sourceContact || demographics;
      const match = demographics.contactOwner === 'client' ? null : matchingGuardian({
        email: source.email || (!demographics.contactOwner ? client.email : ''),
        contactPhone: source.contactPhone || (!demographics.contactOwner ? client.contact_phone : '')
      }, contacts);
      primaryContact = match?.contact || null;
      if (primaryContact && source.appointmentReminderType && (demographics.sourceContact || preparePrimaryGuardian)) {
        const choice = String(source.appointmentReminderType).toLowerCase();
        const selected = term => !/\b(no|none)\b/.test(choice) && term.test(choice);
        const emailOn = match.emailMatched && selected(/\be-?mail\b/);
        const smsOn = match.phoneMatched && selected(/\b(sms|text)\b/);
        if (emailOn || smsOn) inheritedChannels = {email:emailOn, sms:smsOn};
      }
    }
    for (const contact of contacts) {
      const matches = existing.filter(row => nameKey(row.contact_full_name) === nameKey(contact.fullName));
      if (matches.length > 1) throw Object.assign(new Error('More than one existing contact has this name. Resolve the duplicate contacts before importing.'), { status: 409 });
      const result = await upsertClientAffiliatedContact({ ...scope, userId: actorId, fullName: contact.fullName, email: contact.email,
        phone: contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone,
        relationshipType: contact.relationshipType, existingContactId: matches[0]?.agency_contact_id || null, importOnly: true });
      const affiliation = result.affiliation;
      const id = Number(affiliation?.id);
      if (!id) throw new Error('Contact import did not return an affiliation');
      imported[id] = { ...contact, affiliationId: id };
      if ((preparePrimaryGuardian && contact === primaryContact) || requestedAccounts.has(nameKey(contact.fullName))) {
        const names = contact.fullName.split(/\s+/);
        const portalAccount = await prepareGuardianAccount({ client, profile: { ...contact, firstName: contact.firstName || names.shift(), lastName: contact.lastName || names.join(' '),
          phone: contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone, relationship: contact.relationshipType }, actorUserId: actorId, reviewLinkedGuardians:true });
        imported[id].portalAccount = portalAccount;
      }
      if (contact === primaryContact && inheritedChannels) {
        const email = String(contact.email || '').trim().toLowerCase();
        const phone = normalizeSmsPhone(contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone);
        const links = (await ClientGuardian.listForClient(scope.clientId)).filter(link => link.relationship_type !== 'self' && email && String(link.email || '').trim().toLowerCase() === email);
        const link = links.length === 1 ? links[0] : null;
        const channels = {email:inheritedChannels.email, sms:!!(inheritedChannels.sms && phone && link && normalizeSmsPhone(link.phone) === phone)};
        if (link && (channels.email || channels.sms)) {
          imported[id].sourceContactReminders = contact.appointmentReminders || null;
          imported[id].appointmentReminders = [channels.sms && 'Text (SMS)', channels.email && 'Email'].filter(Boolean).join(' and ');
        }
      }
      if(syncGuardianReminders||preparePrimaryGuardian||requestedAccounts.size){
        const links=await ClientGuardian.listForClient(scope.clientId)||[];
        const linked=links.filter(link=>link.relationship_type!=='self'&&String(link.email||'').trim().toLowerCase()===String(contact.email||'').trim().toLowerCase()&&contact.email);
        const guardianUserId=imported[id].portalAccount?.prepared?imported[id].portalAccount.userId:linked.length===1?Number(linked[0].guardian_user_id):null;
        if(guardianUserId){const notificationImport=await seedImportedGuardianNotifications({...scope,guardianUserId,affiliationId:id,contact:imported[id],actorUserId:actorId});if(notificationImport)imported[id].notificationImport=notificationImport;}
      }
      // Persist each contact so retries preserve completed work after a partial failure.
      await saveChartRecord(scope, section, 0, { [id]: imported[id] }, actorId);
      if (!matches.length) existing.push({ contact_full_name: contact.fullName, agency_contact_id: affiliation.agencyContactId || affiliation.contact?.id });
    }
    return Object.values(imported);
  }
  throw Object.assign(new Error('Use the clinical import for this section'), { status: 400 });
}

/** Match saved policies without asking import staff to choose a billing route.
 * Only exact names/approved aliases in the verified catalog are eligible.
 * Repeated requests reuse the durable eligibility job and never run paid checks here. */
export async function automaticallyLinkChartPayers(scope, actorId) {
  const db=await pool.getConnection();
  let result;
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[scope.clientId,scope.agencyId]);
    const previous=await readClientInsurance(scope.clientId,scope.agencyId,db);
    if(!previous){await db.commit();return {linked:[],unresolved:[],automaticEligibility:null};}
    const catalog=await clientInsurancePayers(scope.agencyId,db);
    const proof=(await readChartRecord(scope,'payerLinks',0,db)).value || {};
    const changes={},linked=[],unresolved=[];
    for(const slot of ['primary','secondary']) {
      const policy=previous[slot];
      if(!policy || !['insurerName','memberId','payerId','sourcePayerId'].some(key=>policy[key]))continue;
      const known=policy.payerId && catalog.some(row=>row.payerId===policy.payerId);
      if(known && (previous.verifiedForClaims===true || proof[slot]?.payerId===policy.payerId && proof[slot].policyFingerprint===payerLinkFingerprint(policy))){linked.push(slot);continue;}
      const match=exactCatalogPayer(policy,catalog);
      if(!match){unresolved.push(slot);continue;}
      changes[slot]={...policy,payerId:String(match.payerId),eligibilityPayerId:match.eligibilityPayerId,payerCatalogId:String(match.id),...(match.isMedicaid?{isMedicaid:true}:{})};
      linked.push(slot);
    }
    const needsPatientDefaults=linked.length && ['firstName','lastName','dateOfBirth','state'].some(key=>!previous.patient?.[key]);
    const insurance=Object.keys(changes).length || needsPatientDefaults
      ? await writeClientInsurance({...previous,...changes,...scope,confirmedBy:actorId,verifiedForClaims:Object.keys(changes).length?false:previous.verifiedForClaims===true,queueEligibility:true},db)
      : previous;
    if(Object.keys(changes).length || needsPatientDefaults)await saveLockedChartRecord(scope,'payerLinks',0,Object.fromEntries(linked.map(slot=>[slot,
      {payerId:insurance[slot].payerId,policyFingerprint:payerLinkFingerprint(insurance[slot]),checkedAt:new Date().toISOString(),method:'automatic_catalog_match'}])),actorId,null,db);
    let automaticEligibility=insurance.automaticEligibility || null,eligibilityQueueWarning=insurance.eligibilityQueueWarning || null;
    if(linked.length && !automaticEligibility && !eligibilityQueueWarning) {
      try {const {enqueueIntakeEligibility}=await import('./intakeEligibility.service.js');automaticEligibility=await enqueueIntakeEligibility({...scope,submissionId:0},db);}
      catch {eligibilityQueueWarning='Payer matching is saved. Automatic coverage verification needs billing follow-up.';}
    }
    await db.commit();
    result={linked,unresolved,automaticEligibility,eligibilityQueueWarning};
  } catch(error){await db.rollback();throw error;} finally{db.release();}
  if(result.unresolved.length || result.eligibilityQueueWarning || ['disabled','waiting_for_information','review_required'].includes(result.automaticEligibility?.status))
    result.billingFollowUpId=await queueInsuranceVerificationSafely({...scope,actorUserId:actorId,reason:result.unresolved.length?'missing_payer':'verification_pending'});
  return result;
}
