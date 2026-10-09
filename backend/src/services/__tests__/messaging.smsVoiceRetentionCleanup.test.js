import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[{affectedRows:0}])}}));
import pool from '../../config/database.js';
import Cleanup from '../smsVoiceRetentionCleanup.service.js';
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();vi.clearAllMocks();});
it('uses three calendar years for routine calls and preserves clinical records and voicemail',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));vi.stubEnv('SMS_VOICE_RETENTION_DAYS','365');
 const result=await Cleanup.run();expect(result.callLogCutoff).toBe('2023-10-08 12:00:00');
 const calls=pool.execute.mock.calls;
 expect(calls.some(([sql])=>sql.startsWith('DELETE FROM call_voicemails'))).toBe(false);
 for(const [sql] of calls.filter(([sql])=>sql.startsWith('DELETE FROM call_logs')||sql.startsWith('DELETE FROM message_logs'))){expect(sql).toContain('client_id IS NULL');expect(sql).toContain('legalHold');expect(sql).toContain('retentionHold');}
 expect(calls[0][0]).toContain('NOT EXISTS');expect(calls[0][1]).toEqual(['2023-10-08 12:00:00']);
});
it('preserves an existing no-purge setting',async()=>{vi.stubEnv('SMS_VOICE_RETENTION_DAYS','0');expect((await Cleanup.run()).skipped).toBe(true);expect(pool.execute).not.toHaveBeenCalled();});
