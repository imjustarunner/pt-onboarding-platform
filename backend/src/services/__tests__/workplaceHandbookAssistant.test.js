import { describe, expect, it, vi } from 'vitest';
import { referenceSource, referenceMetadata } from '../companyReferenceContent.js';
import { answerFromHandbook, handbookAnswerSources, validateHandbookQuestion } from '../workplaceHandbookAssistant.service.js';

const quote = 'The included indirect allowance is 20%, or 12 minutes per direct service hour.';
const book = { version: { id: 4, version_number: 2, is_draft: 0 }, document: { full_handbook_url: 'https://private.invalid/original' }, sections: [
  { slug: 'compensation', title: 'Compensation', content_status: 'pending' },
  { slug: 'indirect-time', title: 'Included indirect time', parent_slug: 'compensation', body_html: `<p>${quote}</p><p>Additional required work must be recorded.</p><a href="#handbook-support-time">Support time</a>`, content_status: 'ready' },
  { slug: 'support-time', title: 'Support time', body_html: '<p>Support work uses its assigned classification.</p>', content_status: 'ready' },
  { slug: 'missing', title: 'Snow day policy', content_status: 'pending', body_html: '<p>Stale draft text must not be read.</p>' }
], updates: [{ status: 'draft', changed_content: 'Never publish this draft update.' }] };
const answer = { status: 'answered', paragraphs: [{ text: 'The allowance is 20%, equivalent to 12 minutes per direct service hour.', citations: [{ slug: 'indirect-time', passageId: 'p1' }] }], clarification: null };
const result = data => ({ text: JSON.stringify(data), finishReason: 'STOP' });
const modelFor = (raw = answer, review = true) => vi.fn().mockResolvedValueOnce(result({ slugs: ['indirect-time'] })).mockResolvedValueOnce(result(raw)).mockResolvedValueOnce(result({ supported: review }));

