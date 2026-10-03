document.documentElement.classList.add('js');
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
function closeMenu() { menu?.setAttribute('aria-expanded','false'); nav?.classList.remove('is-open'); }
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open)); nav?.classList.toggle('is-open',open);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {closeMenu(); menu.focus();}
});
nav?.addEventListener('click', event => {if(event.target.closest('a')) closeMenu();});

const tourButtons = [...document.querySelectorAll('[data-tour]')];
function chooseTour(id) {
  tourButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tour === id)));
  document.querySelectorAll('[data-panel]').forEach(panel => {panel.hidden = panel.dataset.panel !== id;});
}
tourButtons.forEach(button => button.addEventListener('click', () => chooseTour(button.dataset.tour)));
if (tourButtons.length) chooseTour('standings');

async function request(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || (response.status === 429 ? 'Too many attempts. Please wait a few minutes before trying again.' : 'Your message could not be sent. Please try again or use app support.'));
  if (!body) throw new Error('We could not confirm the response. Please check with app support before resending.');
  return body;
}
let captchaScript;
async function captchaToken(config) {
  if (!config.recaptchaSiteKey) {
    if (config.recaptchaRequired) throw new Error('This form is temporarily unavailable. Please use the app support link.');
    return undefined;
  }
  const api = () => config.recaptchaUseEnterprise ? window.grecaptcha?.enterprise : window.grecaptcha;
  if (!api()?.execute) {
    captchaScript ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {script.remove(); captchaScript = null; reject(new Error('Spam protection could not load. Please try again or use app support.'));};
      const timer = setTimeout(fail,20000);
      script.src = `https://www.google.com/recaptcha/${config.recaptchaUseEnterprise ? 'enterprise.js' : 'api.js'}?render=${encodeURIComponent(config.recaptchaSiteKey)}`;
      script.async = true;
      script.onload = () => {clearTimeout(timer); resolve();};
      script.onerror = () => {clearTimeout(timer); fail();};
      document.head.append(script);
    });
    await captchaScript;
  }
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('Spam protection timed out. Please try again or use app support.')),20000);
    if (!api()?.ready) {clearTimeout(timer); reject(new Error('Spam protection is unavailable. Please use app support.')); return;}
    api().ready(() => api().execute(config.recaptchaSiteKey,{action:'public_agency_support'}).then(token => {clearTimeout(timer);resolve(token);}, error => {clearTimeout(timer);reject(error);}));
  });
}
const form = document.querySelector('#sstc-inquiry');
if (form) {
  const topic = new URLSearchParams(location.search).get('topic');
  if ([...form.elements.topic.options].some(option => option.value === topic)) form.elements.topic.value = topic;
  let submitting = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    submitting = true;
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.form-status');
    button.disabled = true; status.textContent = 'Sending your message…';
    try {
      const fields = Object.fromEntries(new FormData(form));
      const config = await request('/api/public/agency-support/sstc');
      const token = await captchaToken(config);
      const message = ['Source: Summit Stats public website', `Topic: ${form.elements.topic.selectedOptions[0].textContent}`, `Club or group: ${fields.organization || 'Not provided'}`, 'Contact confirms they are 18 or older.', '', fields.message].join('\n');
      const result = await request('/api/public/agency-support/sstc/tickets', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:fields.name,email:fields.email,category:'other',message,website:fields.website,phiAcknowledged:fields.consent === 'on',captchaToken:token})});
      if (!result.ok || !result.ticketId) throw new Error('We could not confirm receipt. Please check with app support before sending again.');
      form.hidden = true;
      const success = document.querySelector('#sstc-success');
      success.hidden = false;
      success.querySelector('[data-reference]').textContent = `Your reference: ${result.ticketId}`;
      success.focus();
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' ? 'The request timed out. Please check with app support before resending to avoid duplicate messages.' : error.message;
    } finally {submitting = false;button.disabled = false;}
  });
}
