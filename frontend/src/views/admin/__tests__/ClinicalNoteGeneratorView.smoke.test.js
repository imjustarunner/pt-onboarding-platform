import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} }))
  }
}));

vi.mock('../../../store/agency', () => ({
  useAgencyStore: () => ({
    currentAgency: { id: 7, name: 'ITSCO', feature_flags: { noteAidEnabled: true, clinicalNoteGeneratorEnabled: true } },
    currentAgencyId: 7,
    selectedAgencyId: 7,
    userAgencies: [{ id: 7, name: 'ITSCO', feature_flags: { noteAidEnabled: true } }],
    agencies: [{ id: 7, name: 'ITSCO' }]
  })
}));

vi.mock('../../../store/auth', () => ({
  useAuthStore: () => ({
    user: { id: 501, role: 'admin', first_name: 'Test', last_name: 'User' },
    isAuthenticated: true
  })
}));

describe('ClinicalNoteGeneratorView smoke', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('mounts without throwing', async () => {
    const ClinicalNoteGeneratorView = (await import('../ClinicalNoteGeneratorView.vue')).default;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/note-aid', component: ClinicalNoteGeneratorView }]
    });
    await router.push('/note-aid');
    await router.isReady();

    let captured = null;
    const wrapper = mount(ClinicalNoteGeneratorView, {
      global: {
        plugins: [router, createPinia()],
        stubs: {
          Teleport: true,
          RouterLink: true,
          ClinicalArtifactRetentionPanel: true,
          NoteAidLibraryPanel: true,
          ClinicalNoteLibrarySidebar: true,
          ClinicalNoteDetailFetcher: true,
          NoteAidTreatmentSummaryPanel: true,
          NoteAidStartPage: true,
          NoteAidQuickSessionBar: true,
          NoteAidClientPicker: true,
          NoteAidObjectiveRatings: true,
          NoteAidClientContextPanel: true,
          NoteAidCsNoteBuildPanel: true,
          NoteAidCreateClientModal: true,
          NoteAidClientSetupDrawer: true,
          NoteAidDocumentationQueue: true,
          NoteAidTreatmentPlanImportReview: true,
          NoteAidIntakeImportReview: true,
          NoteAidIntakeDraftEditor: true,
          NoteAidDemographicsImportReview: true,
          NoteAidWorkQueuePanel: true,
          NoteAidTodoListImportModal: true,
          NoteAidDiagnosisWriterModal: true,
          NoteAidTreatmentPlanStandaloneModal: true,
          NoteAidSessionContextStrip: true,
          NoteAidStructuredChartPanel: true
        },
        config: {
          errorHandler(err) {
            captured = err;
          }
        }
      }
    });
    await flushPromises();
    if (captured) {
      console.error('captured', captured);
      throw captured;
    }
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toMatch(/Note Aid|Not available|AI Note/i);
  });
});
