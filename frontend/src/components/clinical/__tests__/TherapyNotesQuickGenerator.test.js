import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TherapyNotesQuickGenerator from '../TherapyNotesQuickGenerator.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

const agency = { id: 6, slug: 'nlu', name: 'Next Level Up' };
const tools = [
  { id: 'clinical_h0004_note', name: 'H0004 Note Writer', description: 'Organize a skills session into trained sections.', serviceCodes: ['H0004'] },
  { id: 'clinical_psychotherapy_note', name: 'Individual psychotherapy note', description: 'Individual progress note.', serviceCodes: ['90832', '90834', '90837'] },
  { id: 'clinical_psychotherapy_plan', name: 'Treatment plan writer', description: 'Treatment goals and objectives.', serviceCodes: [] }
];
const sections = { Subjective: 'Client described school stress.', Objective: 'Client practiced a coping skill.', Interventions: 'Skills coaching', Plan: 'Practice the skill this week.' };
const savedNote = (overrides = {}) => ({ id: 42, clientName: 'Alex Sample', dateOfService: '2026-11-14',
  toolId: tools[0].id, toolName: tools[0].name, serviceCode: 'H0004', inputText: 'Client practiced coping.',
  outputJson: { sections: { ...sections }, meta: { toolId: tools[0].id, quickCopyOnly: true, clientName: 'Alex Sample' } }, ...overrides });
const summary = note => ({ id: note.id, clientName: note.clientName, dateOfService: note.dateOfService, toolId: note.toolId, toolName: note.toolName });
let wrappers = [];
let stored;

beforeEach(() => {
  vi.clearAllMocks();
  stored = savedNote();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } });
  vi.stubGlobal('MediaRecorder', class {
    constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic dictation'], { type: this.mimeType }) }); this.onstop?.(); }
  });
  api.get.mockImplementation(async url => {
    if (url.endsWith('/catalog')) return { data: { enabled: true, tools } };
    if (url.endsWith('/recent')) return { data: { notes: [summary(stored)] } };
    if (url.endsWith('/notes/42')) return { data: { note: structuredClone(stored) } };
    throw new Error(`Unexpected GET ${url}`);
  });
  api.post.mockImplementation(async (url, body) => {
    if (url.endsWith('/transcribe')) return { data: { text: 'Dictated clinical facts.' } };
    stored = savedNote({ clientName: body.clientName, dateOfService: body.dateOfService, inputText: body.inputText, toolId: body.toolId });
    return { data: { note: structuredClone(stored), quickCopyNoteId: stored.id } };
  });
  api.patch.mockImplementation(async (_url, body) => {
    stored = { ...stored, clientName: body.clientName, dateOfService: body.dateOfService, inputText: body.inputText,
      outputJson: { ...stored.outputJson, sections: { ...body.sections } } };
    return { data: { note: structuredClone(stored) } };
  });
});
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers = []; vi.unstubAllGlobals(); });

