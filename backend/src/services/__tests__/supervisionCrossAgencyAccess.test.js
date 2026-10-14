import { beforeEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
import { hasActiveSupervisionMembership, canJoinSupervision } from '../meetingJoinPolicy.service.js';
const session={id:1,agency_id:2,meeting_settings_json:{audienceAgencyIds:[2,3]}};
beforeEach(()=>{m.execute.mockReset();});
it('allows an explicitly invited active member of a selected agency',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT 1 FROM users')?[[]]:sql.startsWith('SELECT org.id')?[[{id:3}]]:sql.includes('SELECT status')?[[{status:'INVITED'}]]:[[{user_id:7}]]);
 expect(await canJoinSupervision(session,7)).toBe(true);
});
it('never grants cross-agency access merely for sharing an affiliation',async()=>{
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT org.id')?[[{id:3}]]:[[]]);
 expect(await hasActiveSupervisionMembership(session,7)).toBe(false);
});
it('revokes access when membership is removed or the invite is withdrawn',async()=>{
 m.execute.mockResolvedValue([[]]);expect(await canJoinSupervision(session,7)).toBe(false);
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT 1 FROM users')?[[{ok:1}]]:sql.includes('SELECT status')?[[{status:'WITHDRAWN'}]]:[[]]);
 expect(await canJoinSupervision(session,7)).toBe(false);
});
