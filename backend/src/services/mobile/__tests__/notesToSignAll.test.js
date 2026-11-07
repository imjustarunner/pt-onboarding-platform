import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),clinical:vi.fn(),status:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../../clinicalSupervisorReview.service.js',()=>({reconcileSupervisorQueue:vi.fn()}));
vi.mock('../../supervisedBillingPolicy.service.js',()=>({parseObject:value=>JSON.parse(value || '{}')}));
vi.mock('../../clinicalNoteVersion.service.js',()=>({listPendingRevisionWork:vi.fn(async()=>[])}));
vi.mock('../../../controllers/medicalBilling.controller.js',()=>({cosignClinicalNote:vi.fn()}));
vi.mock('../../../models/SupervisorAssignment.model.js',()=>({default:{hasSupervisees:vi.fn(async()=>true)}}));
vi.mock('../../../models/OrganizationAffiliation.model.js',()=>({default:{}}));
vi.mock('../../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[{id:20,is_active:1}])}}));
vi.mock('../../narrivaReview.service.js',()=>({latestNarrivaStatus:mocks.status}));
import {listNotesToSign} from '../../../controllers/notesToSign.controller.js';
beforeEach(()=>{
 vi.clearAllMocks();
 const rows=Array.from({length:51},(_,i)=>({id:i+1,clinical_note_id:i+101,agency_id:20,supervisor_user_id:7,client_id:1}));
 mocks.execute.mockImplementation(async sql=>sql.includes("SELECT id FROM clinical_note_signoffs")?[[{id:1}]]:sql.includes('FROM clinical_note_signoffs cns')?[rows]:[[{id:1,agency_id:20,full_name:'Synthetic Client'}]]);
 mocks.clinical.mockResolvedValue([rows.map(row=>({id:row.clinical_note_id,agency_id:20,client_id:1,metadata_json:'{}'}))]);
 mocks.status.mockResolvedValue(null);
});
it.each([false,true])('only the internal all-queue adapter can remove the 50-note page limit (%s)',async all=>{
 const json=vi.fn(),next=vi.fn();await listNotesToSign({user:{id:7},auricwellPreview:{agencyId:20},query:{notesIncludeAll:true},...(all?{notesIncludeAll:true}:{})},{json},next);
 expect(next).not.toHaveBeenCalled();expect(json.mock.calls[0][0].notes).toHaveLength(all?51:50);
 const [sql,params]=mocks.execute.mock.calls.find(([sql])=>sql.includes('FROM clinical_note_signoffs cns'));expect(params).toEqual([7,20]);expect(sql.includes('LIMIT 50')).toBe(!all);
});
