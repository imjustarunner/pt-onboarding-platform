import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Splash from '../SchoolContactPlanSplash.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const template = '{{parent_name}},\n\nMy name is {{provider_name}}. I was assigned to your child at {{school_name}} and will see them on {{service_day}}. Please reply with times to meet virtually.';
const linked = `${template}\nLearn more: {{profile_link}}`;
const state = overrides => ({ eligible: true, demoOnly: true, mandatory: false, status: 'unconfigured', welcomeSeen: false, includePdf: true, agencyId: 450, template, secondTemplate:template + ' Second contact.', finalTemplate:template + ' Final contact.', smsTemplate:'Hi {{parent_name}}, this is {{provider_name}}. Please reply with times for a brief intake meeting.', recommendedTemplates:{template,secondTemplate:template + ' Recommended second.',finalTemplate:template + ' Recommended final.',smsTemplate:'Hi {{parent_name}}, this is {{provider_name}}. Please reply with times for a brief intake meeting.'}, smsAfterDays: 2, emailAfterDays: 4, staleAfterHours: 48, routing: { isSso: false, from: 'messages@itsco.health', replyTo: 'provider@example.com', providerEmail: 'provider@example.com' }, previewValues: { profile_link: 'https://app.example/auricwell-qa-demo/provider/9' }, preview: { subject: 'A warm introduction' }, ...overrides });
let wrapper;
const dialog = () => document.querySelector('[role="dialog"]');
const findButton = text => [...document.querySelectorAll('button')].find(node => node.textContent.includes(text));
async function click(text) { findButton(text).click(); await flushPromises(); }
async function lastSlide() { for (let i = 0; i < 4; i++) await click('Next'); }
async function customize() { await lastSlide(); await click('Customize my emails first'); }
async function open(overrides) {
  api.get.mockResolvedValue({ data: state(overrides) });
  wrapper = mount(Splash, { attachTo: document.body, props: { agencyId: 450, userId: 9, providerName: 'Alex Provider' }, global: { stubs: { RouterLink: { props: ['to'], template: '<a class="router-link-stub"><slot /></a>' } } } });
  await flushPromises();
}
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

it('opens the Family Welcome tour once and lets a saved opt-out be revisited', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'declined', welcomeSeen: true }) });
  await open();
  expect(dialog().getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(dialog());
  expect(dialog().textContent).toContain('Family Welcome & Follow-Up');
  expect(dialog().textContent).toContain('Introduce yourself to new families and follow up until you connect.');
  await lastSlide();
  expect(dialog().textContent).toContain('Our support team sends an introduction email to the family when you are assigned, and you are copied on it.');
  await click('No thanks, have support introduce me');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', { status: 'declined' }, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(dialog()).toBeNull();
  expect(document.querySelector('.contact-plan-dock').textContent).toContain('Support will introduce you');
  await click('Family Welcome & Follow-Up');
  expect(dialog().textContent).toContain('If you opt out');
});

