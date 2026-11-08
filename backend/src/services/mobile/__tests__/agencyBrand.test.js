import {expect,it} from 'vitest';
import {mobileAgencyIcon} from '../agencyBrand.service.js';
it('uses the actual compact agency marks in queue and messaging payloads',()=>{
 expect(mobileAgencyIcon({slug:'itsco'})).toBe('https://auricwell.com/email-signatures/staff-html/itsco-main-logo.png');
 expect(mobileAgencyIcon({name:'Next Level Up LLC'})).toBe('https://auricwell.com/email-signatures/staff-html/nlu-plus-one-mark.png');
 expect(mobileAgencyIcon({name:'The Inner Strength Institute'})).toBe('https://auricwell.com/assets/branding/innerstrength-icon.png');
 expect(mobileAgencyIcon({logo_url:'https://example.invalid/icon.png'})).toBe('https://example.invalid/icon.png');
});
