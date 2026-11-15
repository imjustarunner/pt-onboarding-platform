<template>
  <div class="gmsg conversa-surface">
    <QaRecipientEmailInbox />
    <div class="panel-head">
      <ConversaBrand compact />
      <div class="panel-subtitle">{{ ft(learning ? "Learning conversations are group messages for the selected student. Authorized guardians and the learning team can read and reply." : "Care conversations are group messages for the selected client. Authorized guardians and the care team can read and reply.") }}</div>
    </div>

    <div class="gmsg-tabs">
      <button type="button" class="gmsg-tab" :class="{ active: mode === 'provider' }" @click="mode = 'provider'">
        {{ ft("Secure messages") }}
      </button>
      <button type="button" class="gmsg-tab" :class="{ active: mode === 'support' }" @click="switchToSupport">
        {{ ft("Support") }}
      </button>
      <button type="button" class="gmsg-tab" :disabled="loading" @click="loadThreads">Refresh messages</button>

    </div>

    <div v-if="error" class="error">{{ ft(error) }}</div>
    <p v-if="ticketCreationStatus" class="muted" role="status">{{ ft(ticketCreationStatus) }}</p>

    <GuardianSecureConversations v-if="mode === 'provider'" :threads="threads" :learning="learning" :unavailable="!!error" :client-id="clientId" :initial-thread-id="initialThreadId" :initial-message-id="initialMessageId" :loading="loading" @refresh="loadThreads" />

    <template v-else>
      <div v-if="ticketsLoading" class="muted">{{ ft("Loading support tickets…") }}</div>
      <div v-else class="gmsg-body">
        <aside class="gmsg-list">
          <button type="button" class="gmsg-row gmsg-new" @click="startNewTicket">
            <div class="gmsg-row-title">{{ ft("+ New support request") }}</div>
            <div class="gmsg-row-meta">{{ ft("Billing, access, or agency questions") }}</div>
          </button>
          <button
            v-for="t in tickets"
            :key="t.id"
            type="button"
            class="gmsg-row"
            :class="{ active: selectedTicketId === t.id && !creatingTicket }"
            @click="openTicket(t)"
          >
            <div class="gmsg-row-title">#{{ t.id }} {{ t.subject || ft("Support") }}</div>
            <div class="gmsg-row-meta">
              <span v-if="t.topic && t.topic !== 'general'">{{ ticketTopicLabel(t.topic) }} · </span>
              {{ t.display_status || t.status }} · {{ formatTime(t.created_at) }}
            </div>
          </button>
          <div v-if="!tickets.length" class="muted pad">{{ ft("No support tickets yet.") }}</div>
        </aside>

        <section class="gmsg-chat">
          <template v-if="creatingTicket">
            <p class="muted pad">{{ ['billing','technology'].includes(newTicket.topic) ? ft("Only you and authorized support staff can view this request.") : ft("This support request is shared with all authorized guardians and the support team.") }} {{ learning ? 'Use secure messages for learning conversations.' : 'Use secure messages for care conversations.' }}</p>
            <div class="gmsg-chat-head">
              <strong>{{ ft("New support request") }}</strong>
              <span class="muted">{{ ft("Agency staff will reply here") }}</span>
            </div>
            <div class="gmsg-composer pad">
              <p v-if="pendingTicketCreate && !submittingCurrentTicket" class="muted" role="status">Another request is being submitted. This draft has not been sent.</p>
              <label class="gmsg-field">
                <span>{{ ft("Child") }}</span>
                <select v-model="newTicket.clientId">
                  <option disabled value="">{{ ft("Select…") }}</option>
                  <option v-for="c in childOptions" :key="c.client_id" :value="String(c.client_id)">
                    {{ c.client_label }}
                  </option>
                </select>
              </label>
              <label class="gmsg-field">
                <span>{{ ft("Topic") }}</span>
                <select v-model="newTicket.topic">
                  <option v-for="t in guardianTopics" :key="t.id" :value="t.id">{{ ft(t.label) }}</option>
                </select>
              </label>
              <label class="gmsg-field">
                <span>{{ ft("Subject (optional)") }}</span>
                <input v-model="newTicket.subject" type="text" :placeholder="ft('e.g. Billing question')" />
              </label>
              <label class="gmsg-field">
                <span>{{ ft("Question") }}</span>
                <textarea v-model="newTicket.question" rows="4" :placeholder="ft('How can we help?')" />
              </label>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="ticketSending || !newTicket.clientId || !newTicket.question.trim()"
                @click="createTicket"
              >
                {{ ticketSending ? (submittingCurrentTicket ? ft("Submitting…") : ft("Waiting for pending request…")) : ft("Submit request") }}
              </button>
            </div>
          </template>
          <template v-else-if="selectedTicket">
            <p class="muted pad">{{ ['billing','technology'].includes(selectedTicket?.topic) ? ft("Only you and authorized support staff can view this request.") : ft("This support request is shared with all authorized guardians and the support team.") }} {{ learning ? 'Use secure messages for learning conversations.' : 'Use secure messages for care conversations.' }}</p>
            <div class="gmsg-chat-head">
              <strong>#{{ selectedTicket.id }} {{ selectedTicket.subject || ft("Support") }}</strong>
              <span class="muted">{{ selectedTicket.display_status || selectedTicket.status }}</span>
            </div>
            <div v-if="ticketMessagesLoading" class="muted pad">{{ ft("Loading…") }}</div>
            <div v-else class="gmsg-thread" ref="ticketThreadEl">
              <div
                v-for="m in ticketMessages"
                :key="m.id"
                class="gmsg-bubble"
                :class="{ mine: m.author_user_id === meId }"
              >
                <div class="gmsg-meta">{{ formatTime(m.created_at) }}</div>
                <div class="gmsg-message-text">{{ m.body }}</div>
              </div>
              <div v-if="!ticketMessages.length" class="muted">{{ ft("No replies yet.") }}</div>
            </div>
            <div class="gmsg-composer">
              <textarea
                v-model="ticketDraft"
                rows="2"
                :placeholder="ft('Reply to support…')"
                :disabled="String(selectedTicket.status || '').toLowerCase() === 'closed'"
              />
              <button
                type="button"
                class="btn btn-primary"
                :disabled="
                  ticketSending || ticketMessagesLoading ||
                  !ticketDraft.trim() ||
                  String(selectedTicket.status || '').toLowerCase() === 'closed'
                "
                @click="sendTicketReply"
              >
                {{ ticketSending ? ft("Sending…") : ft("Send") }}
              </button>
            </div>
          </template>
          <div v-else class="muted pad">{{ ft("Select a ticket or start a new support request.") }}</div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import {useFamilyLocale} from '../../composables/useFamilyLocale';
