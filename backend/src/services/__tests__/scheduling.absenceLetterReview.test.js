import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../geminiText.service.js', () => ({ callGeminiText: vi.fn() }));
import { rewriteAbsenceLetter, createAbsenceLetterComposer } from '../dayCancellationRewrite.service.js';
import { composeAbsenceLetter } from '../dayAbsenceNarrative.service.js';
import { previewCancellationEmail } from '../cancellationEmailPreview.service.js';

const note = "Unfortunately, Sorry I'm still sick and I won't be able to attend today, I'll see you at the next session!";
const letter = { audience: 'client', urgent: true, providerAuthored: true, providerName: 'Example Provider', clientName: 'Example Client', when: 'Tuesday, November 24, 2026 at 6:00 PM', note };
beforeEach(() => vi.clearAllMocks());

it('keeps a complete provider message out of a comma-spliced reason clause in the fallback', () => {
  const result = composeAbsenceLetter(letter);
  expect(result.text).toContain(`${note}\n\n`);
  expect(result.text).not.toContain(`${note},`);
  expect(result.text).not.toContain('Unfortunately, Unfortunately');
  expect(composeAbsenceLetter({ ...letter, note: 'illness' }).text).toContain('because of illness, I need to cancel');
});
it.each(['warmer', 'formal', 'shorter', 'longer', 'regenerate'])('extracts the model’s actual text for %s rather than coercing the response object', async tone => {
  const text = 'Hello,\n\nI am still unwell and need to cancel our session today. I look forward to seeing you at our next scheduled session.\n\nThank you for understanding.';
  const generateText = vi.fn(async () => ({ text, modelName: 'test', finishReason: 'STOP' }));
  expect(await rewriteAbsenceLetter({ text: note, tone, audience: 'client' }, { generateText })).toEqual({ text });
  expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ sensitive: true }));
});
it.each([{}, { text: {} }, { text: '[object Object]' }, { text: 'Sorry, I will be back on 12/5.' }, { text: 'Incomplete', finishReason: 'MAX_TOKENS' }])('preserves a usable fallback for malformed, incomplete, or invented model output %j', async model => {
  const result = await rewriteAbsenceLetter({ text: note, tone: 'warmer' }, { generateText: async () => model });
  expect(result.text).toBe(note);
});
it('uses provider intent to draft naturally once per audience, then inserts each client’s details locally', async () => {
  const generateText = vi.fn(async () => ({ text: 'Hello,\n\nI’m still feeling unwell and need to cancel our session on {{session_when}}. I look forward to seeing you at our next scheduled session.\n\nThank you for understanding,\n{{provider_name}}' }));
  const compose = createAbsenceLetterComposer({ generateText });
  const a = await compose(letter);
  const b = await compose({ ...letter, clientName: 'Another Client', when: 'Wednesday at 4 PM' });
  expect(generateText).toHaveBeenCalledTimes(1);
  expect(generateText.mock.calls[0][0].prompt).toContain(`Provider's intended message: ${note}`);
  expect(generateText.mock.calls[0][0].prompt).not.toContain('Example Provider');
  expect(a.text).toContain(letter.when); expect(b.text).toContain('Wednesday at 4 PM');
  expect(a.text).not.toContain(note); expect(a.text).not.toContain('{{');
});
it('does not use an incomplete model template that dropped a required appointment placeholder', async () => {
  const compose = createAbsenceLetterComposer({ generateText: async () => ({ text: 'See you next time!' }) });
  const result = await compose(letter);
  expect(result.text).toContain(letter.when); expect(result.text).toContain(note);
});
it('renders an escaped, branded example without calling a mail transport or issuing real receipt links', async () => {
  const d = { agency: vi.fn(async () => ({ id: 2, name: 'Test practice', slug: 'test' })), domain: vi.fn(async () => 'example.test') };
  const result = await previewCancellationEmail({ agencyId: 2, subject: 'Session update', text: 'Hello,\n\n<script>alert("bad")</script>\n\nSee you next session!' }, d);
  expect(result.html).toContain('data-portal-email="v2"'); expect(result.html).toContain('Test practice');
  expect(result.html).toContain('&lt;script&gt;'); expect(result.html).not.toContain('<script>');
  expect(result.html).toContain('Review my appointments'); expect(result.html).not.toMatch(/receiptToken|appointmentId=/);
  expect(d.agency).toHaveBeenCalledWith(2);
});
it('rejects object text and invalid preview subjects instead of turning them into email content', async () => {
  await expect(rewriteAbsenceLetter({ text: {} })).rejects.toHaveProperty('status', 400);
  await expect(previewCancellationEmail({ agencyId: 2, subject: 'Bad\nsubject', text: 'Body' })).rejects.toHaveProperty('status', 400);
});

it.each([false,true])('shows school coordination only for an explicitly school-related preview (%s)',async school=>{
 const result=await previewCancellationEmail({agencyId:3,subject:'Session canceled',text:'See you next time.',school},{agency:async()=>({id:3,name:'Inner Strength',feature_flags:{clinicalChartEnabled:true}}),domain:async()=> 'innerstrengthin.com'});
 expect(result.html.includes('School coordination through SchoolCareBridge')).toBe(school);
});

it.each([
 {clinical:true,name:'Private care',displayName:'AuricWell Portal',replyTo:'support@example.test',products:['AuricWell · clinical portal']},
 {clinical:true,name:'School care',displayName:'AuricWell Portal',replyTo:'support@example.test',products:['SchoolCareBridge · school coordination']},
 {clinical:false,name:'Next Level Up',displayName:'Next Level Up Portal',replyTo:'support@example.test',products:[]}
])('renders the canonical client brand in the HTML example for $name',async brand=>{
 const context=vi.fn(async()=>({brand}));const result=await previewCancellationEmail({agencyId:2,clientId:8,subject:'Update',text:'See you next time.'},{agency:async()=>({id:2,name:'Example'}),context});
 expect(context).toHaveBeenCalledWith({agencyId:2,clientId:8});expect(result.html).toContain(brand.name);expect(result.html.includes('SchoolCareBridge')).toBe(brand.products.some(p=>p.startsWith('SchoolCareBridge')));
});
