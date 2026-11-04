import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),find:vi.fn(),update:vi.fn(),email:vi.fn(),immediate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.find,updateStatus:m.update}}));
vi.mock('../email.service.js',()=>({default:{sendEmail:m.email}}));
import {advanceCandidateStatus} from '../../controllers/prehirePortal.controller.js';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('setImmediate',m.immediate);m.find.mockResolvedValue({id:31,status:'PREHIRE_OPEN',first_name:'Candidate',last_name:'Example'});m.execute.mockImplementation(async sql=>sql.includes('SELECT agency_id')?[[{agency_id:2}]]:[{affectedRows:1}]);});
afterEach(()=>vi.unstubAllGlobals());
it('retains the agency admin review task and stage change without an unconditional duplicate staff email',async()=>{
 await advanceCandidateStatus(31,3);
 expect(m.update).toHaveBeenCalledWith(31,'PREHIRE_REVIEW',3,expect.objectContaining({source:'staff_prehire_review'}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'),expect.arrayContaining([2,31]));
 expect(m.email).not.toHaveBeenCalled();expect(m.immediate).toHaveBeenCalledTimes(1);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('SELECT u.email, u.first_name'))).toBe(false);
});
