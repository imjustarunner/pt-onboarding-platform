import { expect, it } from 'vitest';
import { companyEventInvitationRedirect } from '../companyEventInvitationHost';
const path='/company-events/353/staff/abc';
it('upgrades old shared-host links to the server-supplied agency URL and retains the return location',()=>{
  expect(companyEventInvitationRedirect(`https://app.itsco.health${path}`,`https://plottwisthq.com${path}?attendance=checkout-time#event-check-in`)).toBe(`https://app.itsco.health${path}?attendance=checkout-time#event-check-in`);
});
it('does not redirect other agencies, local previews, different events, credentials or insecure URLs',()=>{
  for(const current of [`https://app.itsco.health${path}`,`http://localhost:5173${path}`])expect(companyEventInvitationRedirect(`https://app.itsco.health${path}`,current)).toBe('');
  for(const target of ['not a url',`http://app.itsco.health${path}`,`https://user:pass@app.itsco.health${path}`,'https://app.itsco.health/another-event'])expect(companyEventInvitationRedirect(target,`https://plottwisthq.com${path}`)).toBe('');
});