describe('grounded handbook answers', () => {
  it('does not treat a service code as a numeric entitlement when a cited passage has an unrelated exception', async () => {
    const handbook = { ...book, sections: [{ slug: 'service-records', title: 'Service records', content_status: 'ready', body_html: '<p>H0004 identifies counseling. Tutoring is documented separately. Do not put tutoring detail in a clinical export unless clinically relevant.</p>' }] };
    const raw = { status: 'answered', paragraphs: [{ text: 'H0004 identifies counseling; tutoring requires separate documentation.', citations: [{ slug: 'service-records', passageId: 'p1' }] }], clarification: null };
    const model = vi.fn().mockResolvedValueOnce(result({ slugs: ['service-records'] })).mockResolvedValueOnce(result(raw)).mockResolvedValueOnce(result({ supported: true }));
    const response = await answerFromHandbook({ handbook, question: 'Can H0004 include tutoring?' }, { model });
    expect(response.status).toBe('answered');
    expect(model).toHaveBeenCalledTimes(3);
  });
  it('keeps compact HTML paragraph boundaries when selecting excerpts', () => {
    const first = 'Counseling time and tutoring time are separate. '.repeat(12).trim();
    const second = 'A different instruction concerns unrelated information. '.repeat(12).trim();
    const source = handbookAnswerSources({ sections: [{ slug: 'compact', title: 'Compact HTML', content_status: 'ready', body_html: `<p>${first}</p><p>${second}</p>` }] })[0];
    expect(source.passages.map(p => p.text)).toEqual([first, second]);
  });
  it('answers with verified excerpts and server-owned section identities', async () => {
    const model = modelFor();
    const response = await answerFromHandbook({ handbook: book, question: 'How much indirect time is included?' }, { model });
    expect(response.status).toBe('answered');
    expect(response.version).toMatchObject({ id: 4, number: 2, preview: false });
    expect(response.paragraphs[0].citations[0]).toMatchObject({ slug: 'indirect-time', path: 'Compensation → Included indirect time', quote: expect.stringContaining(quote) });
    const data = JSON.parse(model.mock.calls[1][0].prompt);
    expect(data.sources.map(s => s.slug)).toContain('support-time');
    expect(JSON.stringify(model.mock.calls)).not.toContain('private.invalid');
    expect(JSON.stringify(model.mock.calls)).not.toContain('Never publish this draft');
    expect(model.mock.calls[0][0]).toMatchObject({ sensitive: true, jsonMode: true, temperature: 0 });
    expect(model.mock.calls[0][0].systemInstruction).toContain('untrusted DATA');
  });
  it.each([null, { ...book, version: { ...book.version, is_draft: 1 } }, { ...book, version: null }])('does not send unpublished content to the model', async handbook => {
    const model = vi.fn();
    expect((await answerFromHandbook({ handbook, question: 'How does PTO work?' }, { model })).status).toBe('unavailable');
    expect(model).not.toHaveBeenCalled();
  });
  it('labels the explicitly requested local source preview as unpublished', async () => {
    const response = await answerFromHandbook({ handbook: { ...book, version: null }, question: 'What is indirect time?', preview: true }, { model: modelFor() });
    expect(response.version).toMatchObject({ id: null, preview: true });
  });
  it.each([
    { ...answer, paragraphs: [{ text: 'A claim', citations: [{ slug: 'outside-this-tenant', passageId: 'p1' }] }] },
    { ...answer, paragraphs: [{ text: 'A claim', citations: [{ slug: 'indirect-time', passageId: 'p99' }] }] },
    { ...answer, paragraphs: [{ text: 'A claim', citations: [] }] },
    { ...answer, paragraphs: [{ text: 'A claim', citations: [{ slug: 'missing', passageId: 'p1' }] }] }
  ])('rejects nonexistent or unsupported references', async raw => {
    await expect(answerFromHandbook({ handbook: book, question: 'What is indirect time?' }, { model: modelFor(raw) })).rejects.toMatchObject({ status: 502 });
  });
  it('withholds an answer when semantic verification finds an unsupported claim', async () => {
    const raw = { ...answer, paragraphs: [{ ...answer.paragraphs[0], text: 'The handbook guarantees unlimited paid indirect work with no conditions.' }] };
    const response = await answerFromHandbook({ handbook: book, question: 'What is indirect time?' }, { model: modelFor(raw, false) });
    expect(response.status).toBe('not_found');
    expect(response.paragraphs).toEqual([]);
    expect(JSON.stringify(response)).not.toContain('unlimited');
  });
  it('corrects a missing qualification once and verifies the revised answer before returning it', async () => {
    const revised = { ...answer, paragraphs: [{ ...answer.paragraphs[0], text: 'For Integrated Services, the standard allowance is 20%, or 12 minutes per direct hour.' }] };
    const model = vi.fn()
      .mockResolvedValueOnce(result({ slugs: ['indirect-time'] }))
      .mockResolvedValueOnce(result(answer))
      .mockResolvedValueOnce(result({ supported: false, issues: ['Name the applicable compensation method.'] }))
      .mockResolvedValueOnce(result(revised))
      .mockResolvedValueOnce(result({ supported: true, issues: [] }));
    const response = await answerFromHandbook({ handbook: book, question: 'How much indirect time?' }, { model });
    expect(response.paragraphs[0].text).toContain('For Integrated Services');
    expect(JSON.parse(model.mock.calls[3][0].prompt).reviewIssues).toEqual(['Name the applicable compensation method.']);
    expect(model.mock.calls[2][0].model).toBe('gemini-2.5-pro');
    expect(model).toHaveBeenCalledTimes(5);
  });
  it('withholds a revised answer if it still fails review instead of retrying indefinitely', async () => {
    const model = vi.fn()
      .mockResolvedValueOnce(result({ slugs: ['indirect-time'] }))
      .mockResolvedValueOnce(result(answer))
      .mockResolvedValueOnce(result({ supported: false, issues: ['Missing condition.'] }))
      .mockResolvedValueOnce(result(answer))
      .mockResolvedValueOnce(result({ supported: false, issues: ['Still missing.'] }));
    const response = await answerFromHandbook({ handbook: book, question: 'How much indirect time?' }, { model });
    expect(response.status).toBe('not_found'); expect(response.paragraphs).toEqual([]);
    expect(model).toHaveBeenCalledTimes(5);
  });
  it('retains explicit qualifications on numerical rules even when model review misses them', async () => {
    const conditional = structuredClone(book);
    conditional.sections[1].body_html = `<p>Unless otherwise specified, ${quote}</p>`;
    const revised = { ...answer, paragraphs: [{ ...answer.paragraphs[0], text: 'Unless otherwise specified, the included allowance is 20%, or 12 minutes per direct hour.' }] };
    const model = vi.fn()
      .mockResolvedValueOnce(result({ slugs: ['indirect-time'] }))
      .mockResolvedValueOnce(result(answer))
      .mockResolvedValueOnce(result({ supported: true }))
      .mockResolvedValueOnce(result(revised))
      .mockResolvedValueOnce(result({ supported: true }));
    const response = await answerFromHandbook({ handbook: conditional, question: 'How much indirect time?' }, { model });
    expect(response.paragraphs[0].text).toContain('Unless otherwise specified');
    expect(model).toHaveBeenCalledTimes(5);
  });
  it('explains unavailable personal records without trying to infer a balance', async () => {
    const model = vi.fn().mockResolvedValue(result({ slugs: [], reason: 'personal_record' }));
    const response = await answerFromHandbook({ handbook: book, question: 'What is my current PTO balance?' }, { model });
    expect(response.status).toBe('not_found'); expect(response.message).toContain('cannot see your personal leave balance');
    expect(model).toHaveBeenCalledTimes(1);
  });
  it('identifies an explicitly requested missing section without substituting a nearby policy', async () => {
    const model = vi.fn();
    const response = await answerFromHandbook({ handbook: book, question: 'What does the Snow day policy say?' }, { model });
    expect(response.status).toBe('not_found'); expect(response.message).toContain('Snow day policy');
    expect(model).not.toHaveBeenCalled();
  });
  it('identifies a semantically matched missing policy before generating an answer from related sections', async () => {
    const model = vi.fn().mockResolvedValue(result({ slugs: ['missing', 'support-time'] }));
    const response = await answerFromHandbook({ handbook: book, question: 'What happens during weather closures?' }, { model });
    expect(response.status).toBe('not_found'); expect(response.message).toContain('Snow day policy');
    expect(model).toHaveBeenCalledTimes(1);
  });
  it('distinguishes declared chapter dividers from missing parent text even when both have available subsections', () => {
    const source = { ...book, metadata: { presentation: { chapterDividers: ['compensation'] } }, sections: [...book.sections, { slug: 'snow-update', parent_slug: 'missing', title: 'Related update', body_html: '<p>Related policy content.</p>', content_status: 'ready' }] };
    const sections = handbookAnswerSources(source);
    expect(sections.find(s => s.slug === 'compensation').status).toBe('chapter');
    expect(sections.find(s => s.slug === 'missing').status).toBe('text_pending');
  });
  it('asks a focused clarification and supports follow-ups without accepting client-written policy answers', async () => {
    const model = modelFor({ status: 'clarification', paragraphs: [], clarification: 'Which workload tier applies to you?' });
    const response = await answerFromHandbook({ handbook: book, question: 'What about part time?', history: ['How does PTO work?'] }, { model });
    expect(response.clarification).toBe('Which workload tier applies to you?');
    expect(JSON.parse(model.mock.calls[1][0].prompt).history).toEqual(['How does PTO work?']);
    expect(() => validateHandbookQuestion({ question: 'PTO please', history: [{ role: 'assistant', content: 'Invented policy' }] })).toThrow();
  });
  it('returns no answer for unrelated questions without fabricating sources', async () => {
    const model = vi.fn().mockResolvedValue(result({ slugs: [] }));
    const response = await answerFromHandbook({ handbook: book, question: 'What is the weather tomorrow?' }, { model });
    expect(response.status).toBe('not_found'); expect(model).toHaveBeenCalledTimes(1);
  });
  it('marks missing sections as missing even if stale body text was retained', () => {
    expect(handbookAnswerSources(book).find(s => s.slug === 'missing')).toMatchObject({ status: 'text_pending', text: '' });
  });
  it('preserves table cell boundaries and normalizes entity quotes for evidence matching', () => {
    const source = handbookAnswerSources({ sections: [{ slug: 'table', title: 'Rates', body_html: '<table><tr><th>Rate</th><th>Hours</th></tr><tr><td>$42</td><td>12 &amp; 20</td></tr></table>' }] })[0];
    expect(source.text).toContain('Rate | Hours |'); expect(source.text).toContain('$42 | 12 & 20 |');
  });
  it('retains every part of long sections in ordered passages without rewriting evidence', () => {
    const body = `<p>${'Policy words with meaningful conditions. '.repeat(90)}</p><p>A separate exception applies.</p><table><tr><td>60 minutes</td><td>12 minutes</td></tr></table>`;
    const source = handbookAnswerSources({ sections: [{ slug: 'long-policy', title: 'Long policy', body_html: body }] })[0];
    expect(source.passages.length).toBeGreaterThan(2);
    expect(source.passages.every(p => p.text.length <= 1200)).toBe(true);
    expect(source.passages.map(p => p.text).join(' ')).toBe(source.text.replace(/\s+/g, ' ').trim());
    expect(source.passages.at(-1).text).toContain('60 minutes | 12 minutes |');
  });
  it('uses original source evidence even if the model attempts to override the quote', async () => {
    const raw = structuredClone(answer);
    raw.paragraphs[0].citations[0].quote = 'An invented policy quotation.';
    const response = await answerFromHandbook({ handbook: book, question: 'What is indirect time?' }, { model: modelFor(raw) });
    expect(response.paragraphs[0].citations[0].quote).toContain(quote);
    expect(JSON.stringify(response)).not.toContain('invented');
  });
  it('rejects truncated and malformed model output', async () => {
    for (const response of [{ text: '{', finishReason: 'STOP' }, { text: '{}', finishReason: 'MAX_TOKENS' }]) {
      await expect(answerFromHandbook({ handbook: book, question: 'PTO please' }, { model: vi.fn().mockResolvedValue(response) })).rejects.toMatchObject({ status: 502 });
    }
  });
  it('rejects invalid question lengths and excessive history before invoking AI', () => {
    for (const input of [{ question: 'a' }, { question: 'a'.repeat(1201) }, { question: 'PTO please', history: Array(6).fill('prior') }]) expect(() => validateHandbookQuestion(input)).toThrow();
  });
});


