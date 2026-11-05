<template>
  <section class="live-comms" aria-label="Comments, tickets, and texts">
    <div class="live-comms-switch" role="tablist">
      <button v-if="showTexts" type="button" :class="{ on: lane === 'texts' }" @click="lane = 'texts'">Texts</button>
      <button v-if="showSchoolLanes" type="button" :class="{ on: lane === 'comments' }" @click="lane = 'comments'">Comments</button>
      <button v-if="canSeeTickets" type="button" :class="{ on: lane === 'tickets' }" @click="lane = 'tickets'">School tickets</button>
    </div>

    <div v-if="lane === 'texts' && showTexts">
      <p class="muted small">
        Each texting number has its own color. Support texts go out from the support number. Provider texts go out from the provider number, with that person’s name on the message.
      </p>
      <div v-if="!textLanes.length" class="muted">No texts on this file yet.</div>
      <article v-for="group in textLanes" :key="group.number" class="text-lane">
        <h4 :style="hueStyle(group.hue)">{{ group.label }}</h4>
        <ul>
          <li v-for="row in group.rows" :key="row.id" :style="hueStyle(group.hue)">
            <span class="when">{{ formatWhen(row.occurredAt) }}</span>
            <strong>{{ row.direction === 'INBOUND' ? 'In' : 'Out' }}</strong>
            <span>{{ row.body || '—' }}</span>
          </li>
        </ul>
      </article>
      <form v-if="canText" class="composer" @submit.prevent="sendText">
        <label>
          Text this client
          <textarea v-model="textDraft" rows="3" placeholder="Write the text. Your name is added, and it sends from your number." />
        </label>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="textSending || !textDraft.trim()">
          {{ textSending ? 'Sending…' : 'Send text' }}
        </button>
        <p v-if="textError" class="error">{{ textError }}</p>
      </form>
    </div>

    <div v-else-if="lane === 'comments'">
      <p class="muted small">Comments stay on the client file. School staff see a comment only while their own ROI covered the time it was written.</p>
      <p v-if="!organizationId" class="muted">Comments need a school on this client.</p>
      <p v-else-if="commentsLoading" class="muted">Loading comments…</p>
      <p v-else-if="commentsError" class="error">{{ commentsError }}</p>
      <p v-else-if="!comments.length" class="muted">No comments yet.</p>
      <ul v-else class="comment-list">
        <li v-for="comment in comments" :key="comment.id" :style="hueStyle(hueForPerson(comment.author_id || comment.author_name))">
          <div class="when">{{ formatWhen(comment.created_at) }} · {{ comment.author_name || 'Staff' }}</div>
          <p>{{ comment.message }}</p>
        </li>
      </ul>
      <form v-if="organizationId && canComment" class="composer" @submit.prevent="sendComment">
        <label>
          Add a comment
          <textarea v-model="commentDraft" rows="3" maxlength="500" placeholder="A short non-clinical note for the people on this file." />
        </label>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="commentSending || !commentDraft.trim()">
          {{ commentSending ? 'Saving…' : 'Save comment' }}
        </button>
        <p v-if="commentError" class="error">{{ commentError }}</p>
      </form>
    </div>

    <div v-else-if="canSeeTickets">
      <p class="muted small">
        Open a ticket to work it. An email on the ticket stays read-only here and is handled in the ticket.
      </p>
      <p v-if="!organizationId" class="muted">School tickets need a school on this client.</p>
      <p v-else-if="ticketsLoading" class="muted">Loading tickets…</p>
      <p v-else-if="ticketsError" class="error">{{ ticketsError }}</p>
      <p v-else-if="!tickets.length" class="muted">No school tickets yet.</p>
      <ul v-else class="ticket-list">
        <li v-for="ticket in tickets" :key="ticket.id">
          <button type="button" @click="openTicket(ticket)">
            <span class="when">{{ formatWhen(ticket.created_at) }}</span>
            <strong>#{{ ticket.id }}</strong>
            <span>{{ ticket.subject || ticket.question || ticket.source_email_subject || 'Ticket' }}</span>
            <em v-if="hasEmail(ticket)">Email attached</em>
          </button>
        </li>
      </ul>
    </div>

    <TicketDetailModal
      v-if="openTicketId"
      :ticket-id="openTicketId"
      :agency-id="agencyId || null"
      @close="openTicketId = null"
      @updated="loadTickets"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import TicketDetailModal from '../../tickets/TicketDetailModal.vue';
import { formatChartWhen } from '../../../utils/chartWhen.js';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  organizationId: { type: [Number, String], default: 0 },
  agencyId: { type: [Number, String], default: 0 },
  smsItems: { type: Array, default: () => [] }
});
const emit = defineEmits(['sent']);

