import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderSstc,pages} from '../render.mjs';
import {SSTC_SECTIONS,SSTC_LINKS,isSstcPublicHost,sstcMarketingPage,sstcPublicPaths} from '../routing.mjs';
import {publicSitePaths,publicSupportSlugFromHost} from '../../../utils/publicDomainRouting.js';
import {sstcNginxServer} from '../../../../scripts/build-sstc-website.mjs';
describe('Summit Stats public marketing website',()=>{
  it.each(SSTC_SECTIONS)('renders complete crawlable page %s, with canonical and real app links',section=>{
    const html = renderSstc(section);
    document.documentElement.innerHTML = html;
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('link[rel=canonical]').href).toBe(`https://summitstatstc.com/${section}`);
    expect(document.title).toContain('Summit Stats Team Challenge');
    expect(document.querySelector('meta[name=description]').content).toBe(pages[section].description);
    expect(document.querySelector('#main').textContent.length).toBeGreaterThan(600);
    expect(document.querySelectorAll(`a[href="${SSTC_LINKS.signup}"]`).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(`a[href="${SSTC_LINKS.login}"]`).length).toBeGreaterThan(0);
    expect(document.querySelector('.product-credit').href).toBe('https://plottwistco.com/');
    for (const a of document.querySelectorAll('a')) expect(a.getAttribute('href')).not.toMatch(/^#$/);
  });
  it.each(SSTC_SECTIONS)('makes joining an existing club visible in the navigation on %s', section => {
    document.documentElement.innerHTML = renderSstc(section);
    const link = document.querySelector('#main-nav .find-club-link');
    expect(link.textContent).toBe('Find a club');
    expect(link.href).toBe(SSTC_LINKS.clubs);
  });
  it('offers a direct join path at the top of How it works', () => {
    document.documentElement.innerHTML = renderSstc('how-it-works');
    expect(document.querySelector('.page-intro .actions a').href).toBe(SSTC_LINKS.clubs);
  });
  it('uses the published trial instead of inventing paid rates or a checkout',()=>{
    const html=renderSstc('pricing');
    expect(html).toContain('$0');expect(html).toContain('No credit card required');
    expect(html).toContain('Paid rates after the trial are not currently published');
    expect(html).not.toMatch(/\$\d+\s*\/\s*month|stripe\.com|buy\.stripe/);
    const source=readFileSync('src/views/ClubManagerSignupView.vue','utf8');
    expect(source).toContain('3 months of free, unlimited access');
  });
  it('labels examples, describes integrations accurately, and renders all tour panels without JS',()=>{
    const tour=renderSstc('tour');
    expect(tour).toContain('actual app interface');
    expect(tour).toContain('sample names, teams, and activities');
    document.documentElement.innerHTML = tour;
    for (const name of ['standings', 'activity', 'weekly']) {
      const image = document.querySelector(`[data-panel="${name}"] img`);
      expect(image.getAttribute('src')).toBe(`/assets/sstc/interface/${name}.png`);
      expect(image.closest('a').getAttribute('href')).toBe(image.getAttribute('src'));
      expect(readFileSync(`public/assets/sstc/interface/${name}.png`).length).toBeGreaterThan(1000);
    }
    expect(tour.match(/data-panel=/g)).toHaveLength(3);
    expect(tour).not.toContain('data-panel="activity" hidden');
    expect(renderSstc('features')).toContain('Direct Garmin integration is not currently available');
    expect(renderSstc('features')).toContain('where enabled');
  });
  it('gives the alias working relative navigation but a primary-domain canonical',()=>{
    const html=renderSstc('features',{base:'/p/sstc'});
    expect(html).toContain('href="/p/sstc/pricing"');
    expect(html).toContain('href="https://summitstatstc.com/features"');
    expect(()=>renderSstc('login')).toThrow();
  });
});
describe('Exact-host marketing routing without taking over the application',()=>{
  it.each(['summitstatstc.com','www.summitstatstc.com','SUMMITSTATSTC.COM:8080'])('recognizes %s',host=>{
    expect(isSstcPublicHost(host)).toBe(true);
    expect(publicSitePaths(host)).toBe(sstcPublicPaths);
    for(const section of SSTC_SECTIONS) {
      expect(sstcMarketingPage(host,`/${section}?campaign=club#top`)?.section).toBe(section);
      const path=`/${section}?campaign=club#top`;
      expect(sstcPublicPaths.clean(sstcPublicPaths.internal(path))).toBe(path);
    }
  });
  it.each(['/sstc','/sstc/login','/login','/sstc/signup/club-manager','/sstc/signup','/sstc/clubs','/sstc/clubs/12','/sstc/join?token=test#keep','/sstc/verify-club-manager-email?token=test','/sstc/challenges/42','/sstc/admin','/support','/sstc/support','/terms','/sstc/privacypolicy','/api/strava/callback?code=keep&state=keep','/assets/sstc/logo.png','/unknown-page'])('leaves app and non-marketing address unchanged: %s',path=>{
    expect(sstcMarketingPage('summitstatstc.com',path)).toBeNull();
    expect(sstcPublicPaths.internal(path)).toBe(path);
    expect(sstcPublicPaths.clean(path)).toBe(path);
  });
  it('does not replace another domain’s root or Summit Stats’ dedicated support',()=>{
    expect(SSTC_LINKS.support).toBe('https://summitstatstc.com/support');
    for (const host of ['plottwisthq.com','app.summitstatstc.com','summitstatstc.com.evil.example','www.itsco.health']) expect(sstcMarketingPage(host,'/')).toBeNull();
    expect(sstcMarketingPage('plottwisthq.com','/p/sstc/features')).toEqual({section:'features',base:'/p/sstc'});
    expect(publicSupportSlugFromHost('summitstatstc.com')).toBeNull();
  });
  it('generates an exact-host server and keeps non-marketing URLs on the existing SPA',()=>{
    const conf=sstcNginxServer();
    expect(conf).toContain('server_name summitstatstc.com www.summitstatstc.com;');
    for (const section of SSTC_SECTIONS) expect(conf).toContain(`location = /${section} {`);
    expect(conf).toContain('try_files /index.html =404;');
    expect(conf).not.toContain('location = /sstc/login');
    expect(conf).toContain('return 301 /$1$is_args$args;');
  });
});