async function generator() {
  const wrapper = mount(TherapyNotesQuickGenerator, { props: { agency } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
async function author(wrapper, toolId = tools[0].id) {
  await wrapper.find(`[data-tool-id="${toolId}"]`).trigger('click');
  await wrapper.find('[name="quick-copy-client-name"]').setValue('Alex Sample');
  await wrapper.find('[name="quick-copy-date"]').setValue('2026-11-14');
  await wrapper.find('[name="quick-copy-input"]').setValue('Client practiced coping.');
}
async function generate(wrapper) { await author(wrapper); await wrapper.find('form').trigger('submit'); await flushPromises(); }
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text);

describe('separate Therapy Notes generator', () => {
  it('offers the full catalog including H0004 and plans without loading clinical eligibility or client context', async () => {
    const wrapper = await generator();
    expect(wrapper.find('[data-tool-id="clinical_h0004_note"]').exists()).toBe(true);
    expect(wrapper.find('[data-tool-id="clinical_psychotherapy_plan"]').exists()).toBe(true);
    expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/clinical-notes/quick-copy/catalog', '/clinical-notes/quick-copy/recent']);
    expect(api.get).toHaveBeenCalledWith('/clinical-notes/quick-copy/catalog', expect.objectContaining({ params: { agencyId: 6 } }));
    await wrapper.find('#tng-tools-search').setValue('H0004');
    expect(wrapper.findAll('[data-tool-id]')).toHaveLength(1);
  });

  it('accepts the full client name and date without jumping into the clinical workspace', async () => {
    const wrapper = await generator();
    await wrapper.find('[data-tool-id="clinical_h0004_note"]').trigger('click');
    await wrapper.find('[name="quick-copy-client-name"]').setValue('A');
    expect(wrapper.find('[name="quick-copy-client-name"]').exists()).toBe(true);
    await wrapper.find('[name="quick-copy-client-name"]').setValue('Alex Sample');
    expect(wrapper.find('[name="quick-copy-client-name"]').element.value).toBe('Alex Sample');
    expect(wrapper.find('[name="quick-copy-date"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Attach a client');
    expect(wrapper.text()).not.toContain('Restore 60');
    expect(wrapper.text()).not.toContain('Manual writer');
  });

  it('groups the catalog into the previous aid families and filters by a selected section', async () => {
    const wrapper=await generator();
    expect(wrapper.findAll('.tng-family h3').map(node=>node.text())).toEqual(['Universal Aids','Psychotherapy Aids']);
    await wrapper.findAll('.tng-categories button').find(node=>node.text()==='Psychotherapy Aids').trigger('click');
    expect(wrapper.find('[data-tool-id="clinical_h0004_note"]').exists()).toBe(false);
    expect(wrapper.find('[data-tool-id="clinical_psychotherapy_note"]').exists()).toBe(true);
    expect(wrapper.find('.tng-catalog-toolbar').text()).toContain('2 generators');
  });

  it('opens service information without selecting a generator or creating a note', async () => {
    const wrapper=await generator();
    api.get.mockResolvedValueOnce({data:{serviceInfo:{code:'H0004',title:'H0004 service reference',status:'available',source:{title:'Supplied handbook',pages:[1]},serviceDescription:'Existing supplied service description.'}}});
    await wrapper.find('button[aria-label="Service information for H0004"]').trigger('click');
    await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/clinical-notes/quick-copy/service-reference/H0004',{params:{agencyId:6}});
    expect(document.body.textContent).toContain('Existing supplied service description.');
    expect(wrapper.find('[name="quick-copy-client-name"]').exists()).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    await wrapper.find('button[aria-label="Service information for H0004"]').trigger('keydown',{key:'Escape'});
  });

  it('starts another note from the bottom after saving reviewed text', async () => {
    const wrapper=await generator();await generate(wrapper);
    await wrapper.find('.tng-section textarea').setValue('Reviewed and saved before starting another note.');
    await wrapper.find('[data-testid="new-note-bottom"]').trigger('click');await flushPromises();
    expect(api.patch).toHaveBeenCalledWith('/clinical-notes/quick-copy/notes/42',expect.objectContaining({sections:expect.objectContaining({Subjective:'Reviewed and saved before starting another note.'})}),expect.any(Object));
    expect(wrapper.find('.tng-output').exists()).toBe(false);
    expect(wrapper.find('#tng-tools-search').exists()).toBe(true);
    expect(wrapper.find('.tng-history__note').text()).toContain('Alex Sample');
  });

  it('generates and saves H0004 through the dedicated endpoint with no chart, session, or duration fields', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/clinical-notes/quick-copy/generate');
    expect(payload).toEqual({ agencyId: 6, clientName: 'Alex Sample', dateOfService: '2026-11-14', inputText: 'Client practiced coping.',
      toolId: 'clinical_h0004_note', serviceCode: 'H0004' });
    expect(wrapper.findAll('.tng-section')).toHaveLength(4);
    expect(wrapper.find('.tng-save-status').text()).toContain('Saved.');
    expect(wrapper.find('.tng-history__note').text()).toContain('Alex Sample');
    expect(wrapper.find('.tng-output-head').text()).toContain('2026-11-14');
  });

  it('supports a trained generator that has no billing service code', async () => {
    const wrapper = await generator();
    await author(wrapper, 'clinical_psychotherapy_plan');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/clinical-notes/quick-copy/generate', expect.objectContaining({ toolId: 'clinical_psychotherapy_plan' }), expect.any(Object));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('serviceCode');
  });

  it('reopens a saved unlinked note by name and date and copies the edited section body', async () => {
    const wrapper = await generator();
    await wrapper.find('#tng-search').setValue('2026-11-14');
    await wrapper.find('.tng-history__note').trigger('click');
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/clinical-notes/quick-copy/notes/42', expect.objectContaining({ params: { agencyId: 6 } }));
    expect(wrapper.find('[name="quick-copy-client-name"]').element.value).toBe('Alex Sample');
    const section = wrapper.find('.tng-section');
    await section.find('textarea').setValue('Reviewed wording from the clinician.');
    await section.find('button').trigger('click');
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('Reviewed wording from the clinician.');
    expect(section.find('button').text()).toBe('Copied');
    await button(wrapper, 'Copy all sections').trigger('click');
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining('S - Subjective\nReviewed wording from the clinician.'));
  });

  it('saves reviewed sections to the same unlinked note for future copying', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    await wrapper.find('.tng-section textarea').setValue('Clinician-reviewed section.');
    await button(wrapper, 'Save changes').trigger('click');
    await flushPromises();
    expect(api.patch).toHaveBeenCalledWith('/clinical-notes/quick-copy/notes/42', expect.objectContaining({ agencyId: 6, clientName: 'Alex Sample', dateOfService: '2026-11-14',
      sections: expect.objectContaining({ Subjective: 'Clinician-reviewed section.' }) }), expect.any(Object));
    expect(wrapper.find('.tng-save-status').text()).toContain('Saved.');
    await button(wrapper, '+ New note').trigger('click');
    await flushPromises();
    await wrapper.find('.tng-history__note').trigger('click');
    await flushPromises();
    expect(wrapper.find('.tng-section textarea').element.value).toBe('Clinician-reviewed section.');
  });

  it('preserves edits and the open note when saving fails instead of navigating away', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    await wrapper.find('.tng-section textarea').setValue('Keep this unsaved clinical wording.');
    api.patch.mockRejectedValueOnce({ response: { data: { error: { message: 'Please retry.' } } } });
    await button(wrapper, '+ New note').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('Changes could not be saved. Please retry.');
    expect(wrapper.find('.tng-section textarea').element.value).toBe('Keep this unsaved clinical wording.');
    expect(wrapper.find('[name="quick-copy-client-name"]').element.value).toBe('Alex Sample');
    expect(wrapper.find('.tng-save-status').text()).toContain('Changes awaiting save');
  });

  it('retains the existing generated result if regeneration fails', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    api.post.mockRejectedValueOnce(new Error('Generator temporarily unavailable.'));
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe('Generator temporarily unavailable.');
    expect(wrapper.findAll('.tng-section')).toHaveLength(4);
    expect(wrapper.find('.tng-section textarea').element.value).toBe(sections.Subjective);
  });

  it('flushes reviewed section changes before allowing a route change', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    await wrapper.find('.tng-section textarea').setValue('Save this before leaving.');
    await expect(wrapper.vm.prepareToLeave()).resolves.toBe(true);
    expect(api.patch).toHaveBeenCalledWith('/clinical-notes/quick-copy/notes/42', expect.objectContaining({
      sections: expect.objectContaining({ Subjective: 'Save this before leaving.' })
    }), expect.any(Object));
    expect(wrapper.find('.tng-save-status').text()).toContain('Saved.');
  });

  it('blocks a route change when pending edits cannot be saved', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    await wrapper.find('.tng-section textarea').setValue('Keep this if saving fails.');
    api.patch.mockRejectedValueOnce(new Error('Save unavailable.'));
    await expect(wrapper.vm.prepareToLeave()).resolves.toBe(false);
    expect(wrapper.find('.tng-section textarea').element.value).toBe('Keep this if saving fails.');
    expect(wrapper.find('[role="alert"]').text()).toContain('Changes could not be saved.');
  });

  it('asks the browser to protect unsaved edits and removes that protection after saving', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await wrapper.find('.tng-section textarea').setValue('Unsaved before browser navigation.');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    await wrapper.vm.prepareToLeave();
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });

  it('records clinician dictation and appends the reviewed transcription without session attachment', async () => {
    const wrapper = await generator();
    await author(wrapper);
    await button(wrapper, '🎙 Dictate your notes').trigger('click');
    await flushPromises();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(wrapper.text()).toContain('Recording your dictation');
    await button(wrapper, '■ Stop dictation').trigger('click');
    await flushPromises();
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/clinical-notes/quick-copy/transcribe');
    expect(body.get('agencyId')).toBe('6');
    expect(body.get('recordingPurpose')).toBe('dictation');
    expect(body.get('audio').size).toBeGreaterThan(0);
    expect(body.has('clientId')).toBe(false);
    expect(wrapper.find('[name="quick-copy-input"]').element.value).toBe('Client practiced coping.\n\nDictated clinical facts.');
  });

  it('keeps text available for manual copying when clipboard access fails', async () => {
    const wrapper = await generator();
    await generate(wrapper);
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard denied'));
    await wrapper.find('.tng-section button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.tng-copy-status').text()).toContain('copy it manually');
    expect(wrapper.find('.tng-section textarea').element.value).toBe(sections.Subjective);
  });

  it('honors the organization disable switch without opening the full workspace instead', async () => {
    api.get.mockResolvedValueOnce({ data: { enabled: false, tools: [] } });
    const wrapper = await generator();
    expect(wrapper.find('.tng-unavailable').text()).toContain('disabled for this organization');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