const auth = useAuthStore();
const role = computed(() => String(auth.user?.role || '').toLowerCase());
const schoolViewer = computed(() => role.value === 'school_staff');
const familyViewer = computed(() => role.value === 'client_guardian' || role.value === 'client');
const showTexts = computed(() => !schoolViewer.value && !familyViewer.value);
const showSchoolLanes = computed(() => !familyViewer.value);
const canSeeTickets = computed(() => showSchoolLanes.value && !['provider', 'provider_plus'].includes(role.value));
const canText = computed(() => showTexts.value && ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider', 'provider_plus'].includes(role.value));
const canComment = computed(() => showSchoolLanes.value && (['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider', 'provider_plus', 'school_staff', 'supervisor'].includes(role.value)));
const lane = ref(schoolViewer.value ? 'comments' : 'texts');
const organizationId = computed(() => Number(props.organizationId || 0));

const textDraft = ref('');
const textSending = ref(false);
const textError = ref('');
const comments = ref([]);
const commentsLoading = ref(false);
const commentsError = ref('');
const commentDraft = ref('');
const commentSending = ref(false);
const commentError = ref('');
const tickets = ref([]);
const ticketsLoading = ref(false);
const ticketsError = ref('');
const openTicketId = ref(null);

const formatWhen = formatChartWhen;

function hueForPerson(key) {
  const text = String(key || 'staff');
  let n = 0;
  for (let i = 0; i < text.length; i += 1) n = (n + text.charCodeAt(i) * (i + 3)) % 360;
  return n;
}

function hueStyle(hue) {
  return {
    background: `hsl(${hue} 42% 95%)`,
    borderColor: `hsl(${hue} 35% 62%)`
  };
}

function laneNumber(row) {
  const inbound = String(row?.direction || '').toUpperCase() === 'INBOUND';
  return String((inbound ? row?.toNumber : row?.fromNumber) || row?.fromNumber || row?.toNumber || 'Unknown number');
}

const textLanes = computed(() => {
  const groups = new Map();
  for (const row of props.smsItems || []) {
    const number = laneNumber(row);
    if (!groups.has(number)) groups.set(number, []);
    groups.get(number).push(row);
  }
  return [...groups.entries()].map(([number, rows]) => ({
    number,
    label: number,
    hue: hueForPerson(number),
    rows: [...rows].sort((a, b) => new Date(a.occurredAt || 0) - new Date(b.occurredAt || 0))
  }));
});

function hasEmail(ticket) {
  return String(ticket?.source_channel || '').toLowerCase() === 'email' || !!ticket?.source_email_subject;
}

async function sendText() {
  textSending.value = true;
  textError.value = '';
  try {
    await api.post('/messages/send', { clientId: Number(props.clientId), body: textDraft.value.trim() }, { skipGlobalLoading: true });
    textDraft.value = '';
    emit('sent');
  } catch (error) {
    textError.value = error.response?.data?.error?.message || 'The text could not be sent.';
  } finally {
    textSending.value = false;
  }
}

async function loadComments() {
  if (!organizationId.value || !props.clientId) {
    comments.value = [];
    return;
  }
  commentsLoading.value = true;
  commentsError.value = '';
  try {
    const res = await api.get(`/school-portal/${organizationId.value}/clients/${props.clientId}/comments`, { skipGlobalLoading: true });
    comments.value = Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    commentsError.value = error.response?.data?.error?.message || 'Comments could not be loaded.';
    comments.value = [];
  } finally {
    commentsLoading.value = false;
  }
}

async function sendComment() {
  commentSending.value = true;
  commentError.value = '';
  try {
    await api.post(
      `/school-portal/${organizationId.value}/clients/${props.clientId}/comments`,
      { message: commentDraft.value.trim() },
      { skipGlobalLoading: true }
    );
    commentDraft.value = '';
    await loadComments();
  } catch (error) {
    commentError.value = error.response?.data?.error?.message || 'The comment could not be saved.';
  } finally {
    commentSending.value = false;
  }
}

async function loadTickets() {
  if (!canSeeTickets.value || !organizationId.value || !props.clientId) {
    tickets.value = [];
    return;
  }
  ticketsLoading.value = true;
  ticketsError.value = '';
  try {
    const res = await api.get('/support-tickets/client-tickets', {
      skipGlobalLoading: true,
      params: { schoolOrganizationId: organizationId.value, clientId: Number(props.clientId) }
    });
    tickets.value = Array.isArray(res.data?.tickets) ? res.data.tickets : [];
  } catch (error) {
    ticketsError.value = error.response?.data?.error?.message || 'Tickets could not be loaded.';
    tickets.value = [];
  } finally {
    ticketsLoading.value = false;
  }
}

function openTicket(ticket) {
  openTicketId.value = ticket.id;
}

watch(() => [props.clientId, organizationId.value], () => {
  loadComments();
  loadTickets();
}, { immediate: true });
</script>

<style scoped>
.live-comms { margin: 0 0 16px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; }
.live-comms-switch { display: flex; gap: 8px; margin-bottom: 10px; }
.live-comms-switch button { border: 1px solid #cbd5e1; background: #fff; border-radius: 999px; padding: 6px 12px; font: inherit; font-weight: 700; cursor: pointer; }
.live-comms-switch button.on { background: #14532d; color: #fff; border-color: #14532d; }
.muted { color: #64748b; }
.small { font-size: 0.85rem; }
.error { color: #b91c1c; }
.text-lane, .comment-list li, .composer { margin-top: 10px; }
.text-lane h4, .text-lane li, .comment-list li { border: 1px solid; border-radius: 10px; padding: 8px 10px; }
.text-lane ul, .comment-list, .ticket-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.when { display: block; font-size: 0.78rem; font-weight: 700; color: #334155; }
.comment-list p { margin: 4px 0 0; }
.composer { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.composer label { display: flex; flex-direction: column; gap: 6px; width: 100%; font-size: 0.82rem; font-weight: 700; }
.composer textarea { font: inherit; font-weight: 400; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; }
.ticket-list button { width: 100%; text-align: left; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 8px 10px; cursor: pointer; }
.ticket-list em { display: inline-block; margin-left: 8px; font-style: normal; font-size: 0.75rem; font-weight: 700; color: #9a3412; }
</style>
