import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../../services/api',()=>({default:{post:m.post}}));
import { reportSupervisionConnection } from '../supervisionConnectionDiagnostics.js';
beforeEach(()=>{vi.clearAllMocks();m.post.mockResolvedValue({});});
it('sends only bounded microphone state and excludes identifying device and media information',()=>{
 reportSupervisionConnection(1063,'microphone-problem',{reason:'capture-stalled',microphoneOn:true,processingMode:'basic',deviceId:'private-id',deviceLabel:'private-name',media:'private-audio'});
 expect(m.post).toHaveBeenCalledWith('/supervision/sessions/1063/connection-events',expect.objectContaining({event:'microphone-problem',reason:'capture-stalled',microphoneOn:true,processingMode:'basic'}),expect.any(Object));
 expect(JSON.stringify(m.post.mock.calls)).not.toContain('private');
});
it('omits invalid microphone state and never retries a failed diagnostic request',async()=>{
 m.post.mockRejectedValue(new Error('offline'));
 reportSupervisionConnection(1063,'microphone-recovery-failed',{microphoneOn:'yes',processingMode:'private-device'});
 await Promise.resolve();
 expect(m.post).toHaveBeenCalledOnce();expect(m.post.mock.calls[0][1]).toMatchObject({microphoneOn:undefined,processingMode:undefined});
});
