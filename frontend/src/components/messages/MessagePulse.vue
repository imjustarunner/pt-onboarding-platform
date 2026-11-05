<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { Activity } from '@lucide/vue';
import api from '../../services/api';

const props = defineProps({ threadId: { type: [Number, String], required: true }, messageId: { type: [Number, String], required: true } });
const uid = useId();
const trigger = ref(null);
const dialog = ref(null);
const preview = ref(false);
const opened = ref(false);
const loading = ref(false);
const error = ref('');
const pulse = ref(null);
const previewPosition = ref({});
const filter = ref('all');
let loadedAt = 0;
let requestVersion = 0;
let pending = null;
let hideTimer;
let returnFocus;

const seen = computed(() => pulse.value?.recipients.filter(person => person.firstSeenAt) || []);
const recipients = computed(() => (pulse.value?.recipients || []).filter(person => filter.value === 'all' || (filter.value === 'seen' ? !!person.firstSeenAt : !person.firstSeenAt)));
const percent = computed(() => pulse.value?.recipientCount ? Math.round(pulse.value.seenCount / pulse.value.recipientCount * 100) : 0);
const formatDate = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function load(force = false) {
  if (pending) return pending;
  if (!force && pulse.value && Date.now() - loadedAt < 10000) return;
  const version = ++requestVersion;
  loading.value = true; error.value = '';
  pending = (async () => {
    try {
      const { data } = await api.get(`/chat/threads/${props.threadId}/messages/${props.messageId}/pulse`, { skipGlobalLoading: true });
      if (version !== requestVersion) return;
      pulse.value = data; loadedAt = Date.now();
    } catch {
      if (version === requestVersion) { pulse.value = null; error.value = 'Pulse could not be loaded. Please try again.'; }
    } finally {
      if (version === requestVersion) { loading.value = false; pending = null; }
    }
  })();
  return pending;
}

function showPreview() {
  clearTimeout(hideTimer);
  if (opened.value) return;
  const rect = trigger.value?.getBoundingClientRect();
  if (rect) previewPosition.value = {
    left: `${Math.max(8, Math.min(rect.right - 280, window.innerWidth - 288))}px`,
    top: `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 260))}px`
  };
  preview.value = true;
  load();
}
function hidePreview() { hideTimer = setTimeout(() => { preview.value = false; }, 120); }
function keepPreview() { clearTimeout(hideTimer); }
async function open() {
  clearTimeout(hideTimer);
  preview.value = false;
  returnFocus = document.activeElement;
  opened.value = true;
  filter.value = 'all';
  load(true);
  await nextTick();
  dialog.value?.querySelector('button')?.focus();
}
function close() {
  opened.value = false;
  preview.value = false;
  nextTick(() => returnFocus?.isConnected && returnFocus.focus());
}
function onKeydown(event) {
  if (event.key === 'Escape') {
    if (preview.value || opened.value) { event.preventDefault(); event.stopPropagation(); }
    preview.value = false;
    if (opened.value) close();
  }
  if (event.key !== 'Tab' || !opened.value) return;
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled), [href], input, [tabindex="0"]')];
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
// Capture keyboard navigation while open so focus stays in the dialog even if
// another component attempts to move it outside the teleported content.
function guardFocus(event) {
  if (opened.value && dialog.value && !dialog.value.contains(event.target)) dialog.value.querySelector('button')?.focus();
}
watch(() => opened.value || preview.value, value => {
  if (value) {
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('focusin', guardFocus);
  } else {
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('focusin', guardFocus);
  }
});
watch(() => [props.threadId, props.messageId], () => {
  requestVersion++; pending = null; pulse.value = null; loadedAt = 0; loading.value = false; error.value = '';
  if (opened.value) close();
  preview.value = false;
});
onBeforeUnmount(() => {
  requestVersion++; clearTimeout(hideTimer);
  document.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('focusin', guardFocus);
  if (opened.value && returnFocus?.isConnected) returnFocus.focus();
});
</script>

