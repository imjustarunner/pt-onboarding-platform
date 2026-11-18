import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/ClientNotes.model.js',()=>({default:{create:vi.fn()}}));
vi.mock('../completedIntakeRecord.service.js',()=>({buildCompletedIntakeRecord:vi.fn()}));
vi.mock('../sessionAiPrivacy.service.js',()=>({callPrivateSessionText:vi.fn()}));
import ClientNotes from '../../models/ClientNotes.model.js';
import { buildCompletedIntakeRecord } from '../completedIntakeRecord.service.js';
import { callPrivateSessionText } from '../sessionAiPrivacy.service.js';
import { persistIntakeClinicianSummaries } from '../intakeClinicianSummary.service.js';
beforeEach(()=>{vi.clearAllMocks();buildCompletedIntakeRecord.mockReturnValue({sections:[{title:'Who this packet is for',rows:[{label:'Name',value:'IDENTITY_SENTINEL'}]},{title:'Clinical interview',rows:[{label:'Current concerns',value:'Reported sleep disruption'},{label:'Email',value:'PRIVATE_EMAIL_SENTINEL'}]}]});callPrivateSessionText.mockResolvedValue({text:'Protected clinician briefing'});});
it('routes enrollment briefings through the protected writer with clinical answers and valid screening details',async()=>{
 await persistIntakeClinicianSummaries({agency:{id:2},link:{},submission:{id:3,intake_data:{clinicalResponses:{phq9_1:1}}},clientIds:[4]});
 const prompt=callPrivateSessionText.mock.calls[0][0].prompt;
 expect(prompt).toContain('Reported sleep disruption');expect(prompt).toContain('incomplete');expect(prompt).not.toContain('IDENTITY_SENTINEL');expect(prompt).not.toContain('PRIVATE_EMAIL_SENTINEL');
 expect(ClientNotes.create).toHaveBeenCalledWith(expect.objectContaining({client_id:4,is_internal_only:true,message:expect.stringContaining('Protected clinician briefing')}),expect.any(Object));
});
it('uses a review pointer when privacy is unavailable and does not log source text from provider errors',async()=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});callPrivateSessionText.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR_SENTINEL'));
 await persistIntakeClinicianSummaries({submission:{id:3,intake_data:{}},clientIds:[4]});
 expect(ClientNotes.create.mock.calls[0][0].message).toContain('Review the completed packet');expect(JSON.stringify(warning.mock.calls)).not.toContain('PRIVATE_PROVIDER_ERROR_SENTINEL');warning.mockRestore();
});
