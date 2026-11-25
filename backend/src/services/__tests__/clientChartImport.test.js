import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const notificationImport=vi.hoisted(()=>vi.fn());
vi.mock('../importedGuardianNotifications.service.js',()=>({seedImportedGuardianNotifications:notificationImport}));
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),readInsurance:vi.fn(),writeInsurance:vi.fn(),contacts:vi.fn(),upsert:vi.fn(),client:vi.fn(),prepareGuardian:vi.fn(),links:vi.fn(),queueBilling:vi.fn(),enqueue:vi.fn()}));
vi.mock('../insuranceVerificationTask.service.js',()=>({queueInsuranceVerificationSafely:m.queueBilling}));
vi.mock('../intakeEligibility.service.js',()=>({enqueueIntakeEligibility:m.enqueue}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../clientInsurance.service.js', async importOriginal => ({
 ...await importOriginal(), readClientInsurance:m.readInsurance, writeClientInsurance:m.writeInsurance
}));
vi.mock('../clientContactAffiliation.service.js',()=>({upsertClientAffiliatedContact:m.upsert}));
vi.mock('../../models/ClientContactAffiliation.model.js',()=>({default:{listForClient:m.contacts}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:m.links}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../guardianAccountPreparation.service.js',()=>({prepareGuardianAccount:m.prepareGuardian}));
import {encryptDemographicsPayload} from '../demographicsImport.service.js';
import {exactCatalogPayer} from '../../utils/chartPayerLink.js';
import { handOffChartInsurance,readChartRecord,saveChartRecord,importSupplementaryChartSection,automaticallyLinkChartPayers } from '../clientChartImport.service.js';
const scope={clientId:12,agencyId:2};
let db, stored;
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('CLIENT_PHI_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
 notificationImport.mockResolvedValue(null);
 m.enqueue.mockResolvedValue({status:'queued',jobId:77});m.queueBilling.mockResolvedValue(44);
 stored=new Map();db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:m.execute};m.getConnection.mockResolvedValue(db);
 m.execute.mockImplementation(async(sql,args)=>{
   if(sql.startsWith('SELECT payload_enc'))return [[stored.get(args.join(':'))].filter(Boolean)];
   if(sql.startsWith('INSERT INTO client_chart_import_records')){stored.set(args.slice(0,4).join(':'),{payload_enc:args[4],revision:args[5]});return [{affectedRows:1}];}
   return [[{id:12}]];
 });
 m.contacts.mockResolvedValue([]);m.upsert.mockResolvedValue({affiliation:{id:50,agencyContactId:60}});m.readInsurance.mockResolvedValue(null);m.writeInsurance.mockImplementation(async value=>value);
 m.client.mockResolvedValue({id:12,agency_id:2});m.prepareGuardian.mockResolvedValue({prepared:true,userId:40,requiresAccessReview:true,invitationSent:false});
});
afterEach(()=>vi.unstubAllEnvs());
it('encrypts private drafts at rest, scopes them to the owner, and round trips the source text',async()=>{
 await saveChartRecord(scope,'comments',10,{text:'Synthetic private comment'},10,0);
 expect(stored.get('2:12:comments:10').payload_enc).not.toContain('Synthetic private comment');
 await expect(readChartRecord(scope,'comments',10)).resolves.toEqual({value:{text:'Synthetic private comment'},revision:1});
 await expect(readChartRecord(scope,'comments',11)).resolves.toEqual({value:null,revision:0});
});
it('rolls back a conflicting revision without overwriting the saved paste',async()=>{
 await saveChartRecord(scope,'comments',10,{text:'First'},10,0);
 await expect(saveChartRecord(scope,'comments',10,{text:'Stale'},10,0)).rejects.toMatchObject({status:409});
 expect(db.rollback).toHaveBeenCalledOnce();expect((await readChartRecord(scope,'comments',10)).value.text).toBe('First');
});
it('rejects ciphertext copied from another client context',async()=>{
 await saveChartRecord(scope,'comments',10,{text:'First'},10,0);
 stored.set('2:13:comments:10',stored.get('2:12:comments:10'));
 await expect(readChartRecord({agencyId:2,clientId:13},'comments',10)).rejects.toThrow('context mismatch');
});
it('replaces a carrier without carrying over its subscriber DOB, erasing secondary coverage, or trusting a source payer ID',async()=>{
 m.readInsurance.mockResolvedValue({primary:{insurerName:'Previous',memberId:'PREVIOUS',subscriberDob:'1980-01-02'},secondary:{insurerName:'Secondary',payerId:'00900'},acceptAssignment:true,patient:{firstName:'Alex'}});
 await importSupplementaryChartSection(scope,'insurance','Example Carrier (00050): Primary\nMember ID\nNEW',10);
 expect(m.writeInsurance).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:12,primary:{insurerName:'Example Carrier',sourcePayerId:'00050',payerId:'',memberId:'NEW'},secondary:{insurerName:'Secondary',payerId:'00900'},acceptAssignment:true,verifiedForClaims:false,queueEligibility:false,confirmedBy:10}),db);
});
it('reuses an existing named contact, retains extra fields, and never enables reminders',async()=>{
 m.contacts.mockResolvedValue([{contact_full_name:'Pat Example',agency_contact_id:60}]);
 await importSupplementaryChartSection(scope,'contacts','Name\nPat Example\nCompany\nExample School\nMobile Phone\n555-111-2222\nWork Phone\n555-111-3333\nROI Signed\nNot signed by patient/guardian\nAppt Reminders\nText and email',10);
 expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:12,userId:10,existingContactId:60,importOnly:true,phone:'555-111-2222'}));
 expect((await readChartRecord(scope,'contacts')).value[50]).toMatchObject({company:'Example School',workPhone:'555-111-3333',roiSigned:'Not signed by patient/guardian',appointmentReminders:'Text and email'});
});
it('merges imported contact metadata without erasing fields absent from a later paste',async()=>{
 await saveChartRecord(scope,'contacts',0,{50:{fullName:'Pat Example',company:'Example School',workPhone:'555-111-2222'},51:{fullName:'Alex Example'}},10);
 await saveChartRecord(scope,'contacts',0,{50:{fullName:'Pat Example',email:'pat@example.com'}},10);
 expect((await readChartRecord(scope,'contacts')).value).toMatchObject({50:{company:'Example School',workPhone:'555-111-2222',email:'pat@example.com'},51:{fullName:'Alex Example'}});
});
it('keeps patient comments out of the general/shared notes model',async()=>{
 await importSupplementaryChartSection(scope,'comments','Patient Comments\nsvgEdit\nSynthetic administrative comment',10);
 expect((await readChartRecord(scope,'comments')).value).toEqual({message:'Synthetic administrative comment'});
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('client_notes'))).toBe(false);
});
it('imports selected secondary coverage without replacing the primary policy',async()=>{
 m.readInsurance.mockResolvedValue({primary:{insurerName:'Primary',memberId:'FIRST'},secondary:{insurerName:'Old Secondary'},patient:{firstName:'Synthetic'}});
 await importSupplementaryChartSection(scope,'insurance','Insurance carrier\nNew Secondary\nMember ID\nSECOND',10,{position:'secondary'});
 expect(m.writeInsurance).toHaveBeenCalledWith(expect.objectContaining({primary:{insurerName:'Primary',memberId:'FIRST'},secondary:{insurerName:'New Secondary',memberId:'SECOND'}}),db);
});
it('prepares only the matching primary parent and retains secondary parents as contacts',async()=>{
 m.client.mockResolvedValue({id:12,agency_id:2,email:'primary@example.test',contact_phone:'555-111-2222'});
 m.upsert.mockImplementation(async value=>({affiliation:{id:value.fullName==='Primary Parent'?50:51,agencyContactId:value.fullName==='Primary Parent'?60:61}}));
 const result=await importSupplementaryChartSection(scope,'contacts','svgEdit\nPrimary Parent\nMobile Phone555-111-2222Emailprimary@example.test\nRelationshipFather\nsvgEdit\nSecond Parent\nMobile Phone555-111-3333Emailsecond@example.test\nRelationshipMother',10,{preparePrimaryGuardian:true});
 expect(m.prepareGuardian).toHaveBeenCalledOnce();
 expect(m.prepareGuardian).toHaveBeenCalledWith(expect.objectContaining({actorUserId:10,profile:expect.objectContaining({email:'primary@example.test',relationship:'Father'})}));
 expect(result[0].portalAccount).toMatchObject({invitationSent:false,requiresAccessReview:true});expect(result[1].portalAccount).toBeUndefined();
});
it('prepares an additional account only when that contact was explicitly selected',async()=>{
 await importSupplementaryChartSection(scope,'contacts','svgEdit\nSecond Parent\nEmailsecond@example.test\nRelationshipMother',10,{guardianContactNames:['Second Parent']});
 expect(m.prepareGuardian).toHaveBeenCalledWith(expect.objectContaining({profile:expect.objectContaining({email:'second@example.test'})}));
});
it('prepares the matching second parent using that card’s own name, contact details and relationship',async()=>{
 m.client.mockResolvedValue({id:12,agency_id:2,demographics_phi_enc:encryptDemographicsPayload({sourceContact:{email:'mother@example.test',contactPhone:'720-555-0102'}})});
 m.upsert.mockImplementation(async value=>({affiliation:{id:value.fullName==='Jordan Example'?50:51,agencyContactId:value.fullName==='Jordan Example'?60:61}}));
 const result=await importSupplementaryChartSection(scope,'contacts','Contacts\n+ New Contact\nEdit\nJordan Example\nMobile Phone\n303-555-0101\nEmail\nfather@example.test\nRelationship\nFather\nAppt Reminders\nNo Reminders\nEdit\nTaylor Example\nMobile Phone\n720-555-0102\nEmail\nmother@example.test\nRelationship\nMother\nAppt Reminders\nNo Reminders',10,{preparePrimaryGuardian:true});
 expect(m.prepareGuardian).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({profile:expect.objectContaining({fullName:'Taylor Example',firstName:'Taylor',lastName:'Example',email:'mother@example.test',phone:'720-555-0102',relationship:'Mother'})}));
 expect(m.upsert.mock.calls.map(([c])=>[c.fullName,c.relationshipType])).toEqual([['Jordan Example','Father'],['Taylor Example','Mother']]);
 expect(result[0].portalAccount).toBeUndefined();expect(result[1].portalAccount).toMatchObject({prepared:true,invitationSent:false});
});

