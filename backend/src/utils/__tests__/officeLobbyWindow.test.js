import {it,expect} from 'vitest';
import {lobbyHour,lobbySlot} from '../officeLobbyWindow.js';
const event={id:4,start_at:'2026-09-30 20:00:00',end_at:'2026-10-01 00:00:00',assigned_provider_id:8};
it.each([['2026-09-30T20:30:59Z','2026-09-30T20:00:00.000Z'],['2026-09-30T20:31:00Z','2026-09-30T21:00:00.000Z'],['2026-09-30T21:30:59Z','2026-09-30T21:00:00.000Z'],['2026-09-30T21:31:00Z','2026-09-30T22:00:00.000Z']])('selects the correct hour at %s',(now,target)=>expect(new Date(lobbyHour(Date.parse(now))).toISOString()).toBe(target));
it('allows only the selected current hour from a multi-hour allocation',()=>{
 const slot=lobbySlot(event,{now:Date.parse('2026-09-30T20:45:00Z')});expect(slot.startAt).toBe('2026-09-30 15:00:00');expect(slot.assigned).toBe(true);
 expect(lobbySlot({...event,start_at:'2026-09-30 23:00:00'},{now:Date.parse('2026-09-30T20:45:00Z')})).toBeNull();
});
it('makes next hour an explicit early-arrival choice',()=>{const now=Date.parse('2026-09-30T20:45:00Z');expect(lobbySlot(event,{now,nextHour:true}).startAt).toBe('2026-09-30 16:00:00');});
it('uses linked session start times precisely',()=>{const now=Date.parse('2026-09-30T22:00:00Z');expect(lobbySlot({...event,start_at:'2026-09-30 22:30:00',client_id:10},{now}).startAt).toBe('2026-09-30 16:30:00');});
it('rejects ended or invalid allocations',()=>{expect(lobbySlot(event,{now:Date.parse('2026-10-01T02:00:00Z')})).toBeNull();expect(lobbySlot({start_at:'bad',end_at:'bad'})).toBeNull();});
