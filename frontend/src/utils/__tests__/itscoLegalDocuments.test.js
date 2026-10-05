import { describe, it, expect } from 'vitest';
import { isItscoLegalContext } from '../itscoLegalContext.js';
import { itscoPublicResponse, itscoSitemap } from '../itscoPublicSeo.js';
import { renderItscoLegalHtml } from '../itscoLegalHtml.js';
import { itscoLegalLinks } from '../../content/itscoLegalDocuments.js';

describe('ITSCO policy delivery and tenant isolation', () => {
  it('uses the explicit tenant before host or theme identity', () => {
    expect(isItscoLegalContext({host:'www.itsco.health',organizationSlug:'nlu'})).toBe(false);
    expect(isItscoLegalContext({host:'app.plottwistco.com',organizationSlug:'itsco'})).toBe(true);
    expect(isItscoLegalContext({host:'app.itsco.health'})).toBe(true);
    expect(isItscoLegalContext({host:'itsco.health.evil.example'})).toBe(false);
    expect(isItscoLegalContext({host:'auricwell.com'})).toBe(false);
  });
  it.each(itscoLegalLinks)('serves $type with full readable content and working anchors', ({type,path}) => {
    expect(itscoPublicResponse('www.itsco.health',path)).toMatchObject({status:200,noindex:false,canonical:`https://www.itsco.health${path}`});
    expect(itscoSitemap()).toContain(`https://www.itsco.health${path}`);
    const parsed = new DOMParser().parseFromString(renderItscoLegalHtml(type),'text/html');
    expect(parsed.querySelectorAll('iframe,script')).toHaveLength(0);
    expect(parsed.querySelector('h1').textContent).toContain('ITSCO');
    expect(parsed.body.textContent.length).toBeGreaterThan(4000);
    for (const anchor of parsed.querySelectorAll('a[href^="#"]')) expect(parsed.getElementById(anchor.getAttribute('href').slice(1))).not.toBeNull();
    expect(parsed.body.innerHTML).not.toContain('docs.google.com');
    expect(parsed.querySelector('link[rel=canonical]').getAttribute('href')).toBe(`https://www.itsco.health${path}`);
  });
  it.each([['/terms','/itsco/terms'],['/privacy','/itsco/privacypolicy'],['/hipaa','/itsco/platformhipaa']])('redirects %s to the ITSCO notice', (from,to) => {
    expect(itscoPublicResponse('www.itsco.health',`${from}?ref=sms`)).toEqual({status:301,redirect:`https://www.itsco.health${to}?ref=sms`});
    expect(itscoPublicResponse('app.nextleveluplcc.com',from)).toBeNull();
  });
});
