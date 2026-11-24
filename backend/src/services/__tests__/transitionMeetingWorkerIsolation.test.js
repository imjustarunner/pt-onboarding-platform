import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({connection:vi.fn(),gate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:mocks.connection}}));
vi.mock('../schedulingWorkerGate.js',()=>({canRunMeetingPhoneMaintenance:mocks.gate}));
vi.mock('../transitionWorkspace.service.js',()=>({transitionWorkspaceData:vi.fn()}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:vi.fn()}));
import {processTransitionSequence} from '../transitionMeetingSequenceLive.service.js';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('does not touch sequence state or dispatch from an unverified HTTP revision',async()=>{
 vi.stubEnv('K_REVISION','retired-preview-revision');mocks.gate.mockResolvedValue(false);
 expect(await processTransitionSequence()).toEqual({inactiveRevision:true});
 expect(mocks.gate).toHaveBeenCalledOnce();expect(mocks.connection).not.toHaveBeenCalled();
});
it('holds all dispatch if the production-revision authority cannot be checked',async()=>{
 vi.stubEnv('K_REVISION','unverified-revision');mocks.gate.mockRejectedValue(new Error('authority unavailable'));
 await expect(processTransitionSequence()).rejects.toThrow('authority unavailable');
 expect(mocks.connection).not.toHaveBeenCalled();
});
