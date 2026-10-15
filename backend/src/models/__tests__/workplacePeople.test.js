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
