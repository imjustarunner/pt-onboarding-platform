import { expect, it, vi } from 'vitest';
const m=vi.hoisted(() => ({user:vi.fn(),join:vi.fn().mockResolvedValue(true)}));
vi.mock('../../config/database.js',() => ({default:{execute:async sql => sql.includes('FROM users') ? [[await m.user()]] : [[{admitted:1}]]}}));
vi.mock('../../models/User.model.js',() => ({default:{findById:m.user}}));
vi.mock('../../models/SupervisionSession.model.js',() => ({default:{findById:async() => ({id:1,supervisor_user_id:501,modality:'VIRTUAL',status:'SCHEDULED'})}}));
vi.mock('../meetingJoinPolicy.service.js',() => ({canJoinSupervision:m.join}));
vi.mock('../meetingEndPermission.service.js',() => ({assertMeetingEndAllowed:vi.fn()}));
vi.mock('../groupSupervisionConsent.service.js',() => ({isGroupSupervision:vi.fn(),acceptGroupTranscriptionConsent:vi.fn()}));
vi.mock('../../controllers/counselingRecordingConsent.controller.js',() => ({clientRecordingContext:vi.fn()}));
vi.mock('../meetingTranscription.service.js',() => ({transcriptionState:vi.fn(),controlTranscription:vi.fn(),appendMeetingAudio:vi.fn()}));
import { meetingTranscriptionContext } from '../../controllers/meetingTranscription.controller.js';
import { normalizeSupervisionSpeakerLabels, supervisionSpeakerLabel } from '../../utils/supervisionSpeakerLabels.js';
it('uses preferred names and roles, never the account ID as a display name',() => {
  expect(supervisionSpeakerLabel({id:501,first_name:'Lauryn',preferred_name:'Ryn',last_name:'Pantoya'})).toBe('Supervisee · Ryn Pantoya');
  expect(supervisionSpeakerLabel({id:501},'Supervisor')).toBe('Supervisor');
});
it('repairs legacy labels without changing clinical numbers or inventing unknown names',() => {
  expect(normalizeSupervisionSpeakerLabels('[Supervisor · 501] Reviewed 501 cases. [Supervisee · 567] Discussed follow-up.',[{id:501,first_name:'Michael',last_name:'Mendez'}]))
    .toBe('[Supervisor · Michael Mendez] Reviewed 501 cases. [Supervisee] Discussed follow-up.');
});
it('resolves authenticated ID-only login data from the actual participant profile',async() => {
  m.user.mockResolvedValue({id:501,first_name:'Michael',last_name:'Mendez'});
  expect(await meetingTranscriptionContext({params:{id:1},user:{id:501}})).toMatchObject({speakerLabel:'Supervisor · Michael Mendez',speakerKey:'user-501'});
  m.user.mockResolvedValue({id:567,first_name:'Lauryn',preferred_name:'Ryn',last_name:'Pantoya'});
  expect(await meetingTranscriptionContext({params:{id:1},user:{id:567}})).toMatchObject({speakerLabel:'Supervisee · Ryn Pantoya'});
});
