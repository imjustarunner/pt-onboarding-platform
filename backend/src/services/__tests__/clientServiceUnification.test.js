import { clientServiceKindsForAgency } from '../clientServiceCatalog.service.js';
vi.mock('../providerServiceOfferings.service.js', () => ({requireAssignmentService:vi.fn()}));
vi.mock('../clientServiceCatalog.service.js', () => ({ clientServiceKindsForAgency: vi.fn().mockResolvedValue(['counseling','tutoring']) }));
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: {} }));
vi.mock('../guardianClinicalAccess.service.js', () => ({ requireClinicalScope: vi.fn() }));
import pool from '../../config/database.js';
import { clientServiceAssignments } from '../../utils/clientServiceAssignments.js';
import { ensureClientService, saveClientService, endProviderCounselingService, listClientServices } from '../clientServiceEnrollment.service.js';
import { list as listAssignments } from '../../controllers/clientServiceEnrollment.controller.js';
const seed = {id:11,client_id:4,agency_id:6,service_kind:'counseling',label:'Counseling',is_active:1,provider_user_id:0,organization_id:8,organization_name:'Counseling and Therapy'};
const assigned = {...seed,id:12,organization_id:0,organization_name:null,provider_user_id:20,provider_name:'Care Provider'};
let records, connection;
beforeEach(() => {
 vi.clearAllMocks(); records=[{...seed},{...assigned}];
 connection={execute:pool.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 pool.getConnection.mockResolvedValue(connection);
 pool.execute.mockImplementation(async (sql) => {
  if(sql.includes('SELECT c.id FROM clients'))return [[{id:4}]];
  if(sql.includes('SELECT agency_id FROM clients'))return [[{agency_id:6}]];
  if(sql.includes('SELECT agency_id FROM client_agency_assignments'))return [[]];
  if(sql.includes('SELECT u.id FROM users'))return [[{id:20}]];
  if(sql.includes('SELECT 1 FROM user_agencies'))return [[{id:1}]];
  if(sql.startsWith('SELECT id FROM clients'))return [[{id:4}]];
  if(sql.includes('FROM client_service_enrollments'))return [records];
  return [{affectedRows:1}];
 });
});
it('combines the program placeholder and assigned counseling into one service without changing the source records',()=>{
 const before=JSON.stringify(records);
 expect(clientServiceAssignments(records)).toMatchObject([{id:12,label:'Counseling',provider_user_id:20,organization_id:8,organization_name:'Counseling and Therapy',source_service_ids:[11,12],providers:[{service_id:12,provider_user_id:20}],organizations:[{id:8}]}]);
 expect(JSON.stringify(records)).toBe(before);
});
it('keeps different clients, agencies, service kinds and ended history separate',()=>{
 const rows=[seed,assigned,{...seed,id:13,agency_id:9},{...seed,id:14,client_id:8},{...seed,id:15,is_active:0},{...seed,id:16,service_kind:'tutoring'},{...seed,id:17,service_kind:'tutoring'}];
 const groups=clientServiceAssignments(rows);expect(groups).toHaveLength(6);
 expect(groups.filter(service=>service.service_kind==='tutoring')).toHaveLength(2);
 expect(groups.filter(service=>!service.is_active)).toHaveLength(1);
});
it('keeps all assigned providers inside the one counseling service and removes duplicate provider entries',()=>{
 const grouped=clientServiceAssignments([seed,assigned,{...assigned,id:13},{...assigned,id:14,provider_user_id:21,provider_name:'Second Provider'}]);
 expect(grouped).toHaveLength(1);expect(grouped[0].providers.map(provider=>provider.provider_user_id)).toEqual([20,21]);expect(grouped[0].source_service_ids).toEqual([11,12,13,14]);
});
it('returns the unified assignment to staff while retaining raw service IDs for existing portal access',async()=>{
 const res={set:vi.fn().mockReturnThis(),json:vi.fn()};const next=vi.fn();
 await listAssignments({params:{id:'4'},query:{agencyId:'6'},user:{id:9,role:'staff'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].services).toHaveLength(1);
 expect((await listClientServices(4,6)).map(service=>service.id)).toEqual([11,12]);
});
it('fills the existing unassigned counseling service when an appointment supplies its provider',async()=>{
 records=[seed];await ensureClientService({clientId:4,agencyId:6,providerUserId:20,serviceKind:'counseling',userId:9});
 const changes=pool.execute.mock.calls.filter(([sql])=>/^(UPDATE|INSERT)/.test(sql));expect(changes).toHaveLength(1);
 expect(changes[0][0]).toContain('UPDATE client_service_enrollments SET provider_user_id');expect(changes[0][0]).not.toContain('organization_id=');expect(changes[0][1]).toEqual([20,9,11,4,6]);
 expect(connection.beginTransaction).toHaveBeenCalledOnce();expect(connection.commit).toHaveBeenCalledOnce();expect(pool.execute.mock.calls.some(([sql])=>sql==='SELECT id FROM clients WHERE id=? FOR UPDATE')).toBe(true);
});
it('does not add a blank counseling enrollment beside an already assigned service',async()=>{
 records=[assigned];await ensureClientService({clientId:4,agencyId:6,providerUserId:0,serviceKind:'counseling'});
 expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it('preserves additional scheduled providers as assignments under the same service',async()=>{
 records=[assigned];await ensureClientService({clientId:4,agencyId:6,providerUserId:21,serviceKind:'counseling',userId:9});
 const [sql,values]=pool.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'));expect(sql).toContain("'counseling'");expect(values).toEqual([4,6,21,9,9]);
 expect(clientServiceAssignments([...records,{...assigned,id:13,provider_user_id:21}])).toHaveLength(1);
});
it('does not silently reopen an ended counseling service for a different provider',async()=>{
 records=[{...seed,is_active:0}];await ensureClientService({clientId:4,agencyId:6,providerUserId:20,serviceKind:'counseling'});
 expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it('rejects creating counseling again and rolls back without replacing its provider',async()=>{
 await expect(saveClientService({clientId:4,agencyId:6,userId:9,input:{serviceKind:'counseling',providerUserId:21,organizationId:0}})).rejects.toMatchObject({status:409});
 expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);expect(connection.rollback).toHaveBeenCalledOnce();expect(connection.commit).not.toHaveBeenCalled();
});
it('makes a repeated create for the same counseling assignment idempotent',async()=>{
 await saveClientService({clientId:4,agencyId:6,userId:9,input:{serviceKind:'counseling',providerUserId:20,organizationId:0}});
 expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);expect(connection.commit).toHaveBeenCalledOnce();
});
it('does not leave a phantom unassigned Counseling service after its last counselor ends care',async()=>{
 const result=await endProviderCounselingService({clientId:4,agencyId:6,providerUserId:20});
 expect(result.remainingActive).toBe(0);expect(pool.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE client_service_enrollments')).map(([,values])=>values.at(-1))).toEqual([11,12]);
});
it('keeps the unified service active when another counselor still provides care',async()=>{
 records.push({...assigned,id:13,provider_user_id:21});
 const result=await endProviderCounselingService({clientId:4,agencyId:6,providerUserId:20});expect(result.remainingActive).toBe(1);expect(pool.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE client_service_enrollments')).map(([,values])=>values.at(-1))).toEqual([12]);
});

it('adds another counselor to the existing service without replacing the first counselor or using a school roster',async()=>{
 records=[{...assigned}];
 await saveClientService({clientId:4,agencyId:6,userId:9,input:{serviceId:12,serviceKind:'counseling',providerUserId:21,addProvider:true}});
 const [sql,values]=pool.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO client_service_enrollments'));
 expect(values).toEqual([4,6,'counseling',21,0,'Counseling',9,9]);
 expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE client_service_enrollments')||sql.includes('client_provider_assignments'))).toBe(false);
 expect(connection.commit).toHaveBeenCalledOnce();
});
it('does not add a duplicate counselor when a request is retried',async()=>{
 records=[{...assigned}];
 await saveClientService({clientId:4,agencyId:6,userId:9,input:{serviceId:12,serviceKind:'counseling',providerUserId:20,addProvider:true}});
 expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it('rejects creating a service that this agency does not offer',async()=>{
 clientServiceKindsForAgency.mockResolvedValueOnce(['counseling']);
 await expect(saveClientService({clientId:4,agencyId:6,userId:9,input:{serviceKind:'coaching',providerUserId:20}})).rejects.toMatchObject({status:400});
 expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it('allows the same eligible provider to deliver counseling and a separate enabled service',async()=>{
 records=[{...assigned}];
 await saveClientService({clientId:4,agencyId:6,userId:9,input:{serviceKind:'tutoring',label:'Tutoring',providerUserId:20}});
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO client_service_enrollments'),[4,6,'tutoring',20,0,'Tutoring',9,9]);
});

it('scopes new school counseling to the school without reusing another school’s placeholder',async()=>{
 records=[seed];
 await ensureClientService({clientId:4,agencyId:6,providerUserId:20,serviceKind:'counseling',userId:9,organizationId:33});
 const writes=pool.execute.mock.calls.filter(([sql])=>/^(UPDATE|INSERT)/.test(sql));
 expect(writes).toHaveLength(1);
 expect(writes[0][0]).toContain('INSERT IGNORE INTO client_service_enrollments');
 expect(writes[0][1]).toEqual([4,6,20,9,9,33]);
});
