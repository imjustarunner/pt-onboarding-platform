<script setup>
import { ref, watch } from 'vue';
import ConversaIcon from './ConversaIcon.vue';
import api from '../../services/api';
const props = defineProps({ threadId: { type: [Number, String], default: null }, opening: Boolean, shared: { type: Boolean, default: true } });
const events = ref([]);
const showingActivity = ref(false);
const loading = ref(false);
const error = ref('');
watch(() => props.threadId, () => { events.value = []; showingActivity.value = false; error.value = ''; });
const eventLabel = (type) => ({ medical_record_opened: 'Opened from client record', message_sent: 'Message sent', message_opened: 'Message opened after sign-in', notification_sent: 'Notification sent', notification_pending: 'Notification awaiting delivery', notification_link_opened: 'Notification link opened' }[type] || 'Secure message activity');
async function showActivity() {
  showingActivity.value = !showingActivity.value;
  if (!showingActivity.value) return;
  const threadId = props.threadId;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/chat/threads/${threadId}/secure-events`, { skipGlobalLoading: true });
    if (props.threadId === threadId) events.value = data.events || [];
  } catch { if (props.threadId === threadId) error.value = 'Activity could not be loaded. Please try again.'; }
  finally { if (props.threadId === threadId) loading.value = false; }
}
</script>

<template>
  <section class="secure-message-banner" aria-label="Secure message">
    <div class="secure-message-banner__identity">
      <span class="secure-message-banner__seal"><ConversaIcon type="secure" :size="24" /></span>
      <div><strong>Secure message</strong><span class="secure-message-banner__byline">Messages by Conversa</span></div>
      <span class="secure-message-banner__private">{{ shared ? 'Shared care conversation' : 'Protected conversation' }}</span>
    </div>
    <p>{{ opening ? 'Sign in to open your message. Only authorized participants can read and reply.' : 'Message content stays here. Opening messages is recorded in the activity log.' }}</p>
    <p v-if="shared" class="secure-message-banner__note">Shared with all guardians who have access and the authorized care team. For a discussion that cannot be shared with them, arrange a session.</p>
    <p class="secure-message-banner__note">Email and text notifications contain no message content.</p>
    <button v-if="threadId" type="button" class="secure-message-banner__activity" :aria-expanded="showingActivity" @click="showActivity">{{ showingActivity ? 'Hide activity' : 'View secure activity' }}</button>
    <div v-if="showingActivity" class="secure-message-banner__log" aria-live="polite">
      <p v-if="loading">Loading activity…</p><p v-else-if="error" role="alert">{{ error }}</p>
      <ol v-else-if="events.length"><li v-for="event in events" :key="event.id"><strong>{{ eventLabel(event.event_type) }}</strong><span>{{ event.actor_name || 'Notification link visitor' }} · {{ new Date(event.created_at).toLocaleString() }}</span></li></ol>
      <p v-else>No activity recorded yet.</p>
    </div>
  </section>
</template>

<style scoped>
.secure-message-banner { padding: 18px 20px; margin: 12px 0; border: 1px solid var(--conversa-border, #dce5f0); border-left: 4px solid #d4a017; border-radius: 12px; background: var(--conversa-wash, #f5f8fd); color: var(--conversa-ink, #172d50); }
.secure-message-banner__identity { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.secure-message-banner__seal { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; color: #ffe29b; background: #0f2d6b; }
.secure-message-banner__seal :deep(.conversa-icon) { color: #ffe29b; }
.secure-message-banner__identity strong { display: block; font-size: 19px; font-weight: 600; }
.secure-message-banner__byline { display: block; font-size: 12px; margin-top: 3px; color: var(--conversa-muted, #627087); }
.secure-message-banner__private { margin-left: auto; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; }
p { margin: 12px 0 0; font-size: 13px; line-height: 1.5; }
.secure-message-banner__note { margin-top: 4px; color: var(--conversa-muted, #627087); }
.secure-message-banner__activity { margin-top: 12px; padding: 0; background: transparent; border: 0; color: var(--conversa-blue, #0047b3); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; }
.secure-message-banner__log { max-height: 220px; overflow: auto; }
ol { list-style: none; padding: 0; margin: 12px 0 0; }
li { padding: 9px 0; border-top: 1px solid var(--conversa-border, #dce5f0); font-size: 12px; }
li strong, li span { display: block; } li span { margin-top: 4px; color: var(--conversa-muted, #627087); }
</style>
