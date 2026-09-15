import {describe,it,expect} from 'vitest';
import {publicTicketOriginalInquiry,websiteTicket,ticketAgencyColor,ticketAgencyLogo} from '../publicTicketPresentation';
describe('website ticket history',()=>{
 it('keeps the original message visible when no follow-up rows exist',()=>expect(publicTicketOriginalInquiry({question:'My original inquiry'},[])).toBe('My original inquiry'));
 it('avoids duplicating an already-present original message',()=>expect(publicTicketOriginalInquiry({question:'Question'},[{body:'Question',is_internal:false}])).toBe(''));
 it('does not hide an inquiry because an internal note repeats it',()=>expect(publicTicketOriginalInquiry({question:'Question'},[{body:'Question',is_internal:true}])).toBe('Question'));
 it('labels historical and new website tickets',()=>{expect(websiteTicket({source_channel:'public_web'})).toBe(true);expect(websiteTicket({created_by_source_key:'public_school_referral'})).toBe(true);expect(websiteTicket({source_channel:'email'})).toBe(false);});
 it('uses website identity ahead of central support identity',()=>{expect(ticketAgencyColor({website_color:'#123456',agency_color_palette:{primary:'#abcdef'}})).toBe('#123456');expect(ticketAgencyLogo({website_logo_url:'/assets/rise/logo.webp',agency_logo_path:'uploads/hq.png'})).toBe('/assets/rise/logo.webp');});
 it('rejects unsafe logo URLs and CSS color values',()=>{expect(ticketAgencyLogo({agency_logo_url:'javascript:alert(1)'})).toBe('');expect(ticketAgencyColor({website_color:'url(https://invalid)'})).toMatch(/^#[a-f0-9]{6}$/);});
});
