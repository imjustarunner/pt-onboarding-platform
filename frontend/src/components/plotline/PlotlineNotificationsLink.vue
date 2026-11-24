<template>
  <router-link :to="destination" class="pl-notifications-link" :aria-label="label">
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    Notifications
    <span v-if="unread > 0" class="pl-notifications-badge" aria-hidden="true">{{ unread > 99 ? '99+' : unread }}</span>
  </router-link>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { canPollWorkspace, useSessionPolling } from '../../composables/useSessionPolling';
import api from '../../services/api';

const props = defineProps({ agency: { type: Object, required: true } });
const auth = useAuthStore();
const route = useRoute();
const unread = ref(null);
let request = 0, timer;
const destination = computed(() => ({ path: `/${props.agency.portal_url || props.agency.slug}/notifications`, query: { agencyId: String(props.agency.id), scope: 'inbox', status: 'unread' } }));
const label = computed(() => `Notifications for ${props.agency.name || 'this company'}${unread.value > 0 ? `, ${unread.value} unread` : ''}`);

async function refresh() {
  if (!auth.user?.id || !Number(props.agency.id) || !canPollWorkspace() || document.visibilityState === 'hidden') return;
  const current = ++request;
  try {
    // The legacy counts endpoint drops agencyId. Use the indexed inbox with an
    // explicit company filter so another company's unread total never leaks in.
    const { data } = await api.get('/notifications/feed', { params: { agencyId: props.agency.id, scope: 'inbox', status: 'unread', page: 1, pageSize: 1 }, skipGlobalLoading: true });
    if (current !== request) return;
    const count = Number(data?.unreadCount);
    unread.value = Number.isFinite(count) && count >= 0 ? count : null;
  } catch {
    // The inbox remains reachable; an unavailable count is not a zero-count success.
    if (current === request) unread.value = null;
  }
}
watch(() => [props.agency.id, auth.user?.id], () => { ++request; unread.value = null; void refresh(); }, { immediate: true });
watch(() => route.fullPath, () => { void refresh(); });
useSessionPolling(refresh);
onMounted(() => {
  timer = setInterval(refresh, 60000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
});
onUnmounted(() => {
  ++request;
  clearInterval(timer);
  window.removeEventListener('focus', refresh);
  document.removeEventListener('visibilitychange', refresh);
});
</script>
<style scoped>
.pl-notifications-link { display:inline-flex; align-items:center; gap:7px; }
.pl-notifications-badge { min-width:21px; padding:1px 6px; border-radius:20px; background:#143e33; color:white; text-align:center; font-size:12px; font-weight:700; }
.pl-notifications-link:focus-visible { outline:3px solid #b97350; outline-offset:4px; border-radius:3px; }
</style>