it('matches the guardian card to encrypted source demographics after patient phone and email were separated',async()=>{
 m.client.mockResolvedValue({id:12,agency_id:2,email:null,contact_phone:null,demographics_phi_enc:JSON.stringify(encryptDemographicsPayload({sourceContact:{email:'parent@example.test',contactPhone:'720-555-0102'}}))});
 m.upsert.mockImplementation(async value=>({affiliation:{id:value.fullName==='Emergency Example'?50:51,agencyContactId:value.fullName==='Emergency Example'?60:61}}));
 const result=await importSupplementaryChartSection(scope,'contacts','Contacts\n+ New Contact\nsvgEdit\n### Emergency Example\nMobile Phone(303) 555-0101Emailemergency@example.test\nContact TypeEmergency ContactRelationshipStepmother\nsvgEdit\n### Primary Example\nMobile Phone(720) 555-0102Emailparent@example.test\nContact TypeGuardianRelationshipMother\nAppt RemindersText (SMS) and Email',10,{preparePrimaryGuardian:true});
 expect(m.prepareGuardian).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({profile:expect.objectContaining({email:'parent@example.test',relationship:'Mother',phone:'(720) 555-0102'})}));expect(result[0].portalAccount).toBeUndefined();expect(result[1].portalAccount).toMatchObject({prepared:true,invitationSent:false,requiresAccessReview:true});
});
it('uses a unique parent email before a shared household phone and does not swap relationships',async()=>{
 m.client.mockResolvedValue({id:12,agency_id:2,demographics_phi_enc:encryptDemographicsPayload({sourceContact:{email:'mother@example.test',contactPhone:'303-555-0101'}})});
 m.upsert.mockImplementation(async value=>({affiliation:{id:value.fullName==='First Parent'?50:51,agencyContactId:value.fullName==='First Parent'?60:61}}));
 await importSupplementaryChartSection(scope,'contacts','svgEdit\nFirst Parent\nMobile Phone303-555-0101Emailfather@example.test\nRelationshipFather\nsvgEdit\nSecond Parent\nMobile Phone303-555-0101Emailmother@example.test\nRelationshipMother',10,{preparePrimaryGuardian:true});
 expect(m.prepareGuardian).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({profile:expect.objectContaining({fullName:'Second Parent',relationship:'Mother',email:'mother@example.test'})}));
 expect(m.upsert.mock.calls.map(([c])=>[c.fullName,c.relationshipType])).toEqual([['First Parent','Father'],['Second Parent','Mother']]);
});

