import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), clinicalExecute: vi.fn(), cosign: vi.fn(), hasSupervisees: vi.fn(), agencies: vi.fn(),revisionWork:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: mocks.clinicalExecute } }));
vi.mock('../medicalBilling.controller.js', () => ({ cosignClinicalNote: mocks.cosign }));
vi.mock('../../models/SupervisorAssignment.model.js', () => ({ default: { hasSupervisees: mocks.hasSupervisees } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: mocks.agencies } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { agencyHasClinicalOrg: vi.fn() } }));
vi.mock('../../services/clinicalNoteVersion.service.js',()=>({listPendingRevisionWork:mocks.revisionWork}));
import { signNote, listNotesToSign, getClinicalNotesEligible } from '../notesToSign.controller.js';
const response = () => { const res = { json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res); return res; };
describe('service billing supervisor review queue', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.hasSupervisees.mockResolvedValue(false); mocks.agencies.mockResolvedValue([{id:2}]);mocks.revisionWork.mockResolvedValue([]); });
  it('uses the actual cosign flow, preserving the reviewed version and attestation', async () => {
    mocks.execute.mockResolvedValue([[{id:1,clinical_note_id:20,supervisor_user_id:501,status:'awaiting_supervisor'}]]);
    const req={user:{id:501},params:{id:'1'},body:{reviewedAndApproved:true,contentHash:'reviewed-version'}};
    const res=response(),next=vi.fn(); await signNote(req,res,next);
    expect(mocks.cosign).toHaveBeenCalledWith({...req,params:{noteId:20}},res,next);
    expect(mocks.execute).toHaveBeenCalledTimes(1); // No queue-only "signature".
  });
  it('rejects a signature by someone other than the assigned supervisor', async () => {
    mocks.execute.mockResolvedValue([[{clinical_note_id:20,supervisor_user_id:501,status:'awaiting_supervisor'}]]);
    const res=response();await signNote({user:{id:506},params:{id:'1'}},res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);expect(mocks.cosign).not.toHaveBeenCalled();
  });
  it('shows an assigned note even without a global clinical-supervisor assignment', async () => {
    mocks.execute.mockImplementation(async sql => sql.includes('FROM clients') ? [[{id:30,agency_id:2,initials:'SAMPLE'}]] : sql.includes('JOIN users') ? [[{id:1,clinical_note_id:20,agency_id:2}]] : [[{id:1}]]);
    mocks.clinicalExecute.mockResolvedValue([[{id:20,agency_id:2,client_id:30,title:'Screening',service_code:'H0002'}]]);
    const res=response(),next=vi.fn();await listNotesToSign({user:{id:501}},res,next);
    expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({isSupervisor:true,count:1,notes:[expect.objectContaining({client_code:'SAMPLE',service_code:'H0002'})]});
  });
  it('does not expose clinical-note eligibility across agencies', async () => {
    const res=response();await getClinicalNotesEligible({user:{id:501,role:'provider'},query:{agencyId:'6'}},res,vi.fn());
    expect(res.json).toHaveBeenCalledWith({eligible:false});expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([{pending_revision_id:31,effective_revision_id:1,original_revision_id:1},{pending_revision_id:null,effective_revision_id:31,original_revision_id:1}])('suppresses stale original cosign work when history is pending or a later version is approved: %j',async history=>{
    mocks.execute.mockImplementation(async sql=>sql.includes('JOIN users')?[[{id:1,clinical_note_id:20,agency_id:2}]]:sql.includes('FROM clients')?[[]]:[[{id:1}]]);
    mocks.clinicalExecute.mockResolvedValue([[{id:20,agency_id:2,client_id:30,title:'Signed original',supervisor_cosigned_at:null,...history}]]);
    const res=response(),next=vi.fn();await listNotesToSign({user:{id:501}},res,next);
    expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({isSupervisor:true,count:0,notes:[]});
  });
  it('shows only the responsible supervisors exact next revision action and scopes active preview agencies',async()=>{
    mocks.execute.mockImplementation(async sql=>sql.includes('FROM clients')?[[{id:30,agency_id:2,initials:'SYNTHETIC'}]]:sql.includes('FROM users')?[[{id:5,first_name:'Clinical',last_name:'Author'}]]:[[]]);
    mocks.clinicalExecute.mockResolvedValue([[]]);
    mocks.agencies.mockResolvedValue([{id:2},{id:6},{id:8,is_active:0}]);
    const common={clinicalNoteId:20,agencyId:2,clientId:30,title:'Amended note',providerUserId:5,supervisorUserId:501,revisionId:31,revisionNumber:2,createdAt:'2026-11-03',signatures:[],status:'awaiting_supervisor_signature'};
    mocks.revisionWork.mockResolvedValue([{...common,nextAction:'supervisor_sign'},{...common,revisionId:32,nextAction:'author_sign'}]);
    const res=response(),next=vi.fn();await listNotesToSign({user:{id:501},auricwellPreview:{agencyId:2}},res,next);
    expect(next).not.toHaveBeenCalled();expect(mocks.revisionWork).toHaveBeenCalledWith({agencyIds:[2],actorUserId:501});
    expect(res.json).toHaveBeenCalledWith({isSupervisor:true,count:1,notes:[expect.objectContaining({clinical_revision_id:31,revision_action:'supervisor_sign',client_code:'SYNTHETIC'})]});
  });
});
