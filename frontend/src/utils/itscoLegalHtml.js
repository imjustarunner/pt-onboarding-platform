import { itscoLegalLinks, ITSCO_LEGAL_VERSION } from '../content/itscoLegalDocuments.js';
import { tenantLegalProfiles, tenantLegalLinks } from '../content/tenantLegalProfiles.js';
import { legalDocumentsForProfile } from '../content/tenantLegalDocuments.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
export function itscoLegalTypeForPath(path) {
  return itscoLegalLinks.find(link => link.path === String(path).split(/[?#]/)[0].replace(/\/$/, ''))?.type || null;
}
/** Complete public document: readable without JavaScript, sign-in, API calls, or embeds. */
export function renderItscoLegalHtml(type, profile = tenantLegalProfiles.itsco, options = {}) {
  const doc = legalDocumentsForProfile(profile)[type];
  if (!doc) throw new Error('Unknown ITSCO legal document');
  const links = tenantLegalLinks(profile);
  const canonical = (profile.legalOrigin || profile.origin) + links.find(link => link.type === type).path;
  const linkHtml = (href, label) => `<a href="${escape(href.startsWith('/') ? (profile.legalOrigin || profile.origin) + href : href)}">${escape(label)}</a>`;
  const logo = options.logo === undefined ? (profile.logo ? profile.origin + profile.logo : '') : options.logo;
  // The public website serves pre-rendered policies, independently of the Vue view.
  // Keep ITSCO's submitted program discoverable even with JavaScript disabled.
  const smsProgramDetails = profile.slug === 'itsco' ? `<aside class="sms-program-directory"><h3>Staff Notifications and Voting</h3><p>This SMS program addendum forms part of ITSCO’s main terms. Reading it does not subscribe you to texts.</p><nav aria-label="Staff Notifications and Voting"><a href="https://app.itsco.health/sms-programs/2/polling/terms">SMS addendum</a><a href="https://app.itsco.health/sms-programs/2/polling/privacy">SMS privacy details</a><a href="https://app.itsco.health/sms-programs/2/polling/consent?audience=staff">Consent example</a></nav></aside>` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(doc.title)}</title><meta name="description" content="${escape(doc.intro)}"><link rel="canonical" href="${canonical}">
<style>
*{box-sizing:border-box}body{margin:0;background:#fffdf7;color:#243e3c;font:16px/1.75 system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:930px;margin:auto;padding:32px 24px}.wordmark{font-size:28px;font-weight:750;text-decoration:none}.wordmark span{display:block;font-size:13px;font-weight:500}a{color:#285e51;text-underline-offset:4px}a:focus-visible{outline:3px solid #2867d7;outline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;padding:20px 0}h1{font:500 clamp(30px,5vw,46px)/1.2 Georgia,serif;margin:20px 0}.date{font-size:13px;color:#526660}.intro{font-size:18px}.contents{display:grid;gap:6px;border-block:1px solid #d3ded5;margin-top:28px}section{padding-top:24px;scroll-margin-top:24px}h2{font-size:22px;line-height:1.4}li{margin:12px 0}footer{border-top:1px solid #d3ded5;margin-top:40px;padding:24px 0}.print-note{font-size:14px}@media print{@page{margin:18mm}body{background:white;color:black;font-size:11pt}main{max-width:none;padding:0}nav,.print-note,footer{display:none}h1{font-size:25pt}h2{font-size:15pt;break-after:avoid}p,li{orphans:3;widows:3}a{color:inherit}}
.wordmark img{display:block;max-width:230px;width:auto;height:68px;object-fit:contain;margin-bottom:16px}a{color:${/^#[0-9a-f]{6}$/i.test(profile.color)?profile.color:'#285e51'}}
.message-flow{list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:0;margin:32px 0}.message-flow li{margin:0;padding:24px;border:1px solid #d3ded5;border-radius:16px;background:#f0f5f1;break-inside:avoid}.message-flow h2{margin:12px 0 8px;font-size:20px}.message-flow p{margin:0}.step-number{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:${/^#[0-9a-f]{6}$/i.test(profile.color)?profile.color:'#285e51'};color:white;font-weight:700}@media(max-width:580px){.message-flow{grid-template-columns:1fr}}
</style></head><body><main id="top"><header><a class="wordmark" href="${escape(profile.origin)}">${logo?`<img src="${escape(logo)}" alt="">`:''}${escape(profile.name)}</a>
<nav aria-label="${escape(profile.name)} legal documents">${links.map(link => linkHtml(link.path, link.label)).join('')}</nav>
<h1>${escape(doc.title)}</h1><p class="date">${escape(doc.updatedLabel || `Effective October 5, 2026 · Version ${ITSCO_LEGAL_VERSION}`)}</p><p class="intro">${escape(doc.intro)}</p>
<p class="print-note">Use your browser’s Print menu to print this document or save it as a PDF.</p></header>
${doc.flow ? `<ol class="message-flow" aria-label="Your message, step by step">${doc.flow.map((step,index)=>`<li><span class="step-number" aria-hidden="true">${index+1}</span><h2>${escape(step.title)}</h2><p>${escape(step.body)}</p></li>`).join('')}</ol>` : ''}
<nav class="contents" aria-label="On this page"><strong>On this page</strong>${doc.sections.map(s => linkHtml('#' + s.id, s.title)).join('')}</nav>
<article>${doc.sections.map(s => `<section id="${escape(s.id)}"><h2>${escape(s.title)}</h2>${s.paragraphs.map(p => `<p>${escape(p)}</p>`).join('')}${s.items.length ? `<ul>${s.items.map(i => `<li>${escape(i)}</li>`).join('')}</ul>` : ''}${s.links.map(l => `<p>${linkHtml(l.href,l.label)}</p>`).join('')}${['sms','sms-privacy'].includes(s.id) ? smsProgramDetails : ''}</section>`).join('')}</article>
<footer>${escape(profile.legalName)} · ${linkHtml(profile.origin, profile.name)} · <a href="#top">Back to top</a></footer></main></body></html>`;
}