<template>
  <span class="message-pulse" @mouseenter="showPreview" @mouseleave="hidePreview">
    <button ref="trigger" type="button" class="pulse-trigger" aria-label="Conversa Pulse: message analytics" aria-haspopup="dialog"
      :aria-expanded="opened" :aria-describedby="preview ? `${uid}-preview` : undefined"
      @focus="showPreview" @blur="hidePreview" @click="open" @keydown.esc.stop="preview = false">
      <Activity :size="13" aria-hidden="true" /> Pulse
    </button>
    <Teleport to="body">
      <div v-if="preview && !opened" :id="`${uid}-preview`" class="pulse-preview" role="tooltip" :style="previewPosition"
        @mouseenter="keepPreview" @mouseleave="hidePreview">
        <strong>Conversa Pulse</strong>
        <p v-if="loading">Loading seen-by details…</p>
        <p v-else-if="error">{{ error }}</p>
        <template v-else-if="pulse">
          <p>Seen by {{ pulse.seenCount }} of {{ pulse.recipientCount }} current recipients</p>
          <ul v-if="seen.length"><li v-for="person in seen.slice(0, 5)" :key="person.userId">{{ person.name }}</li></ul>
          <p v-else>No views recorded yet.</p>
          <p v-if="seen.length > 5">+{{ seen.length - 5 }} more</p>
          <small>Open Pulse for details</small>
        </template>
      </div>
      <div v-if="opened" class="pulse-overlay" @click.self="close">
        <section ref="dialog" class="pulse-dialog" role="dialog" aria-modal="true" :aria-labelledby="`${uid}-title`" :aria-describedby="`${uid}-note`">
          <header class="pulse-header">
            <div><span class="pulse-eyebrow">Every conversation, connected</span><h2 :id="`${uid}-title`"><Activity :size="22" aria-hidden="true" /> Conversa Pulse</h2></div>
            <button type="button" class="pulse-close" aria-label="Close Conversa Pulse" @click="close">×</button>
          </header>
          <div class="pulse-content" :aria-busy="loading">
            <p v-if="loading" role="status">Loading message activity…</p>
            <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" class="pulse-control" @click="load(true)">Try again</button></div>
            <template v-else-if="pulse">
              <p class="pulse-sent">Sent {{ formatDate(pulse.sentAt) }}</p>
              <div class="pulse-stats">
                <div><strong>{{ pulse.seenCount }}<small> / {{ pulse.recipientCount }}</small></strong><span>Seen</span></div>
                <div><strong>{{ pulse.noViewRecordedCount }}</strong><span>No view recorded</span></div>
                <div><strong>{{ pulse.replyCount }}</strong><span>Replies</span></div>
                <div><strong>{{ pulse.reactionCount }}</strong><span>Reactions</span></div>
              </div>
              <div class="pulse-reach"><span>{{ percent }}% of current recipients</span><progress :value="pulse.seenCount" :max="pulse.recipientCount || 1" aria-label="Recipients with a recorded view" /></div>
              <div v-if="pulse.reactions.length" class="pulse-reactions"><span v-for="reaction in pulse.reactions" :key="reaction.code">{{ reaction.code.startsWith('icon:') ? 'Custom reaction' : reaction.code }} {{ reaction.count }}</span></div>
              <div class="pulse-roster-header"><h3>Current recipients</h3><button type="button" class="pulse-control" @click="load(true)">Refresh</button></div>
              <div class="pulse-filters" aria-label="Filter recipients">
                <button v-for="option in [{ id: 'all', label: 'All' }, { id: 'seen', label: 'Seen' }, { id: 'unseen', label: 'No view recorded' }]" :key="option.id" type="button" :aria-pressed="filter === option.id" @click="filter = option.id">{{ option.label }}</button>
              </div>
              <ul v-if="recipients.length" class="pulse-roster">
                <li v-for="person in recipients" :key="person.userId"><span>{{ person.name }}</span><span class="pulse-person-status" :class="{ 'has-seen': person.firstSeenAt }">{{ person.firstSeenAt ? 'Seen' : 'No view recorded' }}<time v-if="person.firstSeenAt" :datetime="person.firstSeenAt">{{ formatDate(person.firstSeenAt) }}</time></span></li>
              </ul>
              <p v-else class="pulse-empty">{{ pulse.recipientCount ? 'No recipients in this view.' : 'No other current recipients.' }}</p>
            </template>
          </div>
          <footer :id="`${uid}-note`" class="pulse-note">Shared with everyone in this conversation. Counts reflect current members and exclude the sender. Seen means the message was visible in an active Team chat window; earlier views may not be recorded.</footer>
        </section>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.message-pulse { display: inline-flex; vertical-align: middle; }
