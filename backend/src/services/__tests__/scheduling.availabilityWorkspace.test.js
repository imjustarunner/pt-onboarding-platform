import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../providerAvailability.service.js',()=>({default:{computeWeekAvailability:vi.fn()}}));
vi.mock('../../models/ProviderVirtualWorkingHours.model.js',()=>({default:{listForProvider:vi.fn(async()=>[])}}));
import pool from '../../config/database.js';
import Availability from '../providerAvailability.service.js';
import {deletePublication,getWorkspace} from '../../controllers/providerAvailabilityWorkspace.controller.js';
import {availabilityDiagnostics} from '../availabilityDiagnostics.js';
const res=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const req=(role='support',kind='weekly')=>({user:{id:1,role},query:{agencyId:2,weekStart:'2030-01-07'},params:{providerId:9,kind,id:18}});
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async sql=>sql.startsWith('DELETE')||sql.startsWith('UPDATE')?[{affectedRows:1}]:[[{present:1}]]);});
describe('staff publication management',()=>{
 it.each(['support','admin','super_admin','clinical_practice_assistant'])('allows %s to remove a scoped weekly publication',async role=>{const r=res(),next=vi.fn();await deletePublication(req(role),r,next);expect(next).not.toHaveBeenCalled();expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE id=? AND agency_id=? AND provider_id=?'),[18,2,9]);expect(r.json).toHaveBeenCalledWith({ok:true});});
 it.each(['virtual','inPerson'])('deactivates %s publication without deleting office events or appointments',async kind=>{await deletePublication(req('admin',kind),res(),vi.fn());const mutations=pool.execute.mock.calls.filter(([sql])=>/^(UPDATE|DELETE)/.test(sql));expect(mutations).toHaveLength(1);expect(mutations[0][0]).toContain('SET is_active=0');expect(mutations[0][0]).not.toMatch(/office_events|appointments/);});
 it('rejects editing colleagues and cross-tenant targets before any mutation',async()=>{for(const role of ['provider','support','super_admin']){pool.execute.mockResolvedValue([[]]);const next=vi.fn();await deletePublication(req(role),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));}expect(pool.execute.mock.calls.some(([sql])=>/^(UPDATE|DELETE)/.test(sql))).toBe(false);});
 it('treats missing or already removed records as missing',async()=>{pool.execute.mockImplementation(async sql=>sql.startsWith('DELETE')?[{affectedRows:0}]:[[{present:1}]]);const r=res();await deletePublication(req(),r,vi.fn());expect(r.status).toHaveBeenCalledWith(404);});
 it('does not interpolate arbitrary publication types',async()=>{const r=res();await deletePublication(req('admin','appointments'),r,vi.fn());expect(r.status).toHaveBeenCalledWith(400);expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);});
 it('allows viewing a reused schedule but disables edits without source membership',async()=>{
  Availability.computeWeekAvailability.mockResolvedValue({scheduleAgencyId:3,diagnostics:[]});
  pool.execute.mockImplementation(async(sql,args)=>[sql.startsWith('SELECT 1')?(args[1]===3?[]:[{present:1}]):[{id:4,agencyId:3}]]);
  const r=res(),next=vi.fn();await getWorkspace(req(),r,next);expect(next).not.toHaveBeenCalled();expect(r.json.mock.calls[0][0]).toMatchObject({canEditSource:false,publications:[{canEdit:false},{canEdit:false}]});
 });
});
describe('staff conflict explanations',()=>{
 const start=new Date('2030-01-07T17:00:00Z'),end=new Date('2030-01-07T19:00:00Z');
 it('explains partial conflicts without leaking event content or treating touching events as overlap',()=>{const result=availabilityDiagnostics({bases:[{start,end,format:'VIRTUAL'}],blockers:[['Client appointment',[{start:new Date('2030-01-07T18:00:00Z'),end,clientName:'PRIVATE'}]],['School commitment',[{start:end,end:new Date('2030-01-07T20:00:00Z')}]]],formatAllowed:()=>true,officeAllowed:()=>true,slotMinutes:60});expect(result).toHaveLength(1);expect(result[0].reasons).toEqual(['Client appointment']);expect(JSON.stringify(result)).not.toContain('PRIVATE');});
 it('reports disabled format, excluded office, and unavailable room',()=>{const result=availabilityDiagnostics({bases:[{start,end,format:'IN_PERSON',meta:{buildingId:7},reasons:['Office room unavailable']}],blockers:[],formatAllowed:()=>false,officeAllowed:()=>false,slotMinutes:60});expect(result[0].reasons).toHaveLength(3);});
});