it('walks through example emails, the PDF, and where to find the settings', async () => {
  await open();
  await click('Next');
  for (const [tab, filename] of [
    ['Welcome email', 'welcome-email.png'],
    ['Follow-up text at 48 hours', 'followup-text.png'],
    ['Follow-up email at 48 hours', 'followup-email.png'],
    ['Final email at 96 hours', 'final-email.png']
  ]) {
    await click(tab);
    const selected = dialog().querySelector('[role="tab"][aria-selected="true"]');
    expect(selected.textContent).toContain(tab);
    const image = dialog().querySelector('.fw-shot img');
    expect(image.getAttribute('src')).toBe(`/family-welcome/${filename}`);
    expect(image.getAttribute('alt').toLowerCase()).toContain(tab.toLowerCase());
    image.dispatchEvent(new Event('load')); await flushPromises();
    expect(image.style.display).not.toBe('none');
    expect(dialog().querySelector('.fw-mail-body, .fw-bubble')).toBeNull();
  }
  await click('Next');
  const pdfImage = dialog().querySelector('.fw-shot img');
  expect(pdfImage.getAttribute('src')).toBe('/family-welcome/introduction-pdf-p1.png');
  expect(pdfImage.getAttribute('alt')).toContain('Page 1');
  expect(findButton('View my PDF')).toBeTruthy();
  await click('Next');
  for (const [label, filename, query] of [
    ['Quick Nav search example', 'quick-nav-search.png', 'family welcome'],
    ['Search My Dashboard example', 'dashboard-search.png', 'auto message']
  ]) {
    const figure = dialog().querySelector(`[aria-label="${label}"]`);
    const image = figure.querySelector('img');
    expect(image.getAttribute('src')).toBe(`/family-welcome/${filename}`);
    expect(image.getAttribute('alt')).toContain(query);
    image.dispatchEvent(new Event('load')); await flushPromises();
    expect(figure.querySelector('.fw-search')).toBeNull();
    expect(image.style.display).not.toBe('none');
  }
  expect(dialog().textContent).toContain('customize your emails and text at any time');
});

it('keeps personalized previews usable when screenshots are missing and resets them when tabs change', async () => {
  await open(); await click('Next');
  expect(dialog().querySelector('.fw-mail-body').textContent).toContain('Alex Provider');
  expect(dialog().textContent).toContain('School introduction.pdf');
  const welcome = dialog().querySelector('.fw-shot img');
  welcome.dispatchEvent(new Event('error')); await flushPromises();
  expect(welcome.style.display).toBe('none');
  expect(dialog().querySelector('.fw-mail-body').textContent).toContain('Alex Provider');
  welcome.dispatchEvent(new Event('load')); await flushPromises();
  await click('Final email at 96 hours');
  expect(dialog().querySelector('.fw-shot img').style.display).toBe('none');
  expect(dialog().querySelector('.fw-mail-body').textContent).toContain('Final contact');
  await click('Follow-up text at 48 hours');
  expect(dialog().querySelector('.fw-bubble').textContent).toContain('Alex Provider');
  await click('Next');
  expect(dialog().querySelector('.fw-pdf-card').textContent).toContain('School introduction.pdf');
  expect(findButton('View my PDF').disabled).toBe(false);
  await click('Next');
  expect(dialog().querySelector('[aria-label="Quick Nav search example"]').textContent).toContain('family welcome');
  expect(dialog().querySelector('[aria-label="Search My Dashboard example"]').textContent).toContain('auto message');
});

it('opts in with the PDF choice and asks for the profile link when the welcome email has none', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'enabled', welcomeSeen: true }) });
  await open();
  await click('Next'); await click('Next');
  document.querySelector('.fw-check input').click(); await flushPromises();
  await click('Next'); await click('Next');
  await click('Yes, turn on Family Welcome');
  expect(api.put).not.toHaveBeenCalled();
  expect(dialog().textContent).toContain('Your email does not include your profile link. Please use the add profile link button in the body of your email.');
  await click('No thanks, save anyway');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({ status: 'enabled', includePdf: false, template }), expect.anything());
});

it('adds the profile link from the prompt and saves without asking again', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'enabled', welcomeSeen: true, template: linked }) });
  await open();
  await lastSlide(); await click('Yes, turn on Family Welcome');
  await click('Add profile link');
  expect(document.querySelector('textarea').value).toContain('{{profile_link}}');
  await click('Next: follow-ups'); await click('Turn on Family Welcome');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({ template: expect.stringContaining('{{profile_link}}') }), expect.anything());
});

it('opts in directly when the welcome email already has the profile link', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'enabled', welcomeSeen: true, template: linked }) });
  await open({ template: linked });
  await lastSlide(); await click('Yes, turn on Family Welcome');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({ status: 'enabled', includePdf: true, template: linked }), expect.anything());
  expect(dialog()).toBeNull();
});

