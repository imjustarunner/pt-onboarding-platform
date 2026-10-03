// Small progressive enhancements; the complete website renders without JavaScript.
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
function closeMenu() { menu?.setAttribute('aria-expanded', 'false'); nav?.classList.remove('is-open'); }
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.message || (response.status === 429 ? 'Too many attempts. Please wait a few minutes or email Michael.' : 'We could not complete this request. Please try again or email Michael.'));
  if (!data) throw new Error('The server returned an unexpected response. Please try again.');
  return data;
}
let captchaScript;
async function captchaToken(config) {
  if (!config.recaptchaSiteKey) {
    if (config.recaptchaRequired) throw new Error('The inquiry form is temporarily unavailable. Please email Michael.');
    return undefined;
  }
  const getApi = () => config.recaptchaUseEnterprise ? window.grecaptcha?.enterprise : window.grecaptcha;
  if (!getApi()?.execute) {
    captchaScript ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); captchaScript = null; reject(new Error('Spam protection timed out. Please try again or email Michael.')); }, 20000);
      script.src = `https://www.google.com/recaptcha/${config.recaptchaUseEnterprise ? 'enterprise.js' : 'api.js'}?render=${encodeURIComponent(config.recaptchaSiteKey)}`;
      script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); captchaScript = null; reject(new Error('Spam protection could not load. Please try again or email Michael.')); };
      document.head.append(script);
    });
    await captchaScript;
  }
  return Promise.race([
    new Promise((resolve, reject) => getApi().ready(() => getApi().execute(config.recaptchaSiteKey, {action: 'public_agency_support'}).then(resolve, reject))),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Spam protection timed out. Please try again or email Michael.')), 20000))
  ]);
}
const inquiry = document.querySelector('#inquiry-form');
if (inquiry) {
  const interest = inquiry.elements.interest;
  const selected = new URLSearchParams(location.search).get('package');
  if ([...interest.options].some(o => o.value === selected)) interest.value = selected;
  let submitting = false;
  inquiry.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !inquiry.reportValidity()) return;
    submitting = true;
    const button = inquiry.querySelector('button[type="submit"]');
    const status = inquiry.querySelector('.form-status');
    button.disabled = true; status.textContent = 'Sending your inquiry…';
    try {
      const fields = Object.fromEntries(new FormData(inquiry));
      const config = await jsonRequest('/api/public/agency-support/michael');
      const token = await captchaToken(config);
      const message = [`Service interest: ${interest.selectedOptions[0].textContent}`, `Adult contact role: ${inquiry.elements.contactRole.selectedOptions[0].textContent}`, `Organization: ${fields.organization || 'Not provided'}`, `Timing: ${fields.timing || 'Not provided'}`, `Budget: ${fields.budget || 'Not provided'}`, '', fields.message].join('\n');
      const result = await jsonRequest('/api/public/agency-support/michael/tickets', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: fields.name, email: fields.email, category: 'other', message, website: fields.website, phiAcknowledged: fields.consent === 'on', captchaToken: token, inquirySource: 'michael_website', interest: fields.interest, contactRole: fields.contactRole, adultContact: fields.adultContact === 'on'})
      });
      if (!result.ok || !result.ticketId) throw new Error('We could not confirm your inquiry was received. Please email Michael before submitting again.');
      inquiry.hidden = true;
      const success = document.querySelector('#inquiry-success');
      success.hidden = false;
      success.querySelector('[data-reference]').textContent = `Your reference: ${result.ticketId}`;
      success.focus();
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'The request timed out. Please email Michael before retrying to avoid a duplicate inquiry.' : error.message;
    } finally { submitting = false; button.disabled = false; }
  });
}

export function invitationPath(input) {
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'plottwisthq.com' || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (!/^\/michael\/packet\/[a-zA-Z0-9_-]{20,200}$/.test(parsed.pathname)) return null;
    return parsed.pathname;
  } catch { return null; }
}
const payment = document.querySelector('#payment-link-form');
payment?.addEventListener('submit', event => {
  event.preventDefault();
  const pathname = invitationPath(payment.elements.invitation.value);
  if (!pathname) {
    payment.querySelector('.form-status').textContent = 'Use the complete https://plottwisthq.com/michael/packet/… invitation from Michael’s email. Need a new link? Contact Michael.';
    return;
  }
  location.assign(pathname);
});
