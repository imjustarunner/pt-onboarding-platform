import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({summary:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clientExchangeSummary.service.js',()=>({loadClientExchangeSummary:mocks.summary}));
import {saveStaffExchangePreferences} from '../clientExchangeStaffPreferences.service.js';
const input={modality:'in_person',serviceLocation:'Colorado Springs',insurance:'Self-pay',schedule:{days:['Monday'],periods:['afternoon'],timezone:'America/Denver'},concerns:'Stress management'};
function database(){const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT')?[[{id:4,agency_id:450}]]:[{affectedRows:1}])};return {db,getConnection:async()=>db};}
const options=overrides=>({clientId:4,agencyId:450,actor:{id:7,role:'support'},input:{...input,...overrides}});
const value=(db,key)=>JSON.parse(db.execute.mock.calls.find(([sql])=>sql.includes(`'$.${key}'`))[1][0]);
beforeEach(()=>{mocks.summary.mockResolvedValue({presentingProblems:['Existing clinical source'],preferences:{schedule:{...input.schedule,notes:'Restricted scheduling note'}}});});
it('preserves withheld notes and writes the prepared concern separately from the source intake',async()=>{
 const storage=database();await saveStaffExchangePreferences(options(),storage);
 expect(value(storage.db,'exchangeSchedule').notes).toBe('Restricted scheduling note');expect(value(storage.db,'exchangeMatchingConcern')).toBe('Stress management');
 expect(storage.db.execute.mock.calls.some(([sql])=>sql.includes("'$.presentingConcern'")||sql.includes("'$.exchangeMatchingScheduleNotes'"))).toBe(false);expect(storage.db.commit).toHaveBeenCalledOnce();
});
it('saves explicit replacement or cleared scheduling notes for the next reload',async()=>{
 for(const notes of ['After work','']){const storage=database();await saveStaffExchangePreferences(options({schedule:{...input.schedule,notes}}),storage);expect(value(storage.db,'exchangeMatchingScheduleNotes')).toBe(notes);expect(value(storage.db,'exchangeSchedule').notes||'').toBe(notes);}
});
it('does not mark unchanged prefilled source notes as shareable to Support',async()=>{
 const storage=database();await saveStaffExchangePreferences(options({schedule:{...input.schedule,notes:'Restricted scheduling note'}}),storage);
 expect(value(storage.db,'exchangeSchedule').notes).toBe('Restricted scheduling note');
 expect(storage.db.execute.mock.calls.some(([sql])=>sql.includes("'$.exchangeMatchingScheduleNotes'"))).toBe(false);
});
it('rejects missing structured times without writing changes',async()=>{
 const storage=database();await expect(saveStaffExchangePreferences(options({schedule:{days:['Monday'],notes:'Afternoon'}}),storage)).rejects.toThrow();
 expect(storage.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(storage.db.rollback).toHaveBeenCalledOnce();
});
