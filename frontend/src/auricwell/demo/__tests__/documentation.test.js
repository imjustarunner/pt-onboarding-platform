import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import StartPage from '../../../components/clinical/NoteAidStartPage.vue';
import { DEMO_NOTE_NOTICE, createDemoNoteFixtures, demoNoteAction } from '../notes';

const mutations = vi.hoisted(() => ({ sign: vi.fn(), save: vi.fn() }));
vi.mock('../../../views/admin/ClinicalNoteGeneratorView.vue', () => ({ default: {
  props: ['demoPresentation'],
  setup: () => ({ mutations }),
  template: '<div><h1>{{ demoPresentation.heading }}</h1><button @click="mutations.sign()">Sign and open next in queue</button><button @click="mutations.save()">Save Draft</button><button @click="mutations.sign()">Cosign &amp; approve for billing review</button><button>Signature details</button></div>'
} }));
import Documentation from '../DemoDocumentation.vue';

let wrapper;
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.clearAllMocks(); });

describe('real workspace start presentation', () => {
  it('preserves the normal start screen when no presentation is supplied', () => {
    wrapper = mount(StartPage);
    expect(wrapper.get('h1').text()).toBe('No note selected');
    expect(wrapper.text()).toContain('Select a note from the library');
    expect(wrapper.findAll('button').filter(button => button.text().includes('Create'))).toHaveLength(2);
  });
  it('supports the demo instruction while retaining the shared component', () => {
    wrapper = mount(StartPage, { props: { heading: 'Please choose a draft or a note from your My Work.', description: 'Open a fictional example.', hasNextInProgress: true } });
    expect(wrapper.get('h1').text()).toBe('Please choose a draft or a note from your My Work.');
    expect(wrapper.text()).toContain('Open a fictional example.');
    expect(wrapper.findAll('button').find(button => button.text().includes('Select next')).attributes('disabled')).toBeUndefined();
  });
});

describe('demo action isolation', () => {
  it('intercepts real save, sign and cosign handlers and opens another fictional example', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/meadowbrook/documentation', component: { template: '<span />' } }] });
    await router.push('/meadowbrook/documentation?draftId=990131&clientId=990121');
    await router.isReady();
    const notices = [];
    const listener = event => notices.push(event.detail);
    window.addEventListener('aw-demo-notice', listener);
    try {
      wrapper = mount(Documentation, { global: { plugins: [router] } });
      await wrapper.findAll('.demo-doc-workspace button').find(button => button.text() === 'Save Draft').trigger('click');
      await wrapper.findAll('.demo-doc-workspace button').find(button => button.text().startsWith('Cosign')).trigger('click');
      expect(mutations.save).not.toHaveBeenCalled();
      expect(mutations.sign).not.toHaveBeenCalled();
      await wrapper.findAll('.demo-doc-workspace button').find(button => button.text().startsWith('Sign and')).trigger('click');
      await flushPromises();
      expect(mutations.sign).not.toHaveBeenCalled();
      expect(router.currentRoute.value.query.draftId).toBe('990132');
      expect(router.currentRoute.value.query.clientId).toBeUndefined();
      expect(notices).toEqual([DEMO_NOTE_NOTICE, DEMO_NOTE_NOTICE, DEMO_NOTE_NOTICE]);
      await wrapper.get('[data-analytics-id="demo-note-open-cosign"]').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.query).toEqual({ agencyId: '990101', noteId: '990181', launchIntent: 'cosign' });
    } finally { window.removeEventListener('aw-demo-notice', listener); }
  });
  it('does not block read-only review and navigation controls', () => {
    for (const textContent of ['Signature details', 'Notes to co-sign (2)', 'Select next in progress', 'Show library', 'Close', 'Return / provide feedback']) expect(demoNoteAction({ textContent })).toBeNull();
    for (const textContent of ['Sign', 'Sign and open next in progress', 'Cosign & approve for billing review', 'Save Draft', 'Send request', 'Start recording', 'Generate note']) expect(demoNoteAction({ textContent })).not.toBeNull();
  });
  it('advances from the viewed client when the shared workspace has consumed draftId', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/meadowbrook/documentation', component: { template: '<span />' } }] });
    await router.push('/meadowbrook/documentation?clientId=990121');
    await router.isReady();
    wrapper = mount(Documentation, { global: { plugins: [router] } });
    await wrapper.get('[data-analytics-id="demo-note-simulate-sign-next"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.draftId).toBe('990132');
    expect(mutations.sign).not.toHaveBeenCalled();
    // Simulate the same query consumption after the next draft opens.
    await router.replace('/meadowbrook/documentation?clientId=990122');
    await wrapper.get('[data-analytics-id="demo-note-simulate-sign-next"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.draftId).toBe('990133');
  });
});