it('uses the existing SchoolCareBridge logo and product identity in the header',async()=>{
 await open();
 const brand=dialog().querySelector('.contact-plan-brand');
 expect(brand.querySelector('img').getAttribute('src')).toBe('/assets/schoolcarebridge/wordmark.svg');
 expect(brand.querySelector('img').getAttribute('alt')).toBe('SchoolCareBridge');
 expect(brand.textContent).toContain('Plot Twist Co.');
 expect(brand.textContent).not.toContain('SCHOOL CARE BRIDGE');
});

it('keeps ineligible tenants quiet, shows the tour once to providers already on, and reopens from settings', async () => {
  await open({ eligible: false });
  expect(document.querySelector('.contact-plan-dock')).toBeNull();
  expect(dialog()).toBeNull();
  wrapper.unmount();
  await open({ status: 'enabled', welcomeSeen: true });
  expect(dialog()).toBeNull();
  await click('Family Welcome & Follow-Up');
  expect(dialog().textContent).toContain('Your Family Welcome');
  await click('Finish later');
  window.dispatchEvent(new CustomEvent('family-welcome:open')); await flushPromises();
  expect(dialog().textContent).toContain('Introduce yourself to new families');
  wrapper.unmount();
  await open({ status: 'enabled', welcomeSeen: false });
  expect(dialog().textContent).toContain('Right away');
});

it('sends an edited example, minimizes only after success, and preserves the draft on resume', async () => {
  api.post.mockResolvedValue({ data: { sent: true, conversationId: 45, deliveredTo: 'testing@itsco.health' } });
  await open(); await customize(); await click('Edit my welcome email');
  const editor = document.querySelector('textarea');
  editor.value = `${template}\nLooking forward to connecting!`; editor.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises();
  expect(document.querySelector('.contact-plan-email-body').textContent).toContain('Alex Provider');
  expect(document.querySelector('.contact-plan-email-body').textContent).toContain('Looking forward');
  await click('Send me an example');
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/example', { template: `${template}\nLooking forward to connecting!` }, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(dialog()).toBeNull();
  expect(document.querySelector('.contact-plan-inbox').textContent).toContain('Check Messages');
  await click('Your example is ready');
  expect(document.querySelector('textarea').value).toContain('Looking forward');
  expect(findButton('Send me another example')).toBeTruthy();
  expect(dialog().textContent).toContain('testing@itsco.health');
});

it('keeps a failed example visible and blocks a template with missing personalization', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  await open(); await customize(); await click('Send me an example');
  expect(dialog()).not.toBeNull();
  expect(document.querySelector('[role="alert"]').textContent).toContain('could not be sent');
  await click('Edit my welcome email');
  const editor = document.querySelector('textarea'); editor.value = 'Unpersonalized message'; editor.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises();
  expect(findButton('Send me an example').disabled).toBe(true);
  expect(dialog().textContent).toContain('{{parent_name}}');
});

it('shows the fixed 0/48/96-hour plan and saves all four editable messages', async () => {
  api.put.mockResolvedValue({data:state({status:'enabled',welcomeSeen:true})});
  await open({ template: linked }); await customize(); await click('Next: follow-ups');
  expect(document.querySelector('input[type="number"]')).toBeNull();
  expect(dialog().textContent).toContain('48 hours later');expect(dialog().textContent).toContain('96 hours after introduction');
  expect(dialog().textContent).toContain('At day 6');expect(dialog().textContent).toContain('A family reply stops');
  await click('Turn on Family Welcome');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({status:'enabled',template:linked,secondTemplate:template+' Second contact.',finalTemplate:template+' Final contact.',smsTemplate:expect.stringContaining('{{provider_name}}'),smsAfterDays:2,emailAfterDays:4,staleAfterHours:48,includePdf:true}),expect.anything());
  expect(dialog()).toBeNull();
});

