<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { MessageCircle, MessageSquare, ArrowUpRight, ChevronUp } from '@lucide/vue';
import api from '../../services/api';
import MessageThread from '../messages/MessageThread.vue';
const props = defineProps({ endpoint: { type: String, required: true }, title: { type: String, required: true }, meId: { type: [Number, String], required: true } });
const expanded = ref(false), opening = ref(false), conversation = ref(null), error = ref('');
const panel = ref(null);
let generation = 0;
onBeforeUnmount(() => { generation++; });
const fullUrl = computed(() => conversation.value ? `/messages?view=workspace&tab=dms&threadId=${conversation.value.threadId}&agencyId=${conversation.value.agencyId}` : '');
async function open() {
  if (opening.value) return;
  expanded.value = true;
  if (conversation.value) return;
  const version = generation;
  opening.value = true; error.value = '';
  try {
    const { data } = await api.post(props.endpoint, {}, { skipGlobalLoading: true });
    if (version !== generation) return;
    if (!Number.isSafeInteger(Number(data?.threadId)) || Number(data.threadId) <= 0) throw new Error('No conversation returned');
    conversation.value = data;
    await nextTick(); panel.value?.querySelector('textarea')?.focus();
  } catch (e) { if (version === generation) error.value = e?.response?.data?.error?.message || 'Could not open the event conversation. Please try again.'; }
  finally { if (version === generation) opening.value = false; }
}
</script>

<template>
  <section class="ee-card event-conversation" aria-labelledby="event-conversation-title" ref="panel">
    <header class="ee-section-header"><div class="ee-section-title"><span class="ee-icon-tile green"><MessageCircle :size="23" aria-hidden="true" /></span><div><h2 id="event-conversation-title">Event conversation</h2><p>Share updates, ask questions, and coordinate with the other invitees.</p></div></div><button class="ee-button ee-button-primary" type="button" :aria-expanded="expanded" aria-controls="event-conversation-thread" :disabled="opening" @click="expanded && conversation ? expanded = false : open()"><ChevronUp v-if="expanded && conversation" :size="17" aria-hidden="true" /><MessageSquare v-else :size="17" aria-hidden="true" />{{ opening ? 'Opening conversation…' : expanded && conversation ? 'Hide conversation' : 'Message event group' }}</button></header>
    <div v-if="expanded" id="event-conversation-thread" class="event-conversation-thread">
      <p v-if="opening" class="ee-muted" role="status">Opening {{ title }}…</p>
      <div v-else-if="error" class="ee-error" role="alert"><p>{{ error }}</p><button type="button" class="ee-button" @click="open">Try again</button></div>
      <template v-else-if="conversation"><div class="event-conversation-meta"><strong>{{ conversation.name || title }}</strong><a :href="fullUrl">Open in Conversa <ArrowUpRight :size="14" aria-hidden="true" /></a></div><div class="event-conversation-reader"><MessageThread :key="conversation.threadId" :thread-id="conversation.threadId" :me-id="meId" mode="inline" /></div><p class="event-conversation-footnote">This same group appears in Direct Messages and Groups.</p></template>
    </div>
  </section>
</template>

<style scoped>
.event-conversation-thread{border-top:1px solid #e8edf1;margin-top:22px;padding-top:18px}.event-conversation-meta{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:14px;font-size:13px}.event-conversation-meta strong{overflow-wrap:anywhere}.event-conversation-meta a{display:inline-flex;gap:4px;align-items:center;white-space:nowrap;color:#225c4b;text-decoration:none;font-size:12px}.event-conversation-reader{height:440px;min-height:300px;max-height:65vh;border:1px solid #e4e9ef;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.event-conversation-reader :deep(.message-thread){height:100%;min-height:0}.event-conversation-footnote{font-size:11px;color:#64748b;margin:12px 0 0}.event-conversation .ee-section-header{flex-wrap:wrap}.event-conversation .ee-button{margin-left:auto}@media(max-width:600px){.event-conversation .ee-button{margin-left:0;width:100%}.event-conversation-meta{align-items:flex-start;flex-direction:column}.event-conversation-reader{height:430px}}
</style>