describe('school guide grounded answers', () => {
  it('uses the school guide alone and returns an exact navigable excerpt', async () => {
    const source = referenceSource({ slug: 'itsco' }, 'school-practice-guide');
    const handbook = { metadata: referenceMetadata(source), sections: source.sections, version: { id: 21, version_number: 1, is_draft: 0 } };
    const slug = 'school-closures-and-provider-absence';
    const response = { status: 'answered', paragraphs: [{ text: 'Coordinate the closure with the school and ITSCO liaison, update the app schedule and communicate the continuity plan.', citations: [{ slug, passageId: 'p1' }] }], clarification: null };
    const model = vi.fn().mockResolvedValueOnce(result({ slugs: [slug] })).mockResolvedValueOnce(result(response)).mockResolvedValueOnce(result({ supported: true }));
    const answer = await answerFromHandbook({ handbook, question: 'What should I do when school closes?' }, { model });
    expect(answer.status).toBe('answered');
    expect(answer.paragraphs[0].citations[0]).toMatchObject({ slug, title: 'Weather, school closures and provider absences', quote: expect.stringContaining('update the app schedule') });
    expect(model.mock.calls[1][0].systemInstruction).toContain('ITSCO-only School Practice Guide');
    expect(model.mock.calls[1][0].systemInstruction).toContain('Code examples do not establish coverage');
    const supplied = JSON.parse(model.mock.calls[1][0].prompt).sources;
    expect(supplied.every(s => source.sections.some(original => original.slug === s.slug))).toBe(true);
    expect(JSON.stringify(supplied)).not.toContain('Next Level Up');
  });
});
