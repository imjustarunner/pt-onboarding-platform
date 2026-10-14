import { onUnmounted, ref, unref, watch } from 'vue';
import api from '../services/api';

// The server keeps one current question, so reconnects and late arrivals see it too.
export function useInterviewQuestion({ endpoint, enabled = true }) {
  const question = ref({ id: 0, text: '' }), error = ref(''), sending = ref(false);
  const options = { skipGlobalLoading: true, skipAuthRedirect: true, timeout: 15000 };
  let timer, generation = 0, request = 0;
  function accept(value) {
    if (value && Number(value.id) >= Number(question.value.id)) question.value = value;
  }
  async function refresh() {
    const current = generation;
    if (!unref(enabled) || !unref(endpoint) || request === current) return;
    request = current;
    try {
      const { data } = await api.get(unref(endpoint), options);
      if (current === generation) { accept(data.question); error.value = ''; }
    } catch {
      if (current === generation) error.value = 'The displayed question could not be refreshed.';
    } finally { if (request === current) request = 0; }
  }
  async function display(text) {
    if (sending.value || !unref(enabled)) return;
    const current = generation;
    sending.value = true; error.value = '';
    try {
      const { data } = await api.put(unref(endpoint), { text }, options);
      if (current === generation) accept(data.question);
    } catch {
      if (current === generation) error.value = 'The question was not updated. Please try again.';
    } finally { sending.value = false; }
  }
  watch(() => [unref(endpoint), unref(enabled)], () => {
    ++generation; clearInterval(timer); question.value = { id: 0, text: '' }; error.value = '';
    if (unref(enabled) && unref(endpoint)) { void refresh(); timer = setInterval(refresh, 2000); }
  }, { immediate: true });
  onUnmounted(() => { ++generation; clearInterval(timer); });
  return { question, error, sending, display };
}
