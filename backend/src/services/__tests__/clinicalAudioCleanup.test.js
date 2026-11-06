import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),remove:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../storage.service.js',()=>({default:{getGCSStorage:async()=>({bucket:()=>({file:()=>({delete:m.remove})})})}}));
import {queueClinicalAudioCleanup,readyClinicalAudioCleanup,retryClinicalAudioCleanup} from '../clinicalAudioCleanup.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.remove.mockResolvedValue({});});
describe('temporary clinical audio cleanup responsibility',()=>{
 it('registers only random object keys and grants a crash-recovery lease',async()=>{await queueClinicalAudioCleanup('private-test','clinical_audio/abcdef123456');expect(m.execute.mock.calls[0][0]).toContain('INTERVAL 2 HOUR');await expect(queueClinicalAudioCleanup('private-test','Client Name/audio.wav')).rejects.toThrow(/Invalid/);});
 it('makes failed deletion immediately eligible for retry without storing the body',async()=>{await readyClinicalAudioCleanup('private-test','clinical_audio/abcdef');expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('available_at=UTC_TIMESTAMP()'),['private-test','clinical_audio/abcdef']);});
 it('deletes only ready/expired objects and removes successful cleanup jobs',async()=>{m.execute.mockResolvedValueOnce([[{id:4,bucket_name:'private-test',object_key:'clinical_audio/abcdef'}]]);await retryClinicalAudioCleanup();expect(m.execute.mock.calls[0][0]).toContain('available_at<=UTC_TIMESTAMP()');expect(m.remove).toHaveBeenCalledWith({ignoreNotFound:true});expect(m.execute).toHaveBeenCalledWith('DELETE FROM clinical_audio_cleanup_jobs WHERE id=?',[4]);});
 it('retains failed cleanup responsibility for the next maintenance pass',async()=>{m.execute.mockResolvedValueOnce([[{id:4,bucket_name:'private-test',object_key:'clinical_audio/abcdef'}]]);m.remove.mockRejectedValue(new Error('Storage unavailable'));await retryClinicalAudioCleanup();expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('attempts=attempts+1'),[4]);expect(m.execute.mock.calls.some(([s])=>s.startsWith('DELETE'))).toBe(false);});
});
