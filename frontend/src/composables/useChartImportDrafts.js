import { reactive } from 'vue';
import api from '../services/api';

// PHI stays in encrypted server records; never put these drafts in browser storage.
export function useChartImportDrafts() {
  const state = reactive({ loading: false, loadError: '', sections: {} });
  let current = null;
  function createScope(clientId, agencyId) {
    return { clientId, agencyId, sections: {}, config: { skipGlobalLoading: true, headers: { 'X-Agency-Id': String(agencyId) } } };
  }
  async function load(clientId, agencyId) {
    flush();
    const scope = createScope(clientId, agencyId);
    current = scope;
    state.loading = true; state.loadError = ''; state.sections = {};
    try {
      const response = await api.get(`/clients/${clientId}/chart-import/drafts`, scope.config);
      if (current !== scope) return null;
      for (const key of ['demographics', 'intake', 'plan', 'insurance', 'contacts', 'comments', 'payer', 'billingComments']) {
        const saved = response.data?.drafts?.[key];
        scope.sections[key] = reactive({ revision: saved?.revision || 0, value: saved?.value || { text: '' }, pending: null, running: null, timer: null, message: saved?.value?.text ? 'Draft saved' : '', error: '' });
        state.sections[key] = scope.sections[key];
      }
      return response.data?.drafts || {};
    } catch (error) {
      if (current === scope) state.loadError = error.response?.data?.error?.message || 'Drafts could not be loaded. Reopen this panel to retry; your paste is still here.';
      return null;
    } finally { if (current === scope) state.loading = false; }
  }
  function schedule(key, value) {
    const section = current?.sections[key];
    if (!section) return;
    const comparable = draft => {
      const metadata = draft?.metadata || draft || {};
      return { text: draft?.text || '', imported: metadata.imported === true, needsReview: metadata.needsReview === true, sourceDate: metadata.sourceDate || '', sourceAuthor: metadata.sourceAuthor || '', position: metadata.position || 'primary' };
    };
    if (JSON.stringify(comparable(value)) === JSON.stringify(comparable(section.value)) && !section.pending) return;
    section.pending = structuredClone(value);
    section.message = 'Saving draft…';
    clearTimeout(section.timer);
    const scope = current;
    section.timer = setTimeout(() => save(scope, key), 500);
  }
  async function save(scope, key) {
    const section = scope.sections[key];
    clearTimeout(section.timer);
    if (section.running) return section.running;
    if (!section.pending) return;
    section.running = (async () => {
      while (section.pending) {
        const value = section.pending;
        section.pending = null;
        try {
          const response = await api.put(`/clients/${scope.clientId}/chart-import/drafts/${key}`, { text: value.text, metadata: value.metadata, revision: section.revision }, scope.config);
          section.revision = response.data.revision; section.value = value;
          section.error = ''; section.message = section.pending ? 'Saving draft…' : 'Draft saved';
        } catch (error) {
          section.pending ||= value;
          section.error = error.response?.data?.error?.message || 'Draft could not be saved. Retry before closing.';
          section.message = 'Draft not saved';
          break;
        }
      }
    })();
    try { await section.running; } finally { section.running = null; }
  }
  function flush(key) {
    if (!current) return Promise.resolve();
    return Promise.all((key ? [key] : Object.keys(current.sections)).map(name => save(current, name)));
  }
  async function retry(key) {
    const scope = current, section = scope?.sections[key];
    if (!section) return;
    try {
      const response = await api.get(`/clients/${scope.clientId}/chart-import/drafts`, scope.config);
      section.revision = response.data?.drafts?.[key]?.revision || 0;
      await save(scope, key);
    } catch (error) { section.error = error.response?.data?.error?.message || 'The latest draft could not be loaded. Your paste is still here.'; }
  }
  function detach() { flush(); current = null; }
  return { state, load, schedule, flush, retry, detach };
}