describe('fictional note fixtures', () => {
  const clients = Array.from({ length: 8 }, (_, index) => ({ id: 990121 + index, full_name: `Fictional Client ${index + 1}`, initials: `F${index + 1}` }));
  const practice = { id: 990101, name: 'Fictional practice' };
  const notes = createDemoNoteFixtures({ practice, actor: { id: 990111 }, clients, weekStart: '2026-11-02' });
  it('connects all drafts to their own client, encounter and treatment objective', () => {
    expect(notes.drafts).toHaveLength(3);
    for (const draft of notes.drafts) {
      expect(draft.output_json.meta.structuredChart.clientId).toBe(draft.client_id);
      const chart = notes.chartExtras(draft.client_id);
      expect(chart.latestPlan.goals[0].objectives[0].scale_target).toBe(8);
      expect(chart.objectiveRatings[0].scale_value).toBe(5);
      expect(chart.objectiveRatings[0].date_of_service).toBe('2026-10-26');
    }
    expect(notes.workQueue.every(item => notes.drafts.some(draft => draft.id === item.draftId && draft.client_id === item.clientId))).toBe(true);
    expect(notes.drafts[1].output_json.meta).toMatchObject({ aiGenerated: true, recordingConsent: { status: 'consented', exampleOnly: true } });
    expect(notes.drafts[0].output_json.meta.aiGenerated).toBe(false);
  });
  it('supplies matching real supervisor review snapshots with complete service details and rated objectives', () => {
    const queue = notes.response('/me/notes-to-sign');
    expect(queue.isSupervisor).toBe(true);
    expect(queue.notes.map(note => note.client_id)).toEqual([990124, 990125]);
    for (const item of queue.notes) {
      const detail = notes.response(`/medical-billing/notes/${item.clinical_note_id}`).note;
      const review = notes.response(`/supervision/supervisee/990114/document-reviews/note/${item.clinical_note_id}`);
      expect(detail.providerSignedByUserId).toBe(990114);
      expect(detail.assignedSupervisor.id).toBe(990113);
      expect(detail.reviewSnapshotToken).toBe(review.reviewSnapshotToken);
      expect(review.canCosign).toBe(true);
      expect(review.canTrackCosignTime).toBe(false);
      expect(detail.objectiveRatings[0]).toMatchObject({ scaleStart: 3, scalePrevious: 5, scaleValue: 6, scaleTarget: 8 });
      expect(detail).toMatchObject({ durationMinutes: 45, startTime: '09:00', endTime: '09:45', placeOfService: '10' });
    }
  });
  it('rejects unknown signed notes and supervisee substitutions, with no mutation API fixtures', () => {
    expect(() => notes.response('/medical-billing/notes/1')).toThrow(/outside/);
    expect(() => notes.response('/supervision/supervisee/990112/document-reviews/note/990181')).toThrow(/outside/);
    expect(notes.response('/medical-billing/notes/990181/cosign')).toBeUndefined();
    expect(notes.response('/clinical-notes/generate')).toBeUndefined();
    expect(notes.response('/medical-billing/notes/review-work')).toEqual({ items: [] });
    expect(notes.response('/clinical-notes/drafts/990131/appointment')).toMatchObject({ linked: true, context: { draftId: 990131, clientId: 990121, clinicalSessionId: 990191 } });
    expect(notes.response('/clinical-data/sessions/990191/materials')).toEqual([]);
    expect(() => notes.response('/clinical-data/sessions/1/materials')).toThrow(/outside/);
  });
});
