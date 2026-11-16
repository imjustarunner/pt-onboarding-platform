import { expect, it } from 'vitest';
import { companyEventInvitationRedirect, companyEventPageHref } from '../companyEventInvitationHost';
import { auricWellAccountDestination } from '../familyPortalContext';
import { isLoginEntryRoute } from '../loginHandoff';
const path='/conversa/events/itsco/denver-potluck-353';
const canonical='https://auricwell.com'+path;
it('keeps the current portal session when normalizing legacy links and retains attendance location',()=>{
 for(const host of ['app.itsco.health','plottwisthq.com','auricwell.com'])expect(companyEventInvitationRedirect(canonical,`https://${host}/company-events/353/staff/abc?attendance=checkout-time#event-check-in`)).toBe(`https://${host}${path}?attendance=checkout-time#event-check-in`);
});
it('keeps a personal invitation token and the requested RSVP through a legacy-link redirect',()=>{
 expect(companyEventInvitationRedirect(canonical+'?invitation=verified','https://app.itsco.health/event-rsvp/verified?r=yes')).toBe('https://app.itsco.health'+path+'?r=yes&invitation=verified');
});
it('does not bounce a canonical URL and rejects other origins or non-event paths',()=>{
 expect(companyEventInvitationRedirect(canonical,canonical+'?r=yes#event-polls-title')).toBe('');
 for(const target of ['not a url',`http://auricwell.com${path}`,`https://user:pass@auricwell.com${path}`,'https://outside.example'+path,'https://auricwell.com/app'])expect(companyEventInvitationRedirect(target,'https://app.itsco.health/company-events/353/staff/abc')).toBe('');
});
it('keeps staff and administrator sign-ins returning to the event rather than the clinical workspace',()=>{
 expect(isLoginEntryRoute({name:'ConversaLogin'})).toBe(true);
 for(const role of ['provider','admin','super_admin','client_guardian'])expect(auricWellAccountDestination({hostname:'auricwell.com',role,organizations:[],redirectPath:path})).toBeNull();
 expect(auricWellAccountDestination({hostname:'auricwell.com',role:'super_admin',organizations:[],redirectPath:'/app'})).toMatchObject({path:'/app',hardNavigate:true});
});

it('uses the readable path for in-app links without changing shared invitation URLs',()=>{
 expect(companyEventPageHref(canonical+'?r=yes#event-potluck')).toBe(path+'?r=yes#event-potluck');
 expect(companyEventPageHref('/company-events/353/staff/private')).toBe('/company-events/353/staff/private');
 expect(companyEventPageHref('https://other.example/something')).toBe('https://other.example/something');
 expect(companyEventInvitationRedirect(canonical,'https://app.itsco.health'+path+'?r=yes#event-potluck')).toBe('');
});
