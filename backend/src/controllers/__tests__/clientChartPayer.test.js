import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),record:vi.fn(),saveRecord:vi.fn(),read:vi.fn(),write:vi.fn(),list:vi.fn(),savePayer:vi.fn(),connection:vi.fn(),fetch:vi.fn(),get:vi.fn(),audit:vi.fn(),catalog:vi.fn(),automate:vi.fn(),responses:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:m.get}}));
vi.mock('../../services/clientChartImportAccess.service.js',()=>({requireClientChartImportAccess:m.access}));
vi.mock('../../services/clientChartImport.service.js',()=>({readChartRecord:m.record,saveChartRecord:m.saveRecord,automaticallyLinkChartPayers:m.automate}));
vi.mock('../../services/clientInsurancePayers.service.js',()=>({clientInsurancePayers:m.catalog}));
vi.mock('../../services/coverageVerificationSummary.service.js',()=>({latestPayerResponses:m.responses}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:m.read,writeClientInsurance:m.write,claimInsuranceIssues:()=>['Subscriber date of birth is missing']}));
vi.mock('../../services/payerSetupCatalog.service.js',()=>({listPayerSetupRequests:m.list,saveDirectoryPayer:m.savePayer}));
vi.mock('../../services/claimMdConnection.service.js',()=>({resolveClaimMdConnection:m.connection}));
vi.mock('../../services/claimMd.service.js',()=>({fetchPayers:m.fetch}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
import { getClientPayerReadiness,searchClientPayers,linkClientPayer,automateClientPayers } from '../clientChartPayer.controller.js';
const req=()=>({user:{id:10,role:'support'},params:{id:12},query:{},body:{payerId:'00050',position:'primary',confirmed:true,agencyId:999},get:()=> '2'});
const res=()=>({set:vi.fn().mockReturnThis(),json:vi.fn()});
let db;
beforeEach(()=>{
 vi.resetAllMocks();db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn()};m.get.mockResolvedValue(db);
 m.access.mockResolvedValue({agencyId:2,clientId:12});m.record.mockResolvedValue({value:null});m.read.mockResolvedValue({primary:{insurerName:'Example Carrier',memberId:'SYNTHETIC',sourcePayerId:'00050',payerId:''},secondary:null,acceptAssignment:true});m.write.mockImplementation(async value=>value);
 m.list.mockResolvedValue([]);m.connection.mockResolvedValue({accountKey:'synthetic-test-key'});m.fetch.mockResolvedValue({payer:{payerid:'00050',payer_name:'Verified directory payer','1500_claims':'yes',eligibility:'yes'}});
 m.catalog.mockImplementation(async()=> (await m.list()).filter(row=>row.directory_status==='id_match').map(row=>({payerId:row.claimmd_payer_id,directoryName:row.directory_name})));
 m.responses.mockResolvedValue({});m.automate.mockResolvedValue({linked:['primary'],unresolved:[],automaticEligibility:{status:'queued'}});
});
it('rechecks the exact directory ID, creates the agency catalog route, and links only this client’s selected policy',async()=>{
 const next=vi.fn();await linkClientPayer(req(),res(),next);expect(next).not.toHaveBeenCalled();
 expect(m.savePayer).toHaveBeenCalledWith({agencyId:2,payer:{payerid:'00050',payer_name:'Verified directory payer','1500_claims':'yes',eligibility:'yes'},actorUserId:10},db);
 expect(m.write).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:12,primary:expect.objectContaining({payerId:'00050',sourcePayerId:'00050'}),acceptAssignment:true,confirmedBy:10,verifiedForClaims:false,queueEligibility:true}),db);
 expect(m.saveRecord).toHaveBeenCalledWith({agencyId:2,clientId:12},'payerLinks',0,{primary:expect.objectContaining({payerId:'00050',policyFingerprint:expect.any(String)})},10);
});
it('rejects an alias or changed directory result instead of silently linking another ID',async()=>{
 m.fetch.mockResolvedValue({payer:{payerid:'OTHER',payer_alt_names:[{alt_payerid:'00050'}]}});const next=vi.fn();await linkClientPayer(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.write).not.toHaveBeenCalled();expect(m.savePayer).not.toHaveBeenCalled();
});
it('keeps insurance payer verification restricted to account support even for an existing route',async()=>{
 const request=req();request.user.role='provider';let next=vi.fn();await linkClientPayer(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.write).not.toHaveBeenCalled();
 m.list.mockResolvedValue([{claimmd_payer_id:'00050',directory_status:'id_match'}]);next=vi.fn();await linkClientPayer(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.write).not.toHaveBeenCalled();expect(m.savePayer).not.toHaveBeenCalled();
});
it('does not call an unverified source ID linked just because that ID is in the tenant catalog',async()=>{
 m.read.mockResolvedValue({primary:{insurerName:'Example',payerId:'00050'},verifiedForClaims:false});m.list.mockResolvedValue([{claimmd_payer_id:'00050',directory_status:'id_match',directory_name:'Example'}]);const response=res();await getClientPayerReadiness(req(),response,vi.fn());expect(response.json.mock.calls[0][0].policies[0].linked).toBe(false);expect(response.json.mock.calls[0][0].coverageVerifiedForClaims).toBe(false);
});
it('searches copied IDs and payer names without automatically choosing a result',async()=>{
 m.record.mockResolvedValue({value:{primary:{payerName:'Example Carrier',sourcePayerId:'00050'}}});const request=req();request.body={position:'primary'};const response=res();await searchClientPayers(request,response,vi.fn());expect(m.fetch).toHaveBeenCalledWith({accountKey:'synthetic-test-key',payerId:'00050'});expect(m.fetch).toHaveBeenCalledWith({accountKey:'synthetic-test-key',payerName:'Example Carrier'});expect(m.write).not.toHaveBeenCalled();expect(response.json.mock.calls[0][0].payers).toHaveLength(1);
});
it.each([getClientPayerReadiness,searchClientPayers,linkClientPayer,automateClientPayers])('checks assigned chart access before directory or insurance operations (%#)',async handler=>{
 m.access.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));const next=vi.fn();await handler(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.fetch).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
});
it('refuses a silent link without an explicit match confirmation',async()=>{
 const request=req();request.body.confirmed=false;const next=vi.fn();await linkClientPayer(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(m.fetch).not.toHaveBeenCalled();
});
it('invalidates client-specific directory verification when policy details change',async()=>{
 let evidence;
 m.saveRecord.mockImplementation(async(scope,section,owner,value)=>{evidence=value;});
 await linkClientPayer(req(),res(),vi.fn());
 const linked=m.write.mock.calls[0][0];
 m.read.mockResolvedValue(linked);m.list.mockResolvedValue([{claimmd_payer_id:'00050',directory_status:'id_match',directory_name:'Verified directory payer'}]);
 m.record.mockImplementation(async(scope,section)=>({value:section==='payerLinks'?evidence:null}));
 let response=res();await getClientPayerReadiness(req(),response,vi.fn());expect(response.json.mock.calls[0][0].policies[0].linked).toBe(true);
 m.read.mockResolvedValue({...linked,primary:{...linked.primary,memberId:'CHANGED'}});response=res();await getClientPayerReadiness(req(),response,vi.fn());expect(response.json.mock.calls[0][0].policies[0].linked).toBe(false);
});
it('rejects a policy changed during the external directory lookup',async()=>{
 m.read.mockResolvedValueOnce({primary:{insurerName:'First',payerId:''}}).mockResolvedValueOnce({primary:{insurerName:'Changed',payerId:''}});
 const next=vi.fn();await linkClientPayer(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.write).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();
});

it('shows insurance as missing for a school chart with an empty paper-policy placeholder',async()=>{
 m.read.mockResolvedValue({primary:{},secondary:null,paperReviewRequired:true});const response=res(),next=vi.fn();
 await getClientPayerReadiness(req(),response,next);
 expect(next).not.toHaveBeenCalled();
 expect(response.json.mock.calls[0][0].policies[0]).toMatchObject({hasInsurance:false,linked:false,payerId:''});
});

it('prioritizes the configured agency route and aliases when Kaiser bills through a different payer',async()=>{
 m.list.mockResolvedValue([{id:7,payer_name:'Kaiser Colorado',source_names_json:JSON.stringify(['Kaiser Permanente','Beacon behavioral']),claimmd_payer_id:'43324',directory_status:'id_match',directory_name:'Beacon Health Options',review_note:'Colorado behavioral route'}]);
 const request=req();request.body={position:'primary',search:'beac'};const response=res();await searchClientPayers(request,response,vi.fn());expect(response.json.mock.calls[0][0].payers[0]).toMatchObject({source:'agency',payerId:'43324',name:'Kaiser Colorado',directoryName:'Beacon Health Options',verified:true});
});
it('keeps agency routes visible if the live directory is temporarily unavailable without claiming a fresh verification',async()=>{
 m.list.mockResolvedValue([{id:7,payer_name:'Agency payer',claimmd_payer_id:'43324',directory_status:'id_match'}]);m.connection.mockRejectedValue(Error('offline'));const request=req();request.body={position:'primary'};const response=res(),next=vi.fn();await searchClientPayers(request,response,next);expect(next).not.toHaveBeenCalled();expect(response.json.mock.calls[0][0].payers[0].source).toBe('agency');expect(response.json.mock.calls[0][0].directoryWarning).toContain('fresh directory check');expect(m.write).not.toHaveBeenCalled();
});

it('keeps a freshly verified directory choice selectable when a saved agency alias still needs review',async()=>{
 m.list.mockResolvedValue([{id:7,payer_name:'Agency alias needing review',claimmd_payer_id:'00050',directory_status:'alias_review'}]);
 const request=req();request.body={position:'primary'};const response=res();await searchClientPayers(request,response,vi.fn());const rows=response.json.mock.calls[0][0].payers;
 expect(rows.find(p=>p.source==='agency')).toMatchObject({payerId:'00050',verified:false});expect(rows.find(p=>p.source==='directory')).toMatchObject({payerId:'00050',verified:true});
});

it.each(['admin','support'])('automates routes for %s using saved policy data and authorized agency scope',async role=>{
 const request=req();request.user.role=role;request.body={agencyId:999,payerId:'UNTRUSTED'};const response=res(),next=vi.fn();
 await automateClientPayers(request,response,next);expect(next).not.toHaveBeenCalled();
 expect(m.automate).toHaveBeenCalledWith({agencyId:2,clientId:12},10);expect(response.json).toHaveBeenCalledWith(expect.objectContaining({linked:['primary']}));
 expect(m.audit).toHaveBeenCalledWith(request,expect.objectContaining({actionType:'client_chart_payer_automation_requested',agencyId:2,targetId:12}));
});
it('does not allow provider-only access to mutate payer matching',async()=>{
 const request=req();request.user.role='provider';const next=vi.fn();await automateClientPayers(request,res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.automate).not.toHaveBeenCalled();
});
it('recognizes an automatically linked shared-directory route with client-specific proof',async()=>{
 const {payerLinkFingerprint}=await import('../../utils/chartPayerLink.js');
 const insurance={primary:{insurerName:'Shared Carrier',payerId:'00050',memberId:'SYNTHETIC'},verifiedForClaims:false};m.read.mockResolvedValue(insurance);
 m.catalog.mockResolvedValue([{id:'claimmd:00050',payerId:'00050',sharedDirectory:true,directoryName:'Shared Carrier'}]);
 m.record.mockImplementation(async(scope,section)=>({value:section==='payerLinks'?{primary:{payerId:'00050',policyFingerprint:payerLinkFingerprint(insurance.primary),checkedAt:'2026-11-24T12:00:00Z'}}:null}));
 m.responses.mockResolvedValue({primary:{verified:true,checkedAt:'2026-11-24T12:00:00Z'}});
 const response=res(),next=vi.fn();await getClientPayerReadiness(req(),response,next);expect(next).not.toHaveBeenCalled();
 expect(response.json.mock.calls[0][0]).toMatchObject({policies:[expect.objectContaining({linked:true}),expect.anything()],coverageVerifiedForClaims:false,payerResponses:{primary:{verified:true}}});
});
