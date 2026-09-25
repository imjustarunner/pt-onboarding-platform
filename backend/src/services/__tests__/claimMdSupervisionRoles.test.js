import { describe,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import SupervisorAssignment from '../../models/SupervisorAssignment.model.js';
import { supervisionResponsibilities } from '../supervisedBillingPolicy.service.js';
const clinical={supervisor_id:5,supervisor_type:'clinical',is_primary:1};
const billing={supervisor_id:9,supervisor_type:'billing',is_primary:0};
describe('separate clinical and billing supervision',()=>{
  it.each(['self','billing_supervisor'])('billing assignment owns cosign in %s claim mode',mode=>{
    const r=supervisionResponsibilities([clinical,billing],7,{mode,billingSupervisorUserId:5});
    expect(r).toMatchObject({supervisorUserId:9,clinicalSupervisorIds:[5],reviewSupervisorIds:[5,9]});
    expect(SupervisorAssignment.pickClinicalCosignSupervisor([clinical,billing],7)).toBe(billing);
  });
  it('supports one person in both roles without granting two signing requirements',async()=>{
    const assignments=[clinical,{...billing,supervisor_id:5}];
    expect(supervisionResponsibilities(assignments,7)).toMatchObject({supervisorUserId:5,clinicalSupervisorIds:[5],reviewSupervisorIds:[5]});
    vi.spyOn(SupervisorAssignment,'findBySupervisee').mockResolvedValue(assignments);
    expect(await SupervisorAssignment.listClaimBillingSupervisorOptions(7,1)).toEqual([expect.objectContaining({id:5,supervisorType:'billing'})]);
  });
  it('uses clinical fallback and excludes managers and self assignments',()=>{
    const ineligible=[{supervisor_id:7,supervisor_type:'billing'},{supervisor_id:11,supervisor_type:'manager'}];
    expect(supervisionResponsibilities([...ineligible,clinical],7)).toMatchObject({supervisorUserId:5,reviewSupervisorIds:[5]});
    expect(supervisionResponsibilities(ineligible,7)).toMatchObject({supervisorUserId:null,reviewSupervisorIds:[]});
    expect(SupervisorAssignment.pickClinicalCosignSupervisor(ineligible,7)).toBeNull();
  });
  it('keeps claim oversight and cosign aligned when a stale preference names the clinical supervisor',async()=>{
    vi.spyOn(SupervisorAssignment,'findBySupervisee').mockResolvedValue([clinical,billing]);
    expect(await SupervisorAssignment.resolveClaimBillingSupervisorId(7,1,5)).toBe(9);
  });
});
