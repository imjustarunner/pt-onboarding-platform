import {it,expect,vi} from 'vitest';
vi.mock('../../config/config.js',()=>({default:{jwt:{secret:'test-only-calendar-secret'}}}));
import {interviewCalendarReference,interviewCalendarEventId,interviewCalendarJoinUrl} from '../interviewCalendarLink.js';
it('creates a calendar reference that cannot identify the candidate',()=>{const ref=interviewCalendarReference(42);expect(ref).not.toContain('personal');expect(interviewCalendarEventId(ref)).toBe(42);expect(interviewCalendarJoinUrl('https://tenant.example/join/team-meeting/candidate-personal-token',42)).toBe('https://tenant.example/join/team-meeting/'+ref);});
it('rejects tampering, other meetings and unsigned IDs',()=>{const ref=interviewCalendarReference(42);expect(interviewCalendarEventId(ref.replace('c-42-','c-43-'))).toBeNull();expect(interviewCalendarEventId('42')).toBeNull();expect(interviewCalendarEventId('c-42-'+'a'.repeat(43))).toBeNull();});
