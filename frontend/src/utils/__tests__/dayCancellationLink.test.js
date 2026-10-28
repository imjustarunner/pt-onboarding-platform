import { expect,it } from 'vitest';
import {dayCancellationLinkContext} from '../dayCancellationLink.js';
it('requires the intended signed-in provider, exact date and agency',()=>{
 const q={cancelDay:'2026-10-28',providerId:'505',agencyId:'2'};
 expect(dayCancellationLinkContext(q,505)).toEqual({date:q.cancelDay,providerId:505,agencyId:2});
 expect(dayCancellationLinkContext(q,506).error).toContain('another provider');
 expect(dayCancellationLinkContext({...q,cancelDay:'2026-02-30'},505).error).toContain('incomplete');
 expect(dayCancellationLinkContext({...q,agencyId:'bad'},505).error).toContain('incomplete');
 expect(dayCancellationLinkContext({},505)).toBeNull();
});
