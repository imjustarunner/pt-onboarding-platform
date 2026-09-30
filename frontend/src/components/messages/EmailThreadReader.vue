<template>
  <section class="email-reader" aria-label="Email conversation">
    <header>
      <h2>{{ conversation?.subject || '(No subject)' }}</h2>
      <div class="actions">
        <button type="button" @click="$emit('compose','reply')">Reply</button>
        <button type="button" @click="$emit('compose','reply_all')">Reply all</button>
        <button type="button" @click="$emit('compose','forward')">Forward</button>
        <button type="button" @click="$emit('unread')">Keep unread</button>
      </div>
    </header>
    <div class="history">
      <button v-if="hasOlder" type="button" :disabled="loadingOlder" @click="$emit('older')">{{ loadingOlder ? 'Loading…' : 'Load earlier emails' }}</button>
      <details v-for="message in messages" :key="message.id" class="email-message" :open="isExpanded(message)" @toggle="rememberExpansion(message, $event)">
        <summary>
        <div class="sender"><strong>{{ message.from?.name || message.from?.email || (message.direction === 'outbound' ? 'You' : 'Sender') }}</strong><time>{{ formatDate(message.sent_at || message.created_at) }}</time></div>
        </summary>
        <p class="addresses" v-if="message.to?.length">To: {{ addresses(message.to) }}<template v-if="message.cc?.length"> · Cc: {{ addresses(message.cc) }}</template></p>
        <p v-if="emailDeliveryLabel(message)" role="status">{{ emailDeliveryLabel(message) }}</p>
        <button v-if="rendered[message.id]?.hasBlockedImages" type="button" class="load-images" @click="showImages[message.id]=true">Show external images</button>
        <div class="body" :class="{ 'plain-body': !message.body_html }" v-html="rendered[message.id]?.html || '(Empty message)'" />
        <div class="actions">
          <button v-for="file in message.attachments || []" :key="file.id" type="button" @click="$emit('attachment',file)">📎 {{ file.filename }}</button>
          <button v-if="!message.is_internal_note && (!message.send_status || message.send_status === 'sent')" type="button" :aria-pressed="!!message.reactions?.some(r => r.reactedByMe)" @click="$emit('like',message)">♥ Like {{ message.reactions?.find(r => r.emoji === '❤️')?.count || '' }}</button>
        </div>
      </details>
      <p v-if="!messages.length">No messages in this conversation.</p>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { renderEmailContent, emailDeliveryLabel } from '../../utils/emailPresentation';
const props = defineProps({ conversation:Object,messages:{type:Array,default:()=>[]},hasOlder:Boolean,loadingOlder:Boolean });
defineEmits(['compose','unread','older','attachment','like']);
const expansion=ref({}),showImages=ref({});
const rendered=computed(()=>Object.fromEntries(props.messages.map(message=>[message.id,renderEmailContent(message,{loadExternalImages:!!showImages.value[message.id]})])));
watch(()=>props.conversation?.id,()=>{expansion.value={};showImages.value={};});
const isExpanded=message=>expansion.value[message.id] ?? (message.id===props.messages.at(-1)?.id);
function rememberExpansion(message,event){expansion.value[message.id]=event.target.open;}
const addresses = (list) => list.map(a => a.email || a).join(', ');
const formatDate = (v) => v ? new Date(v).toLocaleString() : '';
</script>
<style scoped>
.email-reader{display:flex;flex-direction:column;min-height:0;flex:1;color:inherit;width:100%}header{padding:16px;border-bottom:1px solid #8ba69c55}h2{font-size:1.2rem;margin:0 0 12px;overflow-wrap:anywhere}.history{overflow:auto;flex:1;padding:16px;min-height:0}.email-message{border:1px solid #8ba69c55;border-radius:10px;padding:18px;margin-bottom:16px;background:var(--email-message-background,var(--bg-card,transparent));color:var(--email-message-color,inherit)}.sender{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.addresses,time{font-size:.85rem;opacity:.8;overflow-wrap:anywhere}.body{overflow-wrap:anywhere;line-height:1.6;margin:18px 0}.plain-body{white-space:pre-wrap}.body :deep(a){color:var(--link-color,#176aab);text-decoration:underline}.body{overflow-x:auto}.body :deep(table){max-width:100%}.body :deep(img){max-width:100% !important;height:auto !important;vertical-align:middle}.body :deep(pre){white-space:pre-wrap}.body :deep(blockquote){margin:12px;border-left:2px solid #a5b9af;padding-left:12px}.body :deep(details){margin:12px 0}.email-message>summary{cursor:pointer}.email-message>summary .sender{display:inline-flex;width:calc(100% - 24px)}.actions{display:flex;flex-wrap:wrap;gap:8px}button{font:inherit;color:inherit;background:transparent;border:1px solid #8ba69c88;border-radius:6px;padding:7px 12px;cursor:pointer}button:hover{background:#83ac9820}button[aria-pressed=true]{background:#83ac9840}
</style>
