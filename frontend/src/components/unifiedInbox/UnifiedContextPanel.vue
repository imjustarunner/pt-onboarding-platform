<script setup>
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  detail: { type: Object, default: null },
  agencyId: { type: [Number, String], default: null }
});
const emit = defineEmits(['patch']);

const router = useRouter();
const route = useRoute();
const taskBusy = ref(false);
const taskMsg = ref('');

const conv = computed(() => props.detail?.conversation || null);
const linked = computed(() => props.detail?.context?.linkedTo || {});
const recognized = computed(() => props.detail?.context?.recognized || null);

const slug = computed(() => String(route.params?.organizationSlug || '').trim());
const prefix = computed(() => (slug.value ? `/${slug.value}` : ''));

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

async function createTask() {
  if (!conv.value) return;
  taskBusy.value = true;
  taskMsg.value = '';
  try {
    await api.post('/me/tasks', {
      title: `Follow up: ${conv.value.subject || 'Conversation'}`,
      description: `From Communications Inbox conversation #${conv.value.id}\n\n${conv.value.last_message_preview || ''}`,
      urgency: 'medium'
    });
    taskMsg.value = 'Task created';
  } catch (e) {
    taskMsg.value = e?.response?.data?.error?.message || 'Could not create task';
  } finally {
    taskBusy.value = false;
  }
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
      </section>

      <section class="uc-card">
        <h4>Actions</h4>
        <button type="button" class="uc-action" :disabled="taskBusy" @click="createTask">
          {{ taskBusy ? 'Creating…' : 'Create Task' }}
        </button>
        <button v-if="linked.ticket || conv.support_ticket_id" type="button" class="uc-action" @click="openTicket">
          Open Support Ticket
        </button>
        <button v-if="linked.client" type="button" class="uc-action" @click="openClient">
          Attach / view Client
        </button>
        <button v-if="linked.school" type="button" class="uc-action" @click="openSchool">
          Add to School Record
        </button>
        <p v-if="taskMsg" class="uc-muted">{{ taskMsg }}</p>
        <p class="uc-muted tiny">Referral / medical-record attach coming in a later phase.</p>
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
.uc-card h4 {
  margin: 0 0 8px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}
.uc-recog-title { margin: 0; font-weight: 700; color: #166534; }
.uc-muted { color: #64748b; font-size: 0.8rem; margin: 4px 0 0; }
.uc-muted.tiny { font-size: 0.72rem; margin-top: 10px; }
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
</style>
