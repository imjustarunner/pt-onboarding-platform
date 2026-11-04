import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(async sql=>sql.includes('INFORMATION_SCHEMA')?[[]]:[[]])}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
import User from '../User.model.js';
import {isPrivateFamilyProfile} from '../../utils/workplacePeople.js';
it('keeps FCC-only profiles out of both archived-inclusive directories and direct staff profile lookups',async()=>{
 await User.findAll(true);await User.findById(12);
 const queries=m.execute.mock.calls.map(([s])=>s).filter(s=>!s.includes('INFORMATION_SCHEMA'));
 expect(queries.filter(s=>s.includes('FROM users')).every(s=>s.includes("NOT LIKE '%@members.invalid'"))).toBe(true);
 expect(isPrivateFamilyProfile({email:'family-123@members.invalid'})).toBe(true);
 expect(isPrivateFamilyProfile({email:'parent@itsco.health'})).toBe(false);
});
it('excludes assistant accounts from human rosters while preserving direct login identity lookup',async()=>{
 m.execute.mockClear();
 await User.findAll(true); await User.findById(81);
 const roster=m.execute.mock.calls.map(([s])=>s).find(s=>s.includes('LEFT JOIN user_agencies'));
 const identity=m.execute.mock.calls.map(([s])=>s).find(s=>s.includes('FROM users WHERE id'));
 expect(roster).toContain("COALESCE(u.role,'') <> 'assistant'");
 expect(roster).toContain('COALESCE(u.is_assistant_account,0)=0');
 expect(identity).not.toContain('is_assistant_account,0');
});