import QaRecipientEmailInbox from '../messages/QaRecipientEmailInbox.vue';
import GuardianSecureConversations from './GuardianSecureConversations.vue';
import ConversaBrand from '../conversa/ConversaBrand.vue';
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
import baseApi from '../../services/api';
import {GUARDIAN_TICKET_TOPICS,ticketTopicLabel} from '../../utils/ticketTopics';
import {useAuthStore} from '../../store/auth';
const {ft}=useFamilyLocale();
const props=defineProps({initialThreadId:[Number,String],initialMessageId:[Number,String],clientId:[Number,String],learning:Boolean});
const careApi=usePortalCareApi();
const api=new Proxy({}, {get:(_,key)=>(...args)=>(props.clientId?careApi:baseApi)[key](...args)});
const guardianTopics=GUARDIAN_TICKET_TOPICS;
const mode=ref('provider'),threads=ref([]),emails=ref([]),loading=ref(false),error=ref('');
let threadLoadIntent=0;
const auth=useAuthStore(),meId=computed(()=>auth.user?.id);
let ticketRequest=0,ticketSendIntent=0;
const ticketDrafts=new Map();
const tickets=ref([]),ticketsLoading=ref(false),selectedTicketId=ref(null),selectedTicket=ref(null),ticketMessages=ref([]),ticketMessagesLoading=ref(false),ticketDraft=ref(''),ticketSending=ref(false),creatingTicket=ref(false),ticketThreadEl=ref(null);
const ticketCreationStatus=ref(''),pendingTicketCreate=ref(null);
const newTicket=ref({clientId:'',topic:'general',subject:'',question:''});
const submittingCurrentTicket=computed(()=>pendingTicketCreate.value?.request===ticketRequest&&pendingTicketCreate.value?.draft===JSON.stringify(newTicket.value));
const childOptions=computed(()=>[...new Map(threads.value.filter(t=>!props.clientId||Number(t.client_id)===Number(props.clientId)).map(t=>[t.client_id,{client_id:t.client_id,client_label:t.client_label}])).values()]);
function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function loadThreads() {
  const intent=++threadLoadIntent, clientId=props.clientId;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/guardian-portal/messages', { params:{clientId:clientId||undefined},skipGlobalLoading: true });
    if(intent!==threadLoadIntent||clientId!==props.clientId)return;
    threads.value = Array.isArray(r.data?.threads) ? r.data.threads : [];
    emails.value = Array.isArray(r.data?.emails) ? r.data.emails : [];
  } catch (e) {
    if(intent!==threadLoadIntent||clientId!==props.clientId)return;
    error.value = e?.response?.status === 403 ? 'Your account does not have permission to view messages for this service. Use Support if you believe access is missing.' : 'Messages could not be loaded. Please try again or use Support.';
    threads.value = [];
    emails.value = [];
  } finally {
    if(intent===threadLoadIntent)loading.value = false;
  }
}

