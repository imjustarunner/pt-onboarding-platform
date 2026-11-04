import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),hangup:vi.fn(),connect:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../video.service.js',()=>({createOrGetMeetingRoom:vi.fn()}));
vi.mock('../chatEncryption.service.js',()=>({encryptChatText:vi.fn()}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:vi.fn()}));
vi.mock('../meetingDialInContext.service.js',()=>({dialInContext:vi.fn(),admitDialInUser:vi.fn(),dialInSchema:vi.fn()}));
vi.mock('../meetingDialInTransport.service.js',()=>({dialInTransport:{hangup:m.hangup,connect:m.connect},unavailableCall:()=>[{action:'talk',text:'Unavailable'}],pinPrompt:vi.fn(),hostPrompt:vi.fn(),callConversation:vi.fn()}));
import { personalDialIn,answerDialIn,enterDialInPin,chooseDialInHostOption,reconcileDialInCall,dialInCallEvent,endMeetingDialIn,endDialInCall,runMeetingDialInTick } from '../meetingDialIn.service.js';
beforeEach(()=>{vi.stubEnv('MEETING_DIAL_IN_ENABLED','true');vi.stubEnv('MEETING_DIAL_IN_VOICE_APPLICATION_ID','');vi.stubEnv('VONAGE_APPLICATION_ID','office-only');Object.values(m).forEach(fn=>fn.mockReset());});
afterEach(()=>vi.unstubAllEnvs());
describe('telephone feature without dedicated Voice assets',()=>{
  it('does not create invitations, change calls, reconcile rows, or touch the office carrier',async()=>{
    const id='01234567-1234-4234-8234-012345678901';
    expect(await personalDialIn('supervision',5,7)).toBeNull();
    for(const fn of [answerDialIn,enterDialInPin,chooseDialInHostOption])expect(await fn({uuid:id})).toEqual([{action:'talk',text:'Unavailable'}]);
    await reconcileDialInCall(id);await dialInCallEvent({uuid:id,status:'completed'});await endDialInCall(id);await endMeetingDialIn('supervision',5);await runMeetingDialInTick();
    expect(m.execute).not.toHaveBeenCalled();expect(m.getConnection).not.toHaveBeenCalled();expect(m.hangup).not.toHaveBeenCalled();expect(m.connect).not.toHaveBeenCalled();
  });
});