it('edits and previews the second and final emails and resets only the selected wording', async () => {
  api.post.mockResolvedValue({data:{sent:true,conversationId:99}});
  await open();await customize();
  const picker=document.querySelector('[aria-label="Contact plan message"]');
  picker.value='secondTemplate';picker.dispatchEvent(new Event('change',{bubbles:true}));await flushPromises();await click('Edit this message');
  const editor=document.querySelector('textarea');editor.value=template+' Custom second.';editor.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();
  expect(document.querySelector('.contact-plan-email-body').textContent).toContain('Custom second');
  await click('Send me an example');
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/example',{template:template+' Custom second.',stepKey:'second_contact'},expect.anything());
  await click('Your example is ready');await click('Use recommended wording');
  expect(document.querySelector('textarea').value).toBe(template+' Recommended second.');
  const reopenedPicker=document.querySelector('[aria-label="Contact plan message"]');reopenedPicker.value='finalTemplate';reopenedPicker.dispatchEvent(new Event('change',{bubbles:true}));await flushPromises();
  expect(document.querySelector('textarea').value).toBe(template+' Final contact.');
});

it('validates every saved message and never sends an SMS from its preview', async () => {
  await open();await customize();
  const picker=document.querySelector('[aria-label="Contact plan message"]');picker.value='smsTemplate';picker.dispatchEvent(new Event('change',{bubbles:true}));await flushPromises();
  expect(findButton('Send me an example')).toBeUndefined();expect(dialog().textContent).toContain('Text preview only');
  await click('Edit this message');const editor=document.querySelector('textarea');editor.value='Hi, no recipient token.';editor.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();
  expect(findButton('Next: follow-ups').disabled).toBe(true);expect(api.post).not.toHaveBeenCalled();
});

it('uses SSO reply guidance and hides the tour while the account is locked', async () => {
  api.post.mockResolvedValue({ data: { sent: true, conversationId: 45, deliveredTo: 'testing@itsco.health' } });
  await open({ routing: { isSso: true, from: 'messages@itsco.health', replyTo: 'messages@itsco.health' } });
  await customize();
  expect(dialog().textContent).toContain('Replies return to Messages in the app');
  await wrapper.setProps({ locked: true }); expect(dialog()).toBeNull();
  await wrapper.setProps({ locked: false }); expect(dialog()).not.toBeNull();
  await click('Send me an example'); expect(document.querySelector('.contact-plan-inbox')).toBeNull();
});

it('lets an enabled optional plan be turned off without sending a message', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'declined', welcomeSeen: true }) });
  await open({ status: 'enabled', welcomeSeen: true }); await click('Family Welcome & Follow-Up');
  await click('Turn off Family Welcome');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', { status: 'declined' }, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(api.post).not.toHaveBeenCalled();
  expect(dialog()).toBeNull();
  expect(document.querySelector('.contact-plan-dock').textContent).toContain('Support will introduce you');
  await click('Family Welcome & Follow-Up');
  expect(dialog().textContent).toContain('Introduce yourself to new families');
});

it('prompts a previously declined provider when setup becomes required and hides the opt-out', async () => {
  await open({ mandatory: true, status: 'declined', welcomeSeen: true });
  expect(dialog()).not.toBeNull();
  await lastSlide();
  expect(findButton('No thanks')).toBeUndefined();
  wrapper.unmount();
  await open({ mandatory: true, status: 'enabled', welcomeSeen: true }); await click('Family Welcome & Follow-Up');
  expect(findButton('Turn off Family Welcome')).toBeUndefined();
});

it('does not show a previous tenant response after the selected agency changes', async () => {
  let resolveOld;
  api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ data: state({ eligible: false }) });
  wrapper = mount(Splash, { attachTo: document.body, props: { agencyId: 450, userId: 9 }, global: { stubs: { RouterLink: true } } });
  await wrapper.setProps({ agencyId: 2 }); await flushPromises();
  resolveOld({ data: state() }); await flushPromises();
  expect(dialog()).toBeNull(); expect(document.querySelector('.contact-plan-dock')).toBeNull();
});