async function loadTickets() {
  ticketsLoading.value = true;
  error.value = '';
  try {
    const r = await api.get('/guardian-portal/support-tickets', { skipGlobalLoading: true });
    tickets.value = Array.isArray(r.data?.tickets) ? r.data.tickets : [];
  } catch (e) {
    error.value = (e?.response?.status < 500 ? e.response?.data?.error?.message : '') || 'Failed to load tickets';
    tickets.value = [];
  } finally {
    ticketsLoading.value = false;
  }
}

async function switchToSupport() {
  mode.value = 'support';
  await loadTickets();
}

function startNewTicket() {
  ++ticketRequest;
  if(selectedTicketId.value)ticketDrafts.set(Number(selectedTicketId.value),ticketDraft.value);
  creatingTicket.value = true;
  selectedTicketId.value = null;
  selectedTicket.value = null;
  ticketMessages.value = [];
  newTicket.value = {
    clientId: childOptions.value[0] ? String(childOptions.value[0].client_id) : '',
    topic: 'general',
    subject: '',
    question: ''
  };
}

async function openTicket(t) {
  if (!t?.id) return;
  const intent=++ticketRequest,clientId=props.clientId,userId=meId.value;
  if(selectedTicketId.value)ticketDrafts.set(Number(selectedTicketId.value),ticketDraft.value);
  const current=()=>intent===ticketRequest&&clientId===props.clientId&&userId===meId.value;
  creatingTicket.value = false;
  selectedTicketId.value = t.id;
  selectedTicket.value=null;ticketMessages.value=[];
  ticketMessagesLoading.value = true;
  ticketDraft.value = ticketDrafts.get(Number(t.id))||'';
  error.value = '';
  try {
    const r = await api.get(`/guardian-portal/support-tickets/${t.id}`, { skipGlobalLoading: true });
    if(!current())return;
    selectedTicket.value = r.data?.ticket || t;
    ticketMessages.value = Array.isArray(r.data?.messages) ? r.data.messages : [];
    await nextTick();
    if (ticketThreadEl.value) ticketThreadEl.value.scrollTop = ticketThreadEl.value.scrollHeight;
  } catch (e) {
    if(!current())return;
    error.value = (e?.response?.status < 500 ? e.response?.data?.error?.message : '') || 'Failed to load ticket';
    ticketMessages.value = [];
  } finally {
    if(current())ticketMessagesLoading.value = false;
  }
}

