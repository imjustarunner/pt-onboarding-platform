import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../../models/User.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../narrivaAccess.service.js',()=>({requireNarrivaAgency:vi.fn(),positiveId:value=>Number(value)>0?Number(value):null,maskMobileClientName:client=>String(client.full_name).split(' ').map(part=>part.slice(0,3)+(part.length>3?'*':'')).join(' ')}));
import {createMobileDocumentationQueue} from '../documentationQueue.service.js';
import {currentAccessAgencyId,userInCurrentAgency} from '../../../utils/agencyAccessContext.js';
const request={quickView:{userId:7,agencyId:10,mobileDeviceSessionId:3},query:{agencyId:999}};
let deps,queue;
beforeEach(()=>{
 const user={id:7,role:'admin',is_active:1};
 deps={db:{execute:vi.fn().mockResolvedValue([[{id:10,name:'Office',logo_url:'https://example.invalid/logo.png'},{id:20,name:'School'},{id:30,name:'Restricted'}]])},findUser:vi.fn().mockResolvedValue(user),
 authorize:vi.fn(async(actor,agencyId)=>{if(agencyId===30)throw {status:403};actor.role=agencyId===10?'provider':'supervisor';actor.agencyAccess={agencyId,role:actor.role,permissions:{has_billing_access:false}};}),
 listWork:vi.fn(async req=>({items:[{id:`work_${req.auricwellPreview.agencyId}`,agencyId:req.auricwellPreview.agencyId,clientId:100+req.auricwellPreview.agencyId,serviceCode:'90837',date:'2026-11-06',status:req.auricwellPreview.agencyId===10?'not_started':'started',timeLabel:'5:00 PM',sourceTimezone:'America/Denver',scheduledStart:'2026-11-07T00:00:00Z'},{id:'other',agencyId:99,clientId:999,status:'not_started'},{id:'unassigned',agencyId:req.auricwellPreview.agencyId,clientId:999,status:'not_started'}]})),
 cards:vi.fn(async(actor,agencyId)=>new Map([[100+agencyId,{id:100+agencyId,maskedName:'Syn* Cli*',age:12}]])),
 listCosign:vi.fn(async req=>({isSupervisor:req.user.role==='supervisor',notes:req.user.role==='supervisor'?[{id:80,agency_id:20,clinical_note_id:90,service_code:'H2011',date_of_service:'2026-11-06',provider_first_name:'Other',provider_last_name:'Provider',narriva:{status:'passed',quickSignEligible:true}}]:[]})),
 loadSource:vi.fn(async()=>({client:{id:120,full_name:'Synthetic Client',date_of_birth:'2014-01-01'},session:{source_timezone:'America/Denver',scheduled_start_at:'2026-11-07 00:00:00'}}))};
 queue=createMobileDocumentationQueue(deps);
});
it('aggregates active memberships with separate agency actors, masks clients and preserves code/local-time context',async()=>{
 const scopes=[];deps.listWork.mockImplementation(async req=>{scopes.push([currentAccessAgencyId(),req.user.role]);return {items:[{id:`work_${req.auricwellPreview.agencyId}`,agencyId:req.auricwellPreview.agencyId,clientId:100+req.auricwellPreview.agencyId,serviceCode:'90837',timeLabel:'5:00 PM',sourceTimezone:'America/Denver',scheduledStart:'2026-11-07T00:00:00Z',status:'not_started'}]};});
 const result=await queue(request);
 expect(scopes).toEqual([[10,'provider'],[20,'supervisor']]);await expect(deps.findUser.mock.results[0].value).resolves.toMatchObject({role:'admin'});
 expect(deps.db.execute.mock.calls[0][0]).toContain('COALESCE(ua.is_active,1)=1');expect(deps.db.execute.mock.calls[0][0]).toContain('COALESCE(a.is_archived,0)=0');
 expect(result.agencies.map(a=>a.id)).toEqual([10,20]);expect(result.items).toHaveLength(3);
 expect(result.items[0]).toMatchObject({agencyId:10,agencyName:'Office',maskedName:'Syn* Cli*',serviceCode:'90837',timeLabel:'5:00 PM',sourceTimezone:'America/Denver'});
 expect(result.items[2]).toMatchObject({agencyId:20,status:'awaiting_cosign',clinicalNoteId:90,narriva:{quickSignEligible:true}});
 expect(JSON.stringify(result)).not.toMatch(/Synthetic Client|2014-01-01/);
});
it('does not return foreign, unassigned, or unbound work items',async()=>{const result=await queue(request);expect(result.items.map(i=>i.id)).toEqual(['work_10','work_20','cosign_80']);expect(deps.authorize).toHaveBeenCalledTimes(3);});
it('exposes co-sign failures rather than claiming that the queue is empty',async()=>{deps.listCosign.mockRejectedValue(new Error('database detail'));const result=await queue(request);expect(result.items).toHaveLength(2);expect(result.failures).toHaveLength(2);expect(result.failures[0]).toMatchObject({agencyId:10,section:'cosign'});expect(JSON.stringify(result)).not.toContain('database detail');});
it('rechecks signoff note access and excludes newly revoked reviews',async()=>{deps.loadSource.mockRejectedValue({status:403});const result=await queue(request);expect(result.items).toHaveLength(2);expect(result.items.every(i=>i.queueKind==='own')).toBe(true);});
it('keeps amendments ineligible for Quick Sign even when an older note had passed',async()=>{deps.listCosign.mockResolvedValue({isSupervisor:true,notes:[{id:'revision_1',clinical_note_id:90,clinical_revision_id:111,agency_id:20,narriva:{quickSignEligible:true}}]});const result=await queue(request);expect(result.items.find(i=>i.queueKind==='cosign')).toMatchObject({clinicalRevisionId:111,narriva:{quickSignEligible:false}});});
it('returns unavailable when no active clinical membership remains',async()=>{deps.authorize.mockRejectedValue({status:403});const result=await queue(request);expect(result).toMatchObject({items:[],agencies:[],clinicalAvailable:false});expect(deps.listWork).not.toHaveBeenCalled();});
it('rejects a disabled account before listing memberships',async()=>{deps.findUser.mockResolvedValue({id:7,is_active:0});await expect(queue(request)).rejects.toMatchObject({status:403});expect(deps.db.execute).not.toHaveBeenCalled();});
it('retains all To do, started and signed work from the authorized server queue',async()=>{deps.listWork.mockImplementation(async req=>({items:['not_started','started','signed'].map((status,index)=>({id:index,clientId:100+req.auricwellPreview.agencyId,agencyId:req.auricwellPreview.agencyId,status}))}));const result=await queue(request);expect(result.items.filter(item=>item.queueKind==='own').map(item=>item.status)).toEqual(['not_started','started','signed','not_started','started','signed']);expect(deps.listCosign.mock.calls.every(([req])=>req.notesIncludeAll===true)).toBe(true);});
it('keeps concurrent users and downstream raw role reloads scoped to the correct agency',async()=>{
 deps.findUser.mockImplementation(async id=>({id,role:'admin',is_active:1,has_billing_access:true}));
 const seen=[];deps.listWork.mockImplementation(async req=>{await Promise.resolve();const effective=await userInCurrentAgency({id:req.user.id,role:'admin',has_billing_access:true});seen.push([req.user.id,currentAccessAgencyId(),effective.role,effective.has_billing_access]);return {items:[]};});
 deps.listCosign.mockResolvedValue({notes:[]});
 await Promise.all([queue(request),queue({...request,quickView:{...request.quickView,userId:8},user:{id:999,role:'super_admin'}})]);
 expect(seen).toHaveLength(4);expect(seen).toEqual(expect.arrayContaining([[7,10,'provider',false],[7,20,'supervisor',false],[8,10,'provider',false],[8,20,'supervisor',false]]));expect(currentAccessAgencyId()).toBeNull();
});
it('never lists or invokes another membership for the approved synthetic QA actor',async()=>{
 deps.findUser.mockResolvedValue({id:1433,email:'qa.provider.auricwell@example.com',role:'provider',is_demo:1,is_active:1,status:'ACTIVE_EMPLOYEE'});
 deps.db.execute.mockResolvedValue([[{id:450,name:'Synthetic QA',slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}},{id:456,name:'Not granted'}]]);
 deps.listCosign.mockResolvedValue({notes:[]});const result=await queue(request);
 expect(result.agencies.map(a=>a.id)).toEqual([450]);expect(deps.authorize.mock.calls.map(([,id])=>id)).toEqual([450]);expect(deps.listWork).toHaveBeenCalledTimes(1);
});
it('rebinds inherited workspace context for each authorized agency without retaining prior verification',async()=>{
 deps.listWork.mockImplementation(async req=>{expect(req.headers['x-agency-id']).toBe(String(req.query.agencyId));expect(req.quickView.agencyId).toBe(req.query.agencyId);expect(req.medicalBillingAgencyId).toBe(req.query.agencyId);expect(req.mobileClinical).toBeUndefined();return {items:[]};});
 await queue({...request,headers:{'x-agency-id':'999'},mobileClinical:{verified:true,agencyId:999}});expect(deps.listWork).toHaveBeenCalledTimes(2);
});

it('uses the supplied Inner Strength compact icon over a placeholder logo',async()=>{deps.db.execute.mockResolvedValue([[{id:10,name:'The Inner Strength Institute',slug:'tisi',logo_path:'broken-placeholder.png'}]]);deps.listCosign.mockResolvedValue({notes:[]});const result=await queue(request);expect(result.agencies[0].logoUrl).toBe('https://auricwell.com/assets/branding/innerstrength-icon.png');expect(result.items[0].agencyLogoUrl).toBe('https://auricwell.com/assets/branding/innerstrength-icon.png');});
