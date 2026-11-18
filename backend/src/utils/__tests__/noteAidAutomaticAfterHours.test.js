import {it,expect} from 'vitest';
import {resolveNoteAidBillingCodes} from '../noteAidBillingAddons.js';
it('automatically includes 99051 for a Sunday in the saved source timezone',()=>{
 const result=resolveNoteAidBillingCodes({primaryCode:'90837',durationMinutes:60,sessionStartAt:'2026-11-15T16:00:00Z',timeZone:'America/Denver',includeAfterHours99051:false});
 expect(result.addons).toContainEqual({code:'99051',units:1});
});
it.each([{sessionStartAt:'2026-11-17T16:00:00Z',timeZone:'America/Denver'},{sessionStartAt:'2026-11-15T16:00:00Z'},{sessionStartAt:'2026-11-15',timeZone:'America/Denver'}])('does not trust an add-on toggle without a qualifying saved schedule: %j',schedule=>{
 expect(resolveNoteAidBillingCodes({primaryCode:'90837',durationMinutes:60,includeAfterHours99051:true,...schedule}).addons).not.toContainEqual({code:'99051',units:1});
});
it('does not add after-hours billing to a pro-bono service',()=>{
 expect(resolveNoteAidBillingCodes({primaryCode:'90837',sessionStartAt:'2026-11-15T16:00:00Z',timeZone:'America/Denver',metadata:{fundingDisposition:'pro_bono'}}).addons).toEqual([]);
});