async function createTicket() {
  if (ticketSending.value || !creatingTicket.value || !newTicket.value.clientId || !newTicket.value.question.trim()) return;
  const request = ticketRequest, clientId = props.clientId, userId = meId.value;
  const intent = ++ticketSendIntent;
  const submittedDraft = JSON.stringify(newTicket.value);
  const payload = {
    clientId: Number(newTicket.value.clientId),
    topic: newTicket.value.topic || 'general',
    subject: newTicket.value.subject || undefined,
    question: newTicket.value.question.trim()
  };
  const sameScope = () => intent === ticketSendIntent && clientId === props.clientId && userId === meId.value;
  const sameRequest = () => sameScope() && request === ticketRequest && creatingTicket.value &&
    mode.value === 'support' && JSON.stringify(newTicket.value) === submittedDraft;
  ticketSending.value = true;
  pendingTicketCreate.value = {request,draft:submittedDraft};
  ticketCreationStatus.value = '';
  error.value = '';
  try {
    const r = await api.post('/guardian-portal/support-tickets', payload);
    if (!sameScope()) return;
    const created = r.data?.ticket;
    if (created?.id) {
      // Refreshing the entire list here can hide a newly edited request while
      // the original POST is pending. Merge only this returned ticket instead.
      tickets.value = [created, ...tickets.value.filter(t => Number(t.id) !== Number(created.id))];
      if (sameRequest()) await openTicket(created);
      else ticketCreationStatus.value = `Support request #${created.id} was submitted. Your current draft is unchanged.`;
    } else {
      ticketCreationStatus.value = 'Your request was submitted. Refresh the request list to view it; your current draft is unchanged.';
    }
  } catch (e) {
    if (sameRequest()) {
      error.value = (e?.response?.status < 500 ? e.response?.data?.error?.message : '') || 'Could not create ticket';
    } else if (sameScope()) {
      ticketCreationStatus.value = 'The earlier request could not be submitted. Your current draft is unchanged.';
    }
  } finally {
    if (intent === ticketSendIntent) {ticketSending.value = false;pendingTicketCreate.value = null;}
  }
}

async function sendTicketReply() {
  if (ticketSending.value||ticketMessagesLoading.value||!selectedTicket.value?.id || !ticketDraft.value.trim()) return;
  const ticket=selectedTicket.value,text=ticketDraft.value.trim(),clientId=props.clientId,userId=meId.value,intent=++ticketSendIntent;
  const current=()=>intent===ticketSendIntent&&clientId===props.clientId&&userId===meId.value&&Number(selectedTicketId.value)===Number(ticket.id);
  ticketSending.value = true;
  try {
    await api.post(`/guardian-portal/support-tickets/${ticket.id}/messages`, {
      body: text
    });
    if(ticketDrafts.get(Number(ticket.id))?.trim()===text)ticketDrafts.delete(Number(ticket.id));
    if(current()){
      if(ticketDraft.value.trim()===text)ticketDraft.value='';
      await openTicket(ticket);
    }
  } catch (e) {
    if(current())error.value = (e?.response?.status < 500 ? e.response?.data?.error?.message : '') || 'Reply failed';
  } finally {
    if(intent===ticketSendIntent)ticketSending.value = false;
  }
}


watch(()=>[props.clientId,meId.value],()=>{++ticketRequest;++ticketSendIntent;selectedTicket.value=null;selectedTicketId.value=null;ticketDraft.value='';ticketMessages.value=[];ticketDrafts.clear();ticketSending.value=false;creatingTicket.value=false;newTicket.value={clientId:'',topic:'general',subject:'',question:''};pendingTicketCreate.value=null;ticketCreationStatus.value='';loadThreads();});
onMounted(loadThreads);
onBeforeUnmount(()=>{++threadLoadIntent;++ticketRequest;++ticketSendIntent;ticketDrafts.clear();});
</script>

<style scoped>
.gmsg-composer{flex-wrap:wrap}.gmsg-sharing-notice{flex:1 1 100%;width:100%}

