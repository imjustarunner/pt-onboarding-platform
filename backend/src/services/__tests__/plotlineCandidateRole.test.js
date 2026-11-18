import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({applicant:vi.fn(),profile:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../plotlineCompanyPolicy.service.js',()=>({default:{assertWritable:vi.fn()}}));
vi.mock('../jobApplicantUser.service.js',()=>({resolveOrCreateJobApplicantUser:m.applicant}));
vi.mock('../../models/HiringProfile.model.js',()=>({default:{upsert:m.profile}}));
import {createCandidate} from '../../controllers/hiring.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.applicant.mockResolvedValue({user:{id:2000,role:'staff'}});m.profile.mockResolvedValue({id:5});});
it('creates manual applicants in a Plotline company as nonclinical staff',async()=>{
 const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await createCandidate({method:'POST',plotlineCompanyId:463,user:{id:1434,role:'support'},body:{agencyId:463,lastName:'QA applicant',email:'qa@example.test',role:'provider'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(m.applicant).toHaveBeenCalledWith(expect.objectContaining({agencyId:463,role:'staff'}));expect(res.status).toHaveBeenCalledWith(201);
});