it('inherits legacy patient reminders only for matching channels on the already-linked guardian',async()=>{
 const sourceContact={email:'parent@example.test',contactPhone:'720-555-0102',appointmentReminderType:'Text (SMS) and Email'};
 m.client.mockResolvedValue({id:12,agency_id:2,demographics_phi_enc:encryptDemographicsPayload({sourceContact})});
 m.links.mockResolvedValue([{guardian_user_id:95,email:sourceContact.email,phone:sourceContact.contactPhone,relationship_type:'guardian'}]);
 const paste='svgEdit\nExample Parent\nMobile Phone(720) 555-0102Emailparent@example.test\nRelationshipMother\nAppt RemindersNo Reminders';
 const [contact]=await importSupplementaryChartSection(scope,'contacts',paste,10,{syncGuardianReminders:true});
 expect(contact.appointmentReminders).toContain('Text (SMS) and Email');
 expect(m.prepareGuardian).not.toHaveBeenCalled();
 expect(notificationImport).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:12,guardianUserId:95,contact:expect.objectContaining({appointmentReminders:'Text (SMS) and Email'})}));
 m.links.mockResolvedValue([{guardian_user_id:95,email:sourceContact.email,phone:'720-555-0199',relationship_type:'guardian'}]);
 const [changed]=await importSupplementaryChartSection(scope,'contacts',paste,10,{syncGuardianReminders:true});
 expect(changed.appointmentReminders).toBe('Email');
});
it('keeps both parents’ imported reminder choices with their own guardian accounts',async()=>{
 m.client.mockResolvedValue({id:12,agency_id:2,email:'primary@example.test'});m.links.mockResolvedValue([]);
 m.prepareGuardian.mockImplementation(async({profile})=>({prepared:true,userId:profile.email==='primary@example.test'?40:41,invitationSent:false}));
 m.upsert.mockImplementation(async({fullName})=>({affiliation:{id:fullName==='Primary Parent'?50:51,agencyContactId:fullName==='Primary Parent'?60:61}}));
 await importSupplementaryChartSection(scope,'contacts','Edit\nPrimary Parent\nEmail\nprimary@example.test\nRelationship\nMother\nAppt Reminders\nEmail\nEdit\nSecond Parent\nMobile Phone\n720-555-0102\nEmail\nsecond@example.test\nRelationship\nFather\nAppt Reminders\nText (SMS) and Email',10,{preparePrimaryGuardian:true,guardianContactNames:['Second Parent'],syncGuardianReminders:true});
 expect(notificationImport.mock.calls.map(([v])=>[v.guardianUserId,v.contact.appointmentReminders])).toEqual([[40,'Email'],[41,'Text (SMS) and Email']]);
});

