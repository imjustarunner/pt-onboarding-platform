import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../services/messagingApi';
import { useAuthStore } from '../store/auth';
import { useSessionLockStore } from '../store/sessionLock';

// Only counts and draft IDs; message content never enters browser storage.
export function useEmailWorkspace(agencyId, enabled = () => true) {
  const auth = useAuthStore(), lock = useSessionLockStore();
  const summary = ref(null);
  const available = computed(() => enabled() && agencyId.value && auth.user?.id && !lock.isLocked && !lock.warningActive);
  let generation = 0, controller, timer, debounce;
  async function refresh() {
    if (!available.value) return;
    const request = ++generation;
    controller?.abort(); controller = new AbortController();
    try {
      const { data } = await api.get('/communications/drafts/summary', {
        params: { agencyId: agencyId.value }, signal: controller.signal, skipGlobalLoading: true
      });
      if (request === generation) summary.value = data;
    } catch { /* Keep the last confirmed counts during a connection interruption. */ }
  }
  function changed(event) {
    if (event.type === 'message' && (event.origin !== window.location.origin || event.data?.type !== 'email-drafts-changed')) return;
    clearTimeout(debounce); debounce = setTimeout(refresh, 750);
  }
  function visibleRefresh() { if (!document.hidden) void refresh(); }
  watch([agencyId, () => auth.user?.id, available], () => {
    ++generation; controller?.abort(); summary.value = null; void refresh();
  });
  onMounted(() => {
    void refresh(); timer = setInterval(visibleRefresh, 30000);
    window.addEventListener('email-workspace-changed', changed);
    window.addEventListener('message', changed);
    window.addEventListener('focus', visibleRefresh);
    window.addEventListener('online', visibleRefresh);
  });
  onUnmounted(() => {
    ++generation; controller?.abort(); clearInterval(timer); clearTimeout(debounce);
    window.removeEventListener('email-workspace-changed', changed);
    window.removeEventListener('message', changed);
    window.removeEventListener('focus', visibleRefresh);
    window.removeEventListener('online', visibleRefresh);
  });
  const draftByConversation = computed(() => {
    const drafts = {};
    for (const d of summary.value?.conversationDrafts || []) if (!drafts[d.conversation_id]) drafts[d.conversation_id] = d.id;
    return drafts;
  });
  return { summary, refresh, draftByConversation };
}
