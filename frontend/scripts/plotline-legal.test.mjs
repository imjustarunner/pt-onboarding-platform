import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { plotlineLegalPages, plotlineInterviewOptInScript, PLOTLINE_LEGAL_ORIGIN } from '../src/content/plotlineLegal.js';
import { renderPlotlineLegalHtml, renderPlotlineOptInText } from '../src/utils/plotlineLegalHtml.js';
import { isPlotlineCompanySlug } from '../src/utils/plotline.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(root + '/' + path, 'utf8');

test('all public policy content is present without JavaScript or authentication', () => {
  for (const [key, page] of Object.entries(plotlineLegalPages)) {
    const html = renderPlotlineLegalHtml(key);
    assert.equal(read('dist/_public-sites/plotline/' + key + '/index.html'), html);
    assert.match(html, /<html lang="en">/);
    assert.ok(html.includes('<h1>' + page.title.replaceAll('&', '&amp;') + '</h1>'));
    assert.ok(html.includes('rel="canonical" href="' + PLOTLINE_LEGAL_ORIGIN + '/' + key + '"'));
    for (const section of page.sections) {
      assert.ok(html.includes('id="' + section.id + '"'));
      for (const paragraph of section.paragraphs) {
        const plain = html.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"');
        assert.ok(plain.includes(paragraph), section.id + ' must contain the complete policy text');
      }
    }
    assert.doesNotMatch(html, /<script|sign in to|enable javascript/i);
    assert.ok(existsSync(root + '/public/assets/plotline/website/brand/logos/plotline-primary-transparent.webp'));
    for (const policy of ['privacy', 'terms', 'sms-consent', 'hiring-sms-consent']) assert.ok(html.includes('href="https://plotlinepo.com/' + policy + '"'));
  }
});

test('the full-script HTML and text file use the same consent wording and explicit response paths', () => {
  const text = renderPlotlineOptInText();
  const html = renderPlotlineLegalHtml('sms-consent').replace(/<[^>]+>/g, '');
  assert.equal(read('dist/_public-sites/plotline/sms-consent.txt'), text);
  for (const line of plotlineInterviewOptInScript) {
    assert.ok(text.includes(line));
    assert.ok(html.includes(line));
  }
  for (const disclosure of ['Message and data rates may apply', 'Message frequency varies', 'HELP', 'STOP', 'https://plotlinepo.com/privacy', 'https://plotlinepo.com/terms', 'Do you agree?', 'seven days, 24 hours, one hour, and five minutes']) assert.ok(text.includes(disclosure));
  assert.match(text, /silence, or an unclear answer does not establish consent/);
  assert.match(text, /leaves text reminders disabled/);
  assert.match(text, /approved, active campaign/);
});

test('the production Plotline host serves exact public policy routes and a text MIME type', () => {
  const config = read('dist/itsco-public.nginx.conf');
  const host = config.split('server_name plotlinepo.com;')[1].split('server { listen 8080; server_name www.plotlinepo.com;')[0];
  for (const key of Object.keys(plotlineLegalPages)) {
    assert.ok(host.includes('location = /' + key + ' { add_header Cache-Control "no-cache"; try_files /_public-sites/plotline/' + key + '/index.html =404; }'));
    assert.ok(host.includes('location = /' + key + '/ { return 301 https://plotlinepo.com/' + key));
    assert.ok(read('dist/_public-sites/plotline/sitemap.xml').includes('<loc>https://plotlinepo.com/' + key + '</loc>'));
    assert.equal(isPlotlineCompanySlug(key), false);
  }
  assert.match(host, /location = \/sms-consent\.txt \{ default_type text\/plain; charset utf-8;/);
  assert.match(host, /location = \/privacypolicy \{ return 301 https:\/\/plotlinepo.com\/privacy/);
  assert.match(config, /location = \/plottline\/sms-consent \{/);
});

test('the marketing footer links directly to Plotline public policies', () => {
  const footer = read('src/views/public/PlotlineWebsite.vue').split('<footer')[1];
  for (const key of Object.keys(plotlineLegalPages)) assert.ok(footer.includes('href="https://plotlinepo.com/' + key + '"'));
  assert.doesNotMatch(footer, /plottwisthq\.com\/(?:terms|privacypolicy)/);
});

test('application proof and terms explain the full optional journey without expanding old verbal interview consent',()=>{
 const html=renderPlotlineLegalHtml('hiring-sms-consent');
 for(const detail of ['Email only is selected by default','Both confirmations begin unchecked','ITSCO','reference outreach and completion','pre-hire and onboarding','new documents or tasks','staff review','STOP','HELP']) assert.ok(html.toLowerCase().includes(detail.toLowerCase()),detail);
 assert.match(html,/does not collect a phone number or enroll anyone/);
 assert.match(html,/Existing interview-only consent is not silently expanded/);
 const terms=renderPlotlineLegalHtml('terms');assert.match(terms,/application.*electronic signature/si);assert.match(terms,/Reference answers and ratings are not sent/);
});
