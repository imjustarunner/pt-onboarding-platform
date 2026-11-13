import { expect, it } from 'vitest';
import { companyEventInvitationRedirect } from '../companyEventInvitationHost';
import { auricWellAccountDestination } from '../familyPortalContext';
import { isLoginEntryRoute } from '../loginHandoff';
const path='/conversa/events/itsco/denver-potluck-353';
const canonical='https://auricwell.com'+path;
it('moves legacy agency/platform links to the one central page and keeps attendance location',()=>{
 for(const host of ['app.itsco.health','plottwisthq.com','auricwell.com'])expect(companyEventInvitationRedirect(canonical,`https://${host}/company-events/353/staff/abc?attendance=checkout-time#event-check-in`)).toBe(canonical+'?attendance=checkout-time#event-check-in');
});
it('keeps a personal invitation token and the requested RSVP through a legacy-link redirect',()=>{
 expect(companyEventInvitationRedirect(canonical+'?invitation=verified','https://app.itsco.health/event-rsvp/verified?r=yes')).toBe(canonical+'?r=yes&invitation=verified');
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
