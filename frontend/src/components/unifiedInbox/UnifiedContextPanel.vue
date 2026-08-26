<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  detail: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null }
});
const emit = defineEmits(['patch', 'refresh']);

const router = useRouter();
const route = useRoute();
const busy = ref('');
const actionMsg = ref('');
const attachType = ref('client');
const attachQ = ref('');
const attachResults = ref([]);
const showAttach = ref(false);
const showReferral = ref(false);
const referralInitials = ref('');
const referralReason = ref('');
const showTicket = ref(false);
const ticketQuestion = ref('');

const conv = computed(() => props.detail?.conversation || null);
const linked = computed(() => props.detail?.context?.linkedTo || {});
const recognized = computed(() => props.detail?.context?.recognized || null);

const slug = computed(() => String(route.params?.organizationSlug || '').trim());
const prefix = computed(() => (slug.value ? `/${slug.value}` : ''));

watch(
  () => props.detail?.conversation?.id,
  () => {
    actionMsg.value = '';
    showAttach.value = false;
    showReferral.value = false;
    showTicket.value = false;
    attachQ.value = '';
    attachResults.value = [];
  }
);

function openClient() {
  const id = linked.value?.client?.id;
  if (!id) return;
  router.push(`${prefix.value}/admin/clients?clientId=${id}`);
}

function openSchool() {
  const id = linked.value?.school?.id;
  if (!id) return;
  router.push(`${prefix.value}/admin/schools?orgId=${id}`);
}

function openTicket() {
  const id = linked.value?.ticket?.id || conv.value?.support_ticket_id;
  if (!id) return;
  router.push(`${prefix.value}/tickets?ticketId=${id}`);
}

async function runAction(key, fn) {
  if (!conv.value) return;
  busy.value = key;
  actionMsg.value = '';
  try {
    const data = await fn();
    actionMsg.value = data?.okMessage || 'Done';
    emit('refresh', data);
  } catch (e) {
    actionMsg.value = e?.response?.data?.error?.message || e?.message || 'Action failed';
  } finally {
    busy.value = '';
  }
}

async function createTask() {
  await runAction('task', async () => {
    const { data } = await api.post(`/communications/conversations/${conv.value.id}/actions/create-task`, {});
    return { ...data, okMessage: 'Task created' };
  });
}

async function searchAttach() {
  if (!props.agencyId || String(attachQ.value).trim().length < 2) {
    attachResults.value = [];
    return;
  }
  const { data } = await api.get('/communications/link-search', {
    params: { agencyId: props.agencyId, type: attachType.value, q: attachQ.value },
    skipGlobalLoading: true
  });
  attachResults.value = data?.results || [];
}

async function attachEntity(row) {
  await runAction('attach', async () => {
    const { data } = await api.post(`/communications/conversations/${conv.value.id}/links`, {
      entityType: row.entity_type,
      entityId: row.id,
      label: row.label
    });
    showAttach.value = false;
    attachQ.value = '';
    attachResults.value = [];
    return { ...data, okMessage: `Linked ${row.label}` };
  });
}

async function createTicket() {
  await runAction('ticket', async () => {
    const { data } = await api.post(`/communications/conversations/${conv.value.id}/actions/create-ticket`, {
      question: ticketQuestion.value || undefined,
      schoolOrganizationId: linked.value?.school?.id
    });
    showTicket.value = false;
    ticketQuestion.value = '';
    return { ...data, okMessage: `Ticket #${data?.ticket?.id || ''} created` };
  });
}

async function createReferral() {
  await runAction('referral', async () => {
    const { data } = await api.post(`/communications/conversations/${conv.value.id}/actions/create-referral`, {
      organizationId: linked.value?.school?.id,
      studentInitials: referralInitials.value,
      referralReason: referralReason.value
    });
    showReferral.value = false;
    referralInitials.value = '';
    referralReason.value = '';
    return { ...data, okMessage: 'Referral client created' };
  });
}

async function addSchoolNote() {
  await runAction('school-note', async () => {
    const { data } = await api.post(`/communications/conversations/${conv.value.id}/actions/school-note`, {});
    return { ...data, okMessage: 'Added to school record (internal note)' };
  });
}
</script>

