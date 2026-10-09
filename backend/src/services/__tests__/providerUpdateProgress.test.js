import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../providerYearUpdate.service.js',()=>({listSchoolAssignedProviders:vi.fn(async()=>[])}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolveSenderIdentityForSend:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../providerUpdateRecords.service.js',()=>({getProviderUpdateRecords:vi.fn()}));
vi.mock('../staffCommunicationChoices.service.js',()=>({getStaffCommunicationChoices:vi.fn()}));
vi.mock('../inboxDigest.service.js',()=>({getCommunicationPrefs:vi.fn(async()=>({}))}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({id:2,slug:'itsco'}))}}));
import pool from '../../config/database.js';
import {getRecipientBundle} from '../providerUpdate.service.js';
import {getProviderUpdateRecords} from '../providerUpdateRecords.service.js';
import {getStaffCommunicationChoices} from '../staffCommunicationChoices.service.js';
import {PROVIDER_UPDATE_SECTION_KEYS} from '../../constants/providerUpdateSections.js';
const keys=['specialties','notification_prefs'];
const config=Object.fromEntries(PROVIDER_UPDATE_SECTION_KEYS.map(k=>[k,keys.includes(k)]));
const recipient={id:1,push_id:2,provider_user_id:7,agency_id:2,previewOnly:true,section_config_json:config};
let progress;
beforeEach(()=>{vi.clearAllMocks();progress=[];pool.execute.mockImplementation(async sql=>sql.includes('provider_update_pushes')?[[{id:2,section_config_json:config}]]:sql.includes('provider_update_section_progress')?[progress]:[[]]);getProviderUpdateRecords.mockResolvedValue({schools:[],specialtyGroups:[],focusGroups:[{key:'specialties',options:['Anxiety','Depression','Grief']}],clinicalFocus:{top:{specialties:[]},excluded:{specialties:[]}}});getStaffCommunicationChoices.mockResolvedValue({needsReview:true,reviewedAt:null});});
it('keeps unanswered sections Not started without saving anything',async()=>{
 const bundle=await getRecipientBundle(recipient);
 expect(bundle.sections).toHaveLength(2);
 expect(bundle.sections.every(s=>s.status==='not_started'&&!s.completed)).toBe(true);
 expect(pool.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
});
it('preserves actual saved progress when required answers remain missing',async()=>{
 progress=keys.map(section_key=>({section_key,status:'in_progress',completed:0,data_json:{started:true}}));
 const bundle=await getRecipientBundle(recipient);
 expect(bundle.sections.every(s=>s.status==='in_progress'&&!s.completed)).toBe(true);
});
it('reopens prior completion when required selections or consent need review',async()=>{
 progress=keys.map(section_key=>({section_key,status:'completed',completed:1,data_json:{}}));
 const bundle=await getRecipientBundle(recipient);
 expect(bundle.sections.every(s=>s.status==='in_progress'&&!s.completed)).toBe(true);
 expect(bundle.progress.completed).toBe(0);
});
it('does not reopen finalized sections',async()=>{
 progress=keys.map(section_key=>({section_key,status:'completed',completed:1,data_json:{}}));
 const bundle=await getRecipientBundle({...recipient,locked_at:'2026-10-08'});
 expect(bundle.sections.every(s=>s.status==='completed'&&s.completed)).toBe(true);
});
