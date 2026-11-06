<template>
  <section class="email-reader" :class="{'mobile-email-reader':mobile}" aria-label="Conversation">
    <header>
      <h2>{{ conversation?.subject || '(No subject)' }}</h2>
      <button v-if="mobile" type="button" class="reading-mode" :aria-pressed="compactLayout" @click="compactLayout=!compactLayout">{{ compactLayout?'Reading view':'Original layout' }}</button>
      <div class="actions">
        <button v-if="!isReadOnly" type="button" @click="$emit('compose','reply')">Reply</button>
        <button v-if="!isReadOnly" type="button" @click="$emit('compose','reply_all')">Reply all</button>
        <button v-if="!isReadOnly" type="button" @click="$emit('compose','forward')">Forward</button>
        <button v-if="!isReadOnly" type="button" @click="$emit('unread')">Keep unread</button>
        <button v-if="canFile" type="button" @click="$emit('file')">File with client(s)</button>
        <button v-if="canPrint" type="button" @click="$emit('print')">Print / Save thread</button>
      </div>
    </header>
    <div class="history">
      <details v-if="conversation?.documentation?.length" class="email-message">
        <summary>Contact purpose and review history</summary>
        <section v-for="(entry,index) in conversation.documentation" :key="index">
          <strong>{{ entry.author }} · {{ formatDate(entry.createdAt) }} · {{ entry.completed ? 'Reviewed' : 'Saved' }}</strong>
          <p style="white-space:pre-wrap">{{ entry.purpose }}</p>
        </section>
      </details>
      <button v-if="hasOlder" type="button" :disabled="loadingOlder" @click="$emit('older')">{{ loadingOlder ? 'Loading…' : 'Load earlier emails' }}</button>
      <details v-for="message in messages" :key="message.id" class="email-message" :class="{'from-me':message.direction==='outbound'}" :open="isExpanded(message)" @toggle="rememberExpansion(message, $event)">
        <summary>
        <div class="sender"><span v-if="mobile" class="email-avatar"><img v-if="message.direction==='outbound' && currentUserPhoto" :src="photoUrl(currentUserPhoto)" alt=""/><span v-else>{{ (message.from?.name || message.from?.email || '?').split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase() }}</span></span><ConversaSender :name="message.from?.name || (message.direction === 'outbound' ? 'You' : '')" :address="message.from?.email || ''" :organization="message.sending_organization || message.from?.organization || null" :logo="message.from?.logo_url || ''" /><time>{{ formatDate(message.sent_at || message.created_at) }}</time></div>
        </summary>
        <p class="addresses" v-if="message.to?.length">To: {{ addresses(message.to) }}<template v-if="message.cc?.length"> · Cc: {{ addresses(message.cc) }}</template></p>
        <p v-if="emailDeliveryLabel(message)" role="status">{{ emailDeliveryLabel(message) }}</p>
        <button v-if="rendered[message.id]?.hasBlockedImages" type="button" class="load-images" @click="showImages[message.id]=true">Show external images</button>
        <div class="body" :class="{ 'plain-body': !message.body_html }" v-html="rendered[message.id]?.html || '(Empty message)'" />
        <EmailAudioAttachment v-for="file in message.attachments || []" :key="`audio-${file.id}`" :file="file" :conversation-id="conversation?.id" />
        <div class="actions">
          <button v-for="file in message.attachments || []" :key="file.id" type="button" @click="$emit('attachment',file)"><ConversaIcon type="attachment" :size="14" /> {{ file.filename }}</button>
          <button v-if="!isReadOnly && !message.is_internal_note && (!message.send_status || message.send_status === 'sent')" type="button" :aria-pressed="!!message.reactions?.some(r => r.reactedByMe)" @click="$emit('like',message)">♥ Like {{ message.reactions?.find(r => r.emoji === '❤️')?.count || '' }}</button>
        </div>
      </details>
      <p v-if="!messages.length">No messages in this conversation.</p>
    </div>
  </section>