<template>
  <aside class="uc-ctx">
    <div v-if="!conv" class="uc-ctx-empty">
      Conversation context appears here when you open a thread.
    </div>
    <template v-else>
      <section v-if="recognized" class="uc-card recog">
        <h4>Recognized contact</h4>
        <p class="uc-recog-title">{{ recognized.label }}</p>
        <p class="uc-muted">{{ recognized.kind }}{{ recognized.email ? ` · ${recognized.email}` : '' }}</p>
        <p v-if="recognized.activeReferrals != null || recognized.enrolledClients != null" class="uc-muted">
          <template v-if="recognized.activeReferrals != null">{{ recognized.activeReferrals }} active referrals</template>
          <template v-if="recognized.enrolledClients != null">
            <template v-if="recognized.activeReferrals != null"> · </template>
            {{ recognized.enrolledClients }} enrolled clients
          </template>
        </p>
      </section>

      <section v-if="conv.ai_summary || conv.ai_suggested_action" class="uc-card ai">
        <h4>AI suggested next step</h4>
        <p v-if="conv.ai_suggested_action" class="uc-ai-action">{{ conv.ai_suggested_action }}</p>
        <p v-else-if="conv.ai_summary" class="uc-muted">{{ conv.ai_summary }}</p>
        <p v-if="conv.ai_summary_at" class="uc-muted tiny">
          Updated {{ new Date(conv.ai_summary_at).toLocaleString() }}
        </p>
      </section>

      <section class="uc-card">
        <h4>Linked to</h4>
        <dl class="uc-dl">
          <template v-if="linked.client">
            <dt>Client</dt>
            <dd>
              {{ linked.client.name }}
              <span v-if="linked.client.status" class="uc-mini">{{ linked.client.status }}</span>
            </dd>
          </template>
          <template v-if="linked.guardian">
            <dt>Guardian</dt>
            <dd>{{ linked.guardian.name }}</dd>
          </template>
          <template v-if="linked.school">
            <dt>School</dt>
            <dd>{{ linked.school.name }}</dd>
          </template>
          <template v-if="linked.ticket">
            <dt>Ticket</dt>
            <dd>#{{ linked.ticket.id }} · {{ linked.ticket.status }}</dd>
          </template>
          <p v-if="!linked.client && !linked.school && !linked.ticket" class="uc-muted">No linked records yet.</p>
        </dl>
        <div class="uc-ctx-btns">
          <button v-if="linked.client" type="button" class="uc-btn" @click="openClient">Open Client</button>
          <button v-if="linked.school" type="button" class="uc-btn" @click="openSchool">Open School</button>
          <button type="button" class="uc-btn" @click="showAttach = !showAttach">
            {{ showAttach ? 'Cancel attach' : 'Attach Client / School' }}
          </button>
        </div>
        <div v-if="showAttach" class="uc-attach">
          <div class="uc-attach-tabs">
            <button type="button" :class="{ on: attachType === 'client' }" @click="attachType = 'client'; searchAttach()">Client</button>
            <button type="button" :class="{ on: attachType === 'school' }" @click="attachType = 'school'; searchAttach()">School</button>
          </div>
          <input
            v-model="attachQ"
            type="search"
            placeholder="Search…"
            @input="searchAttach"
          />
          <ul v-if="attachResults.length">
            <li v-for="r in attachResults" :key="`${r.entity_type}-${r.id}`">
              <button type="button" @click="attachEntity(r)">{{ r.label }}</button>
            </li>
          </ul>
        </div>
      </section>

      <section class="uc-card">
        <h4>Conversation info</h4>
        <label class="uc-field">
          <span>Status</span>
          <select
            :value="conv.status"
            @change="emit('patch', { status: $event.target.value })"
          >
            <option value="new">New</option>
            <option value="needs_reply">Needs Reply</option>
            <option value="waiting_on_them">Waiting on Them</option>
            <option value="follow_up">Follow Up</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label class="uc-field">
          <span>Priority</span>
          <select
            :value="conv.priority"
            @change="emit('patch', { priority: $event.target.value })"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <p class="uc-muted" style="margin-top: 8px">
          Owner:
          <strong v-if="conv.owner_first_name">{{ conv.owner_first_name }} {{ conv.owner_last_name }}</strong>
          <strong v-else>Unassigned</strong>
        </p>
        <p v-if="conv.due_at" class="uc-muted">Due: {{ new Date(conv.due_at).toLocaleString() }}</p>
        <p v-if="conv.snoozed_until" class="uc-muted">Snoozed until: {{ new Date(conv.snoozed_until).toLocaleString() }}</p>
        <p v-if="conv.inbox_from_email" class="uc-muted">Inbox: {{ conv.inbox_from_email }}</p>
        <p class="uc-muted">Channel: {{ conv.channel }}</p>
      </section>

      <section class="uc-card">
        <h4>Actions</h4>
        <button type="button" class="uc-action" :disabled="!!busy" @click="createTask">
          {{ busy === 'task' ? 'Creating…' : 'Create Task' }}
        </button>
        <button v-if="linked.ticket || conv.support_ticket_id" type="button" class="uc-action" @click="openTicket">
          Open Support Ticket
        </button>
        <button type="button" class="uc-action" :disabled="!!busy" @click="showTicket = !showTicket">
          Create Support Ticket
        </button>
        <div v-if="showTicket" class="uc-mini-form">
          <p v-if="!linked.school" class="uc-muted">Attach a school first (required).</p>
          <textarea v-model="ticketQuestion" rows="3" placeholder="Ticket question / summary…" />
          <button type="button" class="uc-btn" :disabled="!linked.school || !!busy" @click="createTicket">
            Create ticket
          </button>
        </div>
        <button type="button" class="uc-action" :disabled="!!busy" @click="showReferral = !showReferral">
          Create Referral
        </button>
        <div v-if="showReferral" class="uc-mini-form">
          <p v-if="!linked.school" class="uc-muted">Attach a school first (required).</p>
          <input v-model="referralInitials" type="text" placeholder="Student initials" maxlength="12" />
          <textarea v-model="referralReason" rows="2" placeholder="Referral reason…" />
          <button
            type="button"
            class="uc-btn"
            :disabled="!linked.school || !referralInitials.trim() || !!busy"
            @click="createReferral"
          >
            Create referral
          </button>
        </div>
        <button
          v-if="linked.school"
          type="button"
          class="uc-action"
          :disabled="!!busy"
          @click="addSchoolNote"
        >
          {{ busy === 'school-note' ? 'Saving…' : 'Add to School Record' }}
        </button>
        <button v-if="linked.client" type="button" class="uc-action" @click="openClient">
          View Client
        </button>
        <p v-if="actionMsg" class="uc-muted">{{ actionMsg }}</p>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.uc-ctx {
  border-left: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 12px;
  overflow-y: auto;
}
.uc-ctx-empty {
  color: #94a3b8;
  font-size: 0.85rem;
  padding: 20px 8px;
  text-align: center;
}
.uc-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}
.uc-card.recog { border-color: #86efac; background: #f0fdf4; }
.uc-card.ai { border-color: #86efac; background: #f7fee7; }
.uc-ai-action { margin: 0; font-weight: 700; color: #3f6212; font-size: 0.9rem; }
.uc-card h4 {
  margin: 0 0 8px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}
.uc-recog-title { margin: 0; font-weight: 700; color: #166534; }
.uc-muted { color: #64748b; font-size: 0.8rem; margin: 4px 0 0; }
.uc-dl { margin: 0; display: grid; grid-template-columns: 72px 1fr; gap: 6px 8px; font-size: 0.85rem; }
.uc-dl dt { color: #94a3b8; }
.uc-dl dd { margin: 0; color: #0f172a; font-weight: 600; }
.uc-mini {
  font-size: 0.68rem;
  font-weight: 700;
  margin-left: 6px;
  background: #dcfce7;
  color: #166534;
  padding: 1px 6px;
  border-radius: 999px;
}
.uc-ctx-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.uc-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.uc-btn:hover { border-color: #166534; color: #166534; }
.uc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.uc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 0.78rem;
  color: #64748b;
}
.uc-field select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.85rem;
  background: #fff;
}
.uc-action {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 6px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #166534;
  cursor: pointer;
}
.uc-action:hover { background: #dcfce7; }
.uc-action:disabled { opacity: 0.6; cursor: wait; }
.uc-attach { margin-top: 10px; }
.uc-attach-tabs { display: flex; gap: 4px; margin-bottom: 6px; }
.uc-attach-tabs button {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.uc-attach-tabs button.on { background: #166534; color: #fff; border-color: #166534; }
.uc-attach input[type='search'],
.uc-mini-form input,
.uc-mini-form textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.85rem;
  box-sizing: border-box;
}
.uc-attach ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 160px; overflow: auto; }
.uc-attach li button {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 6px 4px;
  font-size: 0.82rem;
  cursor: pointer;
  border-radius: 6px;
}
.uc-attach li button:hover { background: #f1f5f9; }
.uc-mini-form { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 10px; padding: 8px; background: #f8fafc; border-radius: 8px; }
</style>
