import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), find: vi.fn(), create: vi.fn(), types: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute }, onTableWrite: vi.fn() }));
vi.mock('../../models/PayrollTimeClaim.model.js', () => ({ default: { findById: m.find, create: m.create } }));
vi.mock('../../models/PayrollIndirectServiceType.model.js', () => ({ default: { findByIds: m.types } }));
import { createMyTimeClaim, updateMyTimeClaim } from '../payroll.controller.js';
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
 vi.clearAllMocks(); m.execute.mockResolvedValue([[{ user_id: 20 }]]); m.types.mockResolvedValue([]);
 m.find.mockResolvedValue({ id: 1, user_id: 20, agency_id: 2, claim_type: 'indirect_time', status: 'submitted', payload: {} });
});
it.each(['provider', 'supervisor', 'admin'])('rejects supervision submission through payroll even for %s', async role => {
 const next = vi.fn();
 await createMyTimeClaim.at(-1)({ user: { id: 20, role }, body: { agencyId: 2, claimType: 'indirect_time', payload: { allocations: [{ serviceTypeKey: 'clinical_supervision_sa', minutes: 60 }] } } }, res(), next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(m.create).not.toHaveBeenCalled();
});
it('blocks converting an existing payroll claim to supervision by database ID alone', async () => {
 m.types.mockResolvedValue([{ id: 7, typeKey: 'supervision' }]);
 const next = vi.fn();
 await updateMyTimeClaim({ user: { id: 20 }, params: { id: 1 }, body: { editReason: 'Changing activity', payload: { allocations: [{ serviceTypeId: 7, minutes: 60 }] } } }, res(), next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});
it('protects automatic supervision records from employee edits', async () => {
 m.find.mockResolvedValue({ id: 1, user_id: 20, claim_type: 'indirect_time', status: 'submitted', payload: { source: 'supervision_session_finalize' } });
 const next = vi.fn();
 await updateMyTimeClaim({ user: { id: 20 }, params: { id: 1 }, body: { editReason: 'Changing time', payload: {} } }, res(), next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});
it('rejects manual supervisors meeting claims from payroll', async () => {
 const next = vi.fn();
 await createMyTimeClaim.at(-1)({ user: { id: 20, role: 'supervisor' }, body: { agencyId: 2, claimType: 'indirect_time', payload: { allocations: [{ serviceTypeKey: 'supervisors_meeting', minutes: 90 }] } } }, res(), next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403, message: expect.stringContaining('automatically') }));
 expect(m.create).not.toHaveBeenCalled();
});
it('does not let a non-supervisor convert an existing claim to supervisor note time',async()=>{
 m.execute.mockResolvedValue([[{has_supervisor_privileges:0,role:'provider'}]]);
 const response=res(),next=vi.fn();
 await updateMyTimeClaim({user:{id:20,role:'provider'},params:{id:1},body:{editReason:'Correct the activity',payload:{categoryGroup:'SUPERVISION_NOTE',attestation:true,totalMinutes:30,allocations:[{serviceTypeLabel:'Supervision notes',minutes:30}]}}},response,next);
 expect(next).not.toHaveBeenCalled();expect(response.status).toHaveBeenCalledWith(403);expect(response.json).toHaveBeenCalledWith({error:{message:'Supervision Note Time is for supervisors only'}});
 expect(m.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('allows supervisors past the note-edit permission check without weakening the remaining validation',async()=>{
 const stop=new Error('Stop before persistence');m.execute.mockImplementation(async sql=>{if(sql.includes('SELECT has_supervisor_privileges'))return[[{has_supervisor_privileges:1,role:'provider'}]];throw stop;});
 const response=res(),next=vi.fn();
 await updateMyTimeClaim({user:{id:20,role:'provider'},params:{id:1},body:{editReason:'Correct the activity',payload:{categoryGroup:'supervision_note',attestation:true,totalMinutes:30,allocations:[{serviceTypeLabel:'Supervision notes',minutes:30}]}}},response,next);
 expect(response.status).not.toHaveBeenCalledWith(403);expect(next).toHaveBeenCalledWith(stop);
});
it('does not let employee payroll submissions claim the trusted automatic co-sign source',async()=>{
 const response=res(),next=vi.fn();
 await createMyTimeClaim.at(-1)({user:{id:20,role:'provider'},body:{agencyId:2,claimType:'indirect_time',payload:{source:'cosign_review_activity',attestation:true,categoryGroup:'support_activity'}}},response,next);
 expect(response.status).toHaveBeenCalledWith(403);expect(m.create).not.toHaveBeenCalled();
});
it('does not let a manual claim be edited into the trusted automatic co-sign source',async()=>{
 const response=res(),next=vi.fn();
 await updateMyTimeClaim({user:{id:20,role:'provider'},params:{id:1},body:{editReason:'Changing the source',payload:{source:'cosign_review_activity'}}},response,next);
 expect(response.status).toHaveBeenCalledWith(403);expect(next).not.toHaveBeenCalled();
});