it('automatically links only a unique matching agency route and queues eligibility', async()=>{
 const sample={id:31,payer_name:'Example Medicaid',claimmd_payer_id:'C001',source_payer_id:'SRC01',directory_status:'id_match'};
 const original=m.execute.getMockImplementation();
 let rows=[sample];
 m.execute.mockImplementation(async(sql,params)=>sql.includes('FROM medical_payer_setup_requests r')?[rows]:original(sql,params));
 const paste='Example Medicaid (SRC01): Primary\nMember ID\nABC';
 await importSupplementaryChartSection(scope,'insurance',paste,10);
 expect(m.writeInsurance).toHaveBeenLastCalledWith(expect.objectContaining({primary:expect.objectContaining({payerId:'C001',sourcePayerId:'SRC01'}),queueEligibility:true,verifiedForClaims:false}),db);
 expect((await readChartRecord(scope,'payerLinks',0,db)).value.primary.payerId).toBe('C001');
 rows=[sample,{...sample,id:32,claimmd_payer_id:'C002'}];
 await importSupplementaryChartSection(scope,'insurance',paste,10);
 expect(m.writeInsurance).toHaveBeenLastCalledWith(expect.objectContaining({queueEligibility:false}),db);
});

it('automatically links exact unique catalog names without a source ID and never marks coverage verified',async()=>{
 const original=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM medical_payer_setup_requests r')?[[{id:31,payer_name:'Example Carrier',claimmd_payer_id:'C001',directory_status:'id_match'}]]:original(sql,args));
 m.readInsurance.mockResolvedValue({primary:{insurerName:'Example Carrier',memberId:'SYNTHETIC'},secondary:null,patient:{firstName:'Synthetic',lastName:'Client',dateOfBirth:'2010-01-01',state:'CO'}});
 const result=await automaticallyLinkChartPayers(scope,10);
 expect(result).toMatchObject({linked:['primary'],unresolved:[],automaticEligibility:{status:'queued'}});
 const saved=m.writeInsurance.mock.calls[0][0];expect(saved).toMatchObject({primary:{payerId:'C001'},verifiedForClaims:false,queueEligibility:true});
 expect(m.enqueue).toHaveBeenCalledWith({...scope,submissionId:0},db);
 m.readInsurance.mockResolvedValue(saved);await automaticallyLinkChartPayers(scope,10);expect(m.writeInsurance).toHaveBeenCalledOnce();
 expect((await readChartRecord(scope,'payerLinks',0,db)).value.primary).toMatchObject({payerId:'C001',method:'automatic_catalog_match'});
});
it('links primary and secondary independently and sends an ambiguous route to billing instead of guessing',async()=>{
 const original=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM medical_payer_setup_requests r')?[[{id:31,payer_name:'Known Carrier',claimmd_payer_id:'C001',directory_status:'id_match'},{id:32,payer_name:'Ambiguous Carrier',claimmd_payer_id:'C002',directory_status:'id_match'},{id:33,payer_name:'Ambiguous Carrier',claimmd_payer_id:'C003',directory_status:'id_match'}]]:original(sql,args));
 m.readInsurance.mockResolvedValue({primary:{insurerName:'Known Carrier',memberId:'SYN-1'},secondary:{insurerName:'Ambiguous Carrier',memberId:'SYN-2'}});
 const result=await automaticallyLinkChartPayers(scope,10);expect(result).toMatchObject({linked:['primary'],unresolved:['secondary'],billingFollowUpId:44});
 expect(m.writeInsurance.mock.calls[0][0].secondary).toEqual({insurerName:'Ambiguous Carrier',memberId:'SYN-2'});
 expect(m.queueBilling).toHaveBeenCalledWith({...scope,actorUserId:10,reason:'missing_payer'});
});
it('keeps saved payer matching when automatic verification cannot queue and creates billing follow-up',async()=>{
 const original=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM medical_payer_setup_requests r')?[[{id:31,payer_name:'Known Carrier',claimmd_payer_id:'C001',directory_status:'id_match'}]]:original(sql,args));
 m.readInsurance.mockResolvedValue({primary:{insurerName:'Known Carrier',memberId:'SYN-1'}});m.enqueue.mockRejectedValue(Error('Unavailable'));
 const result=await automaticallyLinkChartPayers(scope,10);expect(result).toMatchObject({linked:['primary'],billingFollowUpId:44});expect(result.eligibilityQueueWarning).toContain('billing follow-up');expect(db.commit).toHaveBeenCalled();
});

