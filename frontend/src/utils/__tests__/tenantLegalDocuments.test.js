import { describe, it, expect } from 'vitest';
import { tenantLegalProfiles, legalProfileForContext, tenantLegalLinks } from '../../content/tenantLegalProfiles.js';
import { legalDocumentsForProfile } from '../../content/tenantLegalDocuments.js';
import { renderItscoLegalHtml } from '../itscoLegalHtml.js';
import { tenantLegalRequest, legalRouteEntries } from '../tenantLegalRoutes.js';
describe('branded policy sets',()=>{
  it.each(Object.values(tenantLegalProfiles))('$name has isolated identity, contacts, and document links',profile=>{
    const docs=legalDocumentsForProfile(profile);
    for(const {type,path} of tenantLegalLinks(profile)) {
      const html=renderItscoLegalHtml(type,profile);
      const document=new DOMParser().parseFromString(html,'text/html');
      expect(document.querySelector('h1').textContent).toContain(profile.name);
      expect(document.querySelector('link[rel=canonical]').getAttribute('href')).toBe(profile.origin+path);
      expect(document.querySelector('article').textContent.length).toBeGreaterThan(2000);
      expect(document.querySelectorAll('iframe,script')).toHaveLength(0);
      if(profile.slug!=='itsco') {
        expect(html).not.toMatch(/PO@ITSCO|support@itsco|www\.itsco\.health|ITSCO, LLC/);
      }
      for(const a of document.querySelectorAll('a[href^="#"]'))expect(document.getElementById(a.getAttribute('href').slice(1))).not.toBeNull();
    }
    expect(docs.platformhipaa.title.includes('Notice of Privacy Practices')).toBe(profile.kind==='healthcare');
    const routes=legalRouteEntries(profile).map(r=>r.path);expect(new Set(routes).size).toBe(routes.length);
  });
  it('resolves marketing paths and app aliases without using another tenant’s identity',()=>{
    expect(legalProfileForContext({host:'app.nextleveluplcc.com'}).slug).toBe('nlu');
    expect(legalProfileForContext({host:'app.itsco.health',organizationSlug:'nlu'}).slug).toBe('nlu');
    expect(legalProfileForContext({host:'app.plottwistco.com',path:'/p/rise/privacy'}).slug).toBe('rise');
    expect(legalProfileForContext({host:'auricwell.com.evil.example'})).toBeNull();
    expect(legalProfileForContext({host:'app.itsco.health',organizationSlug:'unknown'})).toBeNull();
  });
  it('serves tenant-specific public notices and preserves query strings on redirects',()=>{
    expect(tenantLegalRequest('nextleveluplcc.com','/privacy?ref=sms')).toMatchObject({type:'privacypolicy',redirect:'https://nextleveluplcc.com/nlu/privacypolicy?ref=sms'});
    expect(tenantLegalRequest('nextleveluplcc.com','/nlu/terms')).toMatchObject({type:'terms',redirect:null});
    expect(tenantLegalRequest('app.nextleveluplcc.com','/terms')).toBeNull();
    expect(tenantLegalRequest('nextleveluplcc.com','/itsco/terms')).toBeNull();
  });
});