.message-action{display:inline-block;padding:10px 12px;margin-top:12px;border-radius:8px;background:#16457c;color:white;font-size:13px;font-weight:600}.gmsg-message-text{white-space:pre-wrap;overflow-wrap:anywhere}.back-conversations{display:none}.gmsg-chat{min-height:220px}@media(max-width:700px){.conversation-picked{display:none}.has-conversation .back-conversations{display:block;padding:12px;border:0;border-bottom:1px solid #dce4ee;background:#f5f8fc;color:#16457c;text-align:left}.message-placeholder{display:none}.gmsg-provider-body:not(.has-conversation){min-height:0}.gmsg-provider-body:not(.has-conversation) .gmsg-chat{display:none}}

.gmsg { display: flex; flex-direction: column; gap: 12px; min-height: 420px; }
.panel-head { margin-bottom: 4px; }
.panel-title { font-weight: 800; font-size: 1.15rem; }
.panel-subtitle { color: var(--text-secondary, #64748b); font-size: 13px; }
.gmsg-sms-panel { border: 1px solid var(--border, #e2e8f0); border-radius: 12px; overflow: hidden; }
.pad-sm { padding: 10px 12px; }
.gmsg-sms-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.gmsg-sms-filters label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.gmsg-sms-filters select {
  min-width: 160px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}
.gmsg-sms-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow: auto;
}
.gmsg-sms-row {
  padding: 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.gmsg-sms-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
}
.gmsg-sms-body { white-space: pre-wrap; word-break: break-word; font-size: 14px; }
.gmsg-sms-nums { font-size: 11px; margin-top: 4px; }
.gmsg-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.gmsg-tab {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
}
.gmsg-tab.active {
  border-color: var(--primary, #2d6a4f);
  color: var(--primary, #2d6a4f);
  background: rgba(45, 106, 79, 0.08);
}
.gmsg-body {
  flex: 1;
  min-height: 360px;
  display: grid;
  grid-template-columns: minmax(180px, 34%) 1fr;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.gmsg-list { border-right: 1px solid var(--border, #e2e8f0); overflow: auto; background: #fafbfa; }
.gmsg-row {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: #fff;
  padding: 12px;
  cursor: pointer;
}
.gmsg-row.active { background: rgba(45, 106, 79, 0.08); border-left: 3px solid var(--primary, #2d6a4f); }
.gmsg-row.unread .gmsg-row-title { font-weight: 800; }
.gmsg-row:disabled { opacity: 0.55; cursor: not-allowed; }
.gmsg-new { background: #f0fdf4; }
.gmsg-row-title { font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gmsg-type {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 999px;
  padding: 1px 6px;
  border: 1px solid var(--border, #e2e8f0);
}
.gmsg-type--email { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.gmsg-type--secure { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.gmsg-row-meta { font-size: 12px; color: var(--text-secondary, #64748b); margin-top: 2px; }
.gmsg-chat { display: flex; flex-direction: column; min-height: 0; }
.gmsg-chat-head {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gmsg-thread {
  flex: 1;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gmsg-bubble {
  max-width: 85%;
  padding: 8px 10px;
  border-radius: 12px;
  background: #e8f1ff;
  align-self: flex-start;
}
.gmsg-bubble.mine { background: #eef2f7; align-self: flex-end; }
.gmsg-meta { font-size: 11px; color: var(--text-secondary, #64748b); margin-bottom: 2px; }
.gmsg-body { white-space: pre-wrap; font-size: 14px; }
.gmsg-composer {
  border-top: 1px solid var(--border, #e2e8f0);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gmsg-composer.pad { border-top: none; }
.gmsg-composer textarea,
.gmsg-field input,
.gmsg-field select {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  padding: 8px;
  font: inherit;
  resize: vertical;
}
.gmsg-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 650; }
.pad { padding: 14px; }
.error { color: #b91c1c; padding: 8px 0; }
.muted { color: var(--text-secondary, #64748b); }
@media (max-width: 700px) {
  .gmsg-body { grid-template-columns: 1fr; }
}
.group-label{display:block;font-size:12px;margin-top:6px;color:#526784}.conversation-audience{padding:14px;background:#eef4fb;border-bottom:1px solid #c9d8e7}.conversation-audience ul{list-style:none;padding:0;margin:8px 0}.conversation-audience li{padding:4px 0;font-size:14px}.conversation-audience p{font-size:13px;line-height:1.5;margin:8px 0 0}.conversation-audience span{color:#526784}
</style>
