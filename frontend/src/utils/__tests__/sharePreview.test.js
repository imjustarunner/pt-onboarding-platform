import { describe, expect, it } from 'vitest';
import { buildShareMeta, injectShareMetaIntoHtml } from '../sharePreview.js';

describe('sharePreview', () => {
  it('gives ITSCO support links a real title and image instead of Portal', () => {
    const meta = buildShareMeta({
      host: 'app.itsco.health',
      path: '/support',
      proto: 'https'
    });
    expect(meta.name).toBe('ITSCO');
    expect(meta.title).toMatch(/ITSCO/);
    expect(meta.title).toMatch(/Support/);
    expect(meta.image).toBe('https://app.itsco.health/api/public/share-preview/image?path=%2Fsupport');
    expect(meta.title).not.toMatch(/Portal/);
  });

  it('injects crawler tags into the SPA shell', () => {
    const html = `<html><head><title>Portal</title>
    <meta property="og:title" content="Portal">
    <meta name="description" content="Care, scheduling, billing, and support.">
    <meta property="og:image" content="https://plottwisthq.com/api/public/share-preview/image">
    </head></html>`;
    const next = injectShareMetaIntoHtml(html, buildShareMeta({
      host: 'app.itsco.health',
      path: '/support'
    }));
    expect(next).toContain('<title>ITSCO · Support and contact</title>');
    expect(next).toContain('og:site_name" content="ITSCO"');
    expect(next).not.toContain('<title>Portal</title>');
  });

  it('gives PTHQ /join/nlu/counseling Next Level Up title (not PlotTwist HQ)', () => {
    const meta = buildShareMeta({
      host: 'plottwisthq.com',
      path: '/join/nlu/counseling',
      proto: 'https'
    });
    expect(meta.name).toBe('Next Level Up');
    expect(meta.title).toMatch(/Next Level Up/);
    expect(meta.title).toMatch(/Counseling/);
    expect(meta.image).toContain('path=%2Fjoin%2Fnlu%2Fcounseling');
  });

  it('gives PTHQ /careers/nlu Next Level Up careers title', () => {
    const meta = buildShareMeta({
      host: 'plottwisthq.com',
      path: '/careers/nlu',
      proto: 'https'
    });
    expect(meta.name).toBe('Next Level Up');
    expect(meta.title).toMatch(/Careers/);
  });
});

describe('public website SMS artwork',()=>{
 for(const [slug,file,name] of [['tisi','innerstrengthwebsite','Inner Strength'],['rise','riserevivewebsite','Rise'],['ptco','plottwistcowebsite','Plot Twist'],['mh4kidz','mh4kizqwebsite','MH4Kidz'],['range','mentalrangewebsite','Mental Range']]) {
  it(`injects ${slug} artwork into crawler HTML without requiring a tenant or JavaScript`,()=>{
   const meta=buildShareMeta({host:'plottwisthq.com',path:`/p/${slug}/about`});
   expect(meta.name).toContain(name);expect(meta.image).toBe(`https://plottwisthq.com/assets/SMSAssets/${file}.png`);
   const html=injectShareMetaIntoHtml('<html><head><title>App</title></head></html>',meta);expect(html).toContain(meta.image);expect(html).toContain('og:image');expect(html).toContain('twitter:image');
  });
 }
});
