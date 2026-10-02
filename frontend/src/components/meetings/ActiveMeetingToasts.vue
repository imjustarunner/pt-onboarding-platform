<template>
  <aside v-if="visible.length && !inMeeting" class="active-meeting-toasts" aria-label="Meetings you can join" aria-live="polite">
    <div v-for="meeting in visible" :key="`${meeting.key}:${meeting.latestJoin?.key || ''}`" class="active-meeting-toast" :class="{ 'active-meeting-toast--arrival': recentArrival(meeting) }">
      <div><strong>{{ meeting.title }}</strong><br><span v-if="recentArrival(meeting)">{{ meeting.latestJoin.displayName }} joined the meeting.</span>
        <span v-else>{{ meeting.isLive ? 'In progress' : 'Starting soon' }}</span>
        <br v-if="meeting.presentCount > 0"><span v-if="meeting.presentCount > 0">{{ meeting.presentCount }} {{ meeting.presentCount === 1 ? 'person here' : 'people here' }}<template v-if="meeting.waitingCount > 0"> · {{ meeting.waitingCount }} waiting for admission</template></span></div>
      <button type="button" @click="join(meeting)">{{ meeting.previouslyJoined ? 'Rejoin' : 'Join' }}</button>
      <button type="button" :aria-label="`Dismiss ${meeting.title} for this meeting`" @click="dismiss(meeting.key)">×</button>
    </div>
  </aside>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { navigateToJoinLink } from '../../utils/appJoinNavigation';
import { hasLiveMeeting } from '../../utils/liveMeetingPresence';
import { useActiveMeeting } from '../../composables/useActiveMeeting';
const props = defineProps({ userId: { type: [Number,String], required: true } });
const route = useRoute();
const router = useRouter();
const mini = useActiveMeeting();
const prompts = ref([]);
const storageKey=()=>`meeting-dismissals:${props.userId}`;
function savedDismissals(){try{const value=JSON.parse(localStorage.getItem(storageKey())||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
const dismissed = ref(savedDismissals());
const now = ref(Date.now());
const meetingElsewhere = ref(hasLiveMeeting());
const inMeeting = computed(() => meetingElsewhere.value || route.meta?.publicMarketingHub || (mini.state.active && mini.state.connected !== false) || /\/join\/(team-meeting|supervision|invitation)(\/|$)/.test(route.path));
function recentArrival(meeting) {
  const joined = Date.parse(meeting.latestJoin?.joinedAt || '');
  return Number.isFinite(joined) && now.value >= joined && now.value - joined < 90000;
}
const visible = computed(() => prompts.value.filter(meeting => {
  const saved = dismissed.value[meeting.key];
  const until = typeof saved === 'number' ? saved : saved?.until;
  if (!(until > now.value)) return true;
  return recentArrival(meeting) && saved?.arrivalKey !== meeting.latestJoin?.key;
}));
let timer;
let inFlight = false;
let mounted = true;
async function refresh() {
  now.value = Date.now();
  meetingElsewhere.value = hasLiveMeeting();
  if (inFlight || !props.userId) return;
  const uid = props.userId;
  inFlight = true;
  try {
    const { data } = await api.get('/meeting-invitations/active', { skipGlobalLoading: true, skipAuthRedirect: true });
    if (mounted && uid === props.userId) prompts.value = Array.isArray(data?.prompts) ? data.prompts : [];
  } catch { if (mounted) prompts.value = []; }
  finally { inFlight = false; }
}
function dismiss(key) {
  const meeting = prompts.value.find(row => row.key === key);
  dismissed.value = Object.fromEntries(Object.entries({ ...dismissed.value,
    [key]: { until: Date.now() + 7 * 86400000, arrivalKey: meeting?.latestJoin?.key || null }
  }).filter(([, saved]) => (typeof saved === 'number' ? saved : saved?.until) > Date.now()));
  try { localStorage.setItem(storageKey(), JSON.stringify(dismissed.value)); } catch { /* storage optional */ }
}
function join(meeting) { navigateToJoinLink(router,meeting.joinUrl); }
watch(() => props.userId, () => { prompts.value=[]; dismissed.value=savedDismissals(); void refresh(); });
watch(() => route.path, () => { if (!inMeeting.value) void refresh(); });
onMounted(() => { void refresh(); timer=setInterval(refresh,15000); window.addEventListener('focus',refresh); });
onUnmounted(() => { mounted=false; clearInterval(timer); window.removeEventListener('focus',refresh); });
</script>
<style scoped>
.active-meeting-toasts { position:fixed; bottom:max(20px,env(safe-area-inset-bottom)); left:16px; z-index:1100; display:grid; gap:8px; width:min(440px,calc(100vw - 32px)); max-height:45dvh; overflow:auto; }
.active-meeting-toast { display:flex; align-items:center; gap:12px; padding:12px; color:#fff; background:#123d34; border:1px solid #6ee7b7; border-radius:12px; box-shadow:0 4px 20px #0004; }
.active-meeting-toast div { flex:1; min-width:0; overflow-wrap:anywhere; }
.active-meeting-toast button { min-height:44px; padding:6px 12px; border:0; border-radius:8px; cursor:pointer; background:#ecfdf5; color:#064e3b; }
.active-meeting-toast--arrival { animation: meeting-arrival 1s ease-in-out 3; }
@keyframes meeting-arrival { 50% { border-color: #fff; box-shadow: 0 0 0 3px #6ee7b777; } }
@media (prefers-reduced-motion: reduce) { .active-meeting-toast--arrival { animation: none; border-color: #fff; } }
</style>