it('matches only unique exact payer names or configured aliases, retaining leading zeros and agency routing',()=>{
 const own={id:1,payerId:'00050',eligibilityPayerId:'00051',sourcePayerId:'OLD-1',names:['Kaiser Colorado','Kaiser Permanente']};
 const shared={id:'claimmd:99',payerId:'99',names:['Kaiser Permanente'],sharedDirectory:true};
 expect(exactCatalogPayer({insurerName:'Kaiser Permanente'},[own,shared])).toBe(own);
 expect(exactCatalogPayer({insurerName:'Kaiser Colorado',sourcePayerId:'OLD-1'},[own])).toBe(own);
 expect(exactCatalogPayer({insurerName:'Kaiser'},[own])).toBeNull();
 expect(exactCatalogPayer({insurerName:'Kaiser Colorado'},[own,{...own,id:2,payerId:'99'}])).toBeNull();
 expect(exactCatalogPayer({insurerName:'Kaiser Colorado',sourcePayerId:'00050'},[own,{...own,id:2,payerId:'99'}])).toBe(own);
 expect(exactCatalogPayer({insurerName:'Kaiser Colorado',sourcePayerId:'99'},[own,{...shared,names:['Other carrier']}])).toBeNull();
 expect(exactCatalogPayer({insurerName:'Kaiser Colorado'},[own,{...own,id:2}])).toEqual(expect.objectContaining({payerId:'00050'}));
});