</template>
<script setup>
import EmailAudioAttachment from './EmailAudioAttachment.vue';
import ConversaSender from '../../components/conversa/ConversaSender.vue';
import ConversaIcon from '../../components/conversa/ConversaIcon.vue';
import { computed, ref, watch } from 'vue';
import { renderEmailContent, emailDeliveryLabel } from '../../utils/emailPresentation';
const props = defineProps({ conversation:Object,messages:{type:Array,default:()=>[]},hasOlder:Boolean,loadingOlder:Boolean,readOnly:Boolean,canPrint:Boolean,canFile:Boolean,mobile:Boolean,currentUserPhoto:String });
const isReadOnly = computed(() => props.readOnly || !!props.conversation?.support_ticket_id);
defineEmits(['compose','unread','older','attachment','like','print','file']);
const expansion=ref({}),showImages=ref({}),compactLayout=ref(props.mobile);
const photoUrl=path=>/^https?:\/\//.test(path)?path:`${import.meta.env.VITE_AURICWELL_MOBILE?'https://auricwell.com':''}/api/uploads/${String(path).replace(/^\/?(?:api\/)?uploads\//,'')}`;
const rendered=computed(()=>Object.fromEntries(props.messages.map(message=>[message.id,renderEmailContent(message,{loadExternalImages:!!showImages.value[message.id],compactLayout:props.mobile && compactLayout.value})])));
watch(()=>props.conversation?.id,()=>{expansion.value={};showImages.value={};});
const isExpanded=message=>expansion.value[message.id] ?? (message.id===props.messages.at(-1)?.id);
function rememberExpansion(message,event){expansion.value[message.id]=event.target.open;}
const addresses = (list) => list.map(a => a.email || a).join(', ');
const formatDate = (v) => v ? new Date(v).toLocaleString() : '';
</script>
<style scoped>
.email-reader{display:flex;flex-direction:column;min-height:0;flex:1;color:inherit;width:100%}header{padding:16px;border-bottom:1px solid #8ba69c55}h2{font-size:1.2rem;margin:0 0 12px;overflow-wrap:anywhere}.history{overflow:auto;flex:1;padding:16px;min-height:0}.email-message{border:1px solid #8ba69c55;border-radius:10px;padding:18px;margin-bottom:16px;background:var(--email-message-background,var(--bg-card,transparent));color:var(--email-message-color,inherit)}.sender{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.addresses,time{font-size:.85rem;opacity:.8;overflow-wrap:anywhere}.body{overflow-wrap:anywhere;line-height:1.6;margin:18px 0}.plain-body{white-space:pre-wrap}.body :deep(a){color:var(--link-color,#176aab);text-decoration:underline}.body{overflow-x:auto}.body :deep(table){max-width:100%}.body :deep(img){max-width:100% !important;height:auto !important;vertical-align:middle}.body :deep(pre){white-space:pre-wrap}.body :deep(blockquote){margin:12px;border-left:2px solid #a5b9af;padding-left:12px}.body :deep(details){margin:12px 0}.email-message>summary{cursor:pointer}.email-message>summary .sender{display:inline-flex;width:calc(100% - 24px)}.actions{display:flex;flex-wrap:wrap;gap:8px}button{font:inherit;color:inherit;background:transparent;border:1px solid #8ba69c88;border-radius:6px;padding:7px 12px;cursor:pointer}button:hover{background:#83ac9820}button[aria-pressed=true]{background:#83ac9840}

.mobile-email-reader header{padding:12px 14px;border-color:#e0e7f2}.mobile-email-reader h2{font-size:18px;line-height:1.4;margin-bottom:11px;color:#16345d}.mobile-email-reader .history{padding:12px 0;overflow:visible}.mobile-email-reader .email-message{border:0;border-left:3px solid #27877c;border-radius:0;padding:16px 14px;margin:0 0 12px;background:#f5faf9}.mobile-email-reader .email-message.from-me{border-left-color:#3468ca;background:#f0f5ff}.mobile-email-reader .sender{gap:7px;align-items:center}.mobile-email-reader .sender :deep(.conversa-sender){flex:1;min-width:0}.mobile-email-reader .sender time{font-size:10px;flex-shrink:0}.mobile-email-reader :deep(.conversa-sender__avatar){display:none}.mobile-email-reader .email-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#d9ede9;color:#236e62;font-size:10px;font-weight:700;flex-shrink:0;overflow:hidden}.mobile-email-reader .email-avatar img{width:100%;height:100%;object-fit:cover}.mobile-email-reader .from-me .email-avatar{background:#dce8ff;color:#2455a9}.mobile-email-reader .body{font-size:14px;line-height:1.7;margin:13px 0;overflow-x:auto}.mobile-email-reader .body :deep(div){max-width:100%!important;box-sizing:border-box}.mobile-email-reader .body :deep(p){margin:0 0 12px}.mobile-email-reader .body :deep(a){overflow-wrap:anywhere;line-height:1.7;white-space:normal}.mobile-email-reader .body :deep(a[style*="background"]){display:block;width:fit-content;max-width:100%;margin:9px 0!important;padding:10px!important}.mobile-email-reader .body :deep(table){width:auto!important;max-width:100%!important}.mobile-email-reader .body :deep(td){padding:5px}.mobile-email-reader .body :deep(img){max-width:100%!important;height:auto!important}.mobile-email-reader .actions{gap:6px}.mobile-email-reader button{font-size:11px;min-height:35px;padding:7px 10px;border-radius:8px;border-color:#cbd9eb;background:#fff;color:#325579}.mobile-email-reader .reading-mode{float:right;margin:0 0 6px 7px;font-size:10px}.mobile-email-reader .addresses{font-size:10px;line-height:1.6}.mobile-email-reader .email-message>summary{list-style:none}.mobile-email-reader .email-message>summary .sender{width:100%;display:flex}
</style>
