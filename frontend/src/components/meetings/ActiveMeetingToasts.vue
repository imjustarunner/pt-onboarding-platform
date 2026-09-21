<template>
  <aside v-if="visible.length && !inMeeting" class="active-meeting-toasts" aria-label="Meetings you can join" aria-live="polite">
    <div v-for="meeting in visible" :key="meeting.key" class="active-meeting-toast">
      <div><strong>{{ meeting.title }}</strong><br><span>{{ meeting.isLive ? 'In progress' : 'Starting soon' }}</span></div>
      <button type="button" @click="join(meeting)">{{ meeting.previouslyJoined ? 'Rejoin' : 'Join' }}</button>
      <button type="button" :aria-label="`Dismiss ${meeting.title} for 15 minutes`" @click="dismiss(meeting.key)">×</button>
    </div>
  </aside>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { navigateToJoinLink } from '../../utils/appJoinNavigation';
import { useActiveMeeting } from '../../composables/useActiveMeeting';
const props = defineProps({ userId: { type: [Number,String], required: true } });
const route = useRoute();
const router = useRouter();
const mini = useActiveMeeting();
const prompts = ref([]);
const dismissed = ref({});
const now = ref(Date.now());
const inMeeting = computed(() => mini.state.active || /\/join\/(team-meeting|supervision|invitation)(\/|$)/.test(route.path));
const visible = computed(() => prompts.value.filter(m => !(dismissed.value[m.key] > now.value)));
let timer;
let inFlight = false;
let mounted = true;
async function refresh() {
  now.value = Date.now();
  if (inFlight || !props.userId) return;
  const uid = props.userId;
  inFlight = true;
  try {
    const { data } = await api.get('/meeting-invitations/active', { skipGlobalLoading: true, skipAuthRedirect: true });
    if (mounted && uid === props.userId) prompts.value = Array.isArray(data?.prompts) ? data.prompts : [];
  } catch { if (mounted) prompts.value = []; }
  finally { inFlight = false; }
}
function dismiss(key) { dismissed.value = {...dismissed.value,[key]:Date.now()+15*60*1000}; }
function join(meeting) { navigateToJoinLink(router,meeting.joinUrl); }
watch(() => props.userId, () => { prompts.value=[]; dismissed.value={}; void refresh(); });
watch(() => route.path, () => { if (!inMeeting.value) void refresh(); });
onMounted(() => { void refresh(); timer=setInterval(refresh,15000); window.addEventListener('focus',refresh); });
onUnmounted(() => { mounted=false; clearInterval(timer); window.removeEventListener('focus',refresh); });
</script>
<style scoped>
.active-meeting-toasts { position:fixed; bottom:max(20px,env(safe-area-inset-bottom)); left:16px; z-index:1100; display:grid; gap:8px; width:min(440px,calc(100vw - 32px)); max-height:45dvh; overflow:auto; }
.active-meeting-toast { display:flex; align-items:center; gap:12px; padding:12px; color:#fff; background:#123d34; border:1px solid #6ee7b7; border-radius:12px; box-shadow:0 4px 20px #0004; }
.active-meeting-toast div { flex:1; min-width:0; overflow-wrap:anywhere; }
.active-meeting-toast button { min-height:44px; padding:6px 12px; border:0; border-radius:8px; cursor:pointer; background:#ecfdf5; color:#064e3b; }
</style>