it('links CCHA secondary coverage with the verified COCHA ID despite a missing space in the carrier name',async()=>{
 const original=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,args)=>sql.includes('FROM medical_payer_setup_requests r')
  ? [[{id:31,payer_name:'Colorado Community Health Alliance',claimmd_payer_id:'COCHA',directory_status:'id_match'}]] : original(sql,args));
 const primary={insurerName:'Other Primary Carrier',memberId:'PRIMARY'};
 m.readInsurance.mockResolvedValue({primary});
 await importSupplementaryChartSection(scope,'insurance','COLORADO COMMUNITYHEALTH ALLIANCE (COCHA): Secondary\nMember ID\nA123456',10,{position:'secondary'});
 const saved=m.writeInsurance.mock.calls[0][0];
 expect(saved).toMatchObject({primary,secondary:{payerId:'COCHA',isMedicaid:true,eligibilityPayerId:'SKCO0'},verifiedForClaims:false,queueEligibility:true});
 expect((await readChartRecord(scope,'payerLinks',0,db)).value.secondary.payerId).toBe('COCHA');
 m.readInsurance.mockResolvedValue({...saved,secondary:{...saved.secondary,payerId:'',payerCatalogId:''}});
 expect(await automaticallyLinkChartPayers(scope,10)).toMatchObject({linked:['secondary'],unresolved:['primary']});
 expect(exactCatalogPayer({insurerName:'COLORADO COMMUNITYHEALTH ALLIANCE'},[{name:'Colorado Community Health Alliance',payerId:'COCHA'}])).toBeNull();
});

it.each(['Self (Patient)', 'Test Patient'])('uses the saved child demographics for a commercial policy with holder %s', async holder => {
 const original=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT full_name')
  ? [[{full_name:'Test Patient',date_of_birth:'2013-01-01',address_street:'101 Example St',address_city:'Denver',address_state:'CO',address_zip:'80202'}]]
  : original(sql,args));
 m.readInsurance.mockResolvedValue({patient:{firstName:'Test',lastName:'Patient'},secondary:{memberId:'SECOND'}});
 await importSupplementaryChartSection(scope,'insurance',`Example Plan: Primary\nMember ID\nTEST123\nPolicy Holder\n${holder}`,10);
 expect(m.writeInsurance).toHaveBeenCalledWith(expect.objectContaining({
  primary:expect.objectContaining({memberId:'TEST123',relationshipToSubscriber:'self'}),
  patient:expect.objectContaining({dateOfBirth:'2013-01-01',addressLine1:'101 Example St',postalCode:'80202'}),
  secondary:{memberId:'SECOND'},verifiedForClaims:false
 }),db);
});

it('does not borrow the child’s birth date for a policy held by another person', async () => {
 const policy='Example Plan: Primary\nMember ID\nTEST123\nPolicy Holder\nSomeone Else';
 await expect(importSupplementaryChartSection(scope,'insurance',policy,10)).rejects.toMatchObject({status:400});
 expect(m.writeInsurance).not.toHaveBeenCalled();
 await importSupplementaryChartSection(scope,'insurance',`${policy}\nRelationship to Subscriber:\tchild`,10);
 expect(m.writeInsurance.mock.calls[0][0].primary).toMatchObject({relationshipToSubscriber:'child'});
 expect(m.writeInsurance.mock.calls[0][0].primary.subscriberDob).toBeUndefined();
});

it('routes separate policies to Billing while retaining both original pastes in the encrypted chart', async () => {
 await expect(handOffChartInsurance(scope,'primary','Synthetic primary insurance',10)).resolves.toEqual({taskId:44});
 await expect(handOffChartInsurance(scope,'secondary','Synthetic secondary insurance',10)).resolves.toEqual({taskId:44});
 expect(m.queueBilling).toHaveBeenCalledWith({...scope,actorUserId:10,reason:'records_import_handoff'});
 expect(stored.get('2:12:insuranceHandoff:0').payload_enc).not.toContain('Synthetic');
 expect((await readChartRecord(scope,'insuranceHandoff')).value).toMatchObject({
  primary:{taskId:44,text:'Synthetic primary insurance'},secondary:{taskId:44,text:'Synthetic secondary insurance'}
 });
 expect(m.writeInsurance).not.toHaveBeenCalled();
 m.queueBilling.mockResolvedValue(null);
 await expect(handOffChartInsurance(scope,'primary','Synthetic retry',10)).rejects.toMatchObject({status:503});
 expect((await readChartRecord(scope,'insuranceHandoff')).value.primary.text).toBe('Synthetic primary insurance');
});