.pulse-trigger { display: inline-flex; align-items: center; gap: 3px; border: 0; padding: 2px 4px; background: transparent; color: var(--text-secondary, #627087); font: inherit; font-weight: 600; cursor: pointer; border-radius: 5px; }
.pulse-trigger:hover, .pulse-trigger:focus-visible { color: var(--primary, #0047b3); background: var(--conversa-wash, #eaf0fa); }
.pulse-preview, .pulse-dialog { color: var(--text-primary, #172d50); background: var(--bg-card, #fff); border: 1px solid var(--border, #dce5f0); box-shadow: 0 16px 48px #172d5026; font-size: 13px; line-height: 1.5; text-align: left; }
.pulse-preview { position: fixed; z-index: 10010; width: 280px; max-width: calc(100vw - 16px); max-height: 252px; overflow: auto; padding: 16px; border-radius: 12px; box-sizing: border-box; overflow-wrap: anywhere; }
.pulse-preview p { margin: 6px 0; }.pulse-preview ul { list-style: none; padding: 0; margin: 8px 0; }.pulse-preview small { color: var(--text-secondary, #627087); }
.pulse-overlay { position: fixed; inset: 0; z-index: 10020; background: #0d1e3d66; display: flex; align-items: center; justify-content: center; padding: 20px; }
.pulse-dialog { width: 620px; max-width: 100%; max-height: 90dvh; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; }
.pulse-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 22px 24px; border-bottom: 1px solid var(--border, #dce5f0); }
.pulse-eyebrow { color: var(--text-secondary, #627087); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.pulse-header h2 { display: flex; gap: 8px; align-items: center; margin: 5px 0 0; font-size: 23px; line-height: 1.25; }
.pulse-close { border: 0; background: transparent; color: inherit; font-size: 28px; line-height: 1; cursor: pointer; border-radius: 6px; padding: 6px 10px; }
.pulse-content { padding: 20px 24px; overflow-y: auto; }.pulse-sent { margin: 0 0 16px; color: var(--text-secondary, #627087); }
.pulse-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }.pulse-stats > div { background: var(--bg-secondary, #f5f8fd); border: 1px solid var(--border, #dce5f0); padding: 12px; border-radius: 10px; }.pulse-stats strong { display: block; font-size: 25px; }.pulse-stats small { font-size: 14px; font-weight: 400; color: var(--text-secondary, #627087); }.pulse-stats span { font-size: 11px; color: var(--text-secondary, #627087); }
.pulse-reach { margin-top: 14px; color: var(--text-secondary, #627087); font-size: 12px; }.pulse-reach progress { display: block; width: 100%; height: 7px; margin-top: 6px; accent-color: var(--primary, #0047b3); }
.pulse-reactions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }.pulse-reactions span { padding: 3px 9px; border: 1px solid var(--border, #dce5f0); border-radius: 20px; }
.pulse-roster-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 22px; }.pulse-roster-header h3 { margin: 0; font-size: 15px; }.pulse-control { background: transparent; border: 1px solid var(--border, #dce5f0); color: inherit; font: inherit; padding: 5px 10px; border-radius: 7px; cursor: pointer; }
.pulse-filters { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }.pulse-filters button { font: inherit; font-size: 12px; color: inherit; background: transparent; border: 1px solid var(--border, #dce5f0); border-radius: 20px; padding: 5px 11px; cursor: pointer; }.pulse-filters button[aria-pressed="true"] { background: var(--primary, #0047b3); border-color: var(--primary, #0047b3); color: #fff; }
.pulse-roster { list-style: none; padding: 0; margin: 0; }.pulse-roster li { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border, #dce5f0); overflow-wrap: anywhere; }.pulse-person-status { flex-shrink: 0; text-align: right; color: var(--text-secondary, #627087); font-size: 12px; }.pulse-person-status.has-seen { color: var(--success, #21715d); }.pulse-person-status time { display: block; color: var(--text-secondary, #627087); font-size: 11px; }.pulse-empty { color: var(--text-secondary, #627087); }
.pulse-note { padding: 16px 24px; background: var(--bg-secondary, #f5f8fd); color: var(--text-secondary, #627087); border-top: 1px solid var(--border, #dce5f0); font-size: 11px; }
button:focus-visible { outline: 2px solid var(--primary, #0047b3); outline-offset: 3px; }
@media (max-width: 520px) { .pulse-overlay { padding: 10px; }.pulse-header, .pulse-content { padding: 16px; }.pulse-header h2 { font-size: 21px; }.pulse-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }.pulse-note { padding: 12px 16px; }.pulse-roster li { align-items: flex-start; } }
</style>
