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
      <article v-for="message in messages" :key="message.id">
        <div class="sender"><strong>{{ message.from?.name || message.from?.email || (message.direction === 'outbound' ? 'You' : 'Sender') }}</strong><time>{{ formatDate(message.sent_at || message.created_at) }}</time></div>
        <p class="addresses" v-if="message.to?.length">To: {{ addresses(message.to) }}<template v-if="message.cc?.length"> · Cc: {{ addresses(message.cc) }}</template></p>
        <p v-if="message.send_status && message.send_status !== 'sent'" role="status">{{ message.send_status === 'scheduled' ? 'Queued for delivery' : message.send_status }}</p>
        <div class="body">{{ plainHtml(message.body_text || message.body_html) || '(Empty message)' }}</div>
        <div class="actions">
          <button v-for="file in message.attachments || []" :key="file.id" type="button" @click="$emit('attachment',file)">📎 {{ file.filename }}</button>
          <button v-if="!message.is_internal_note && (!message.send_status || message.send_status === 'sent')" type="button" :aria-pressed="!!message.reactions?.some(r => r.reactedByMe)" @click="$emit('like',message)">♥ Like {{ message.reactions?.find(r => r.emoji === '❤️')?.count || '' }}</button>
        </div>
      </article>
      <p v-if="!messages.length">No messages in this conversation.</p>
    </div>
  </section>
</template>
<script setup>
defineProps({ conversation:Object,messages:{type:Array,default:()=>[]},hasOlder:Boolean,loadingOlder:Boolean });
defineEmits(['compose','unread','older','attachment','like']);
const addresses = (list) => list.map(a => a.email || a).join(', ');
const formatDate = (v) => v ? new Date(v).toLocaleString() : '';
const plainHtml = (value) => {if(!/<[a-z][\s\S]*>/i.test(value || ''))return value || '';const doc=new DOMParser().parseFromString(value || '', 'text/html');doc.querySelectorAll('script,style').forEach(e=>e.remove());doc.querySelectorAll('br').forEach(e=>e.replaceWith('\n'));doc.querySelectorAll('p,div,tr').forEach(e=>e.append('\n'));return doc.body.textContent || '';};
</script>
<style scoped>
.email-reader{display:flex;flex-direction:column;min-height:0;flex:1;color:inherit;width:100%}header{padding:16px;border-bottom:1px solid #8ba69c55}h2{font-size:1.2rem;margin:0 0 12px;overflow-wrap:anywhere}.history{overflow:auto;flex:1;padding:16px;min-height:0}article{border:1px solid #8ba69c55;border-radius:10px;padding:18px;margin-bottom:16px;background:var(--email-message-background,var(--bg-card,transparent));color:var(--email-message-color,inherit)}.sender{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.addresses,time{font-size:.85rem;opacity:.8;overflow-wrap:anywhere}.body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:18px 0}.actions{display:flex;flex-wrap:wrap;gap:8px}button{font:inherit;color:inherit;background:transparent;border:1px solid #8ba69c88;border-radius:6px;padding:7px 12px;cursor:pointer}button:hover{background:#83ac9820}button[aria-pressed=true]{background:#83ac9840}
</style>
