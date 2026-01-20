<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h2>Student: {{ client.initials }}</h2>
        <button class="close" @click="$emit('close')">×</button>
      </div>

      <div class="phi-warning">
        <strong>Reminder:</strong> Use initials only. Do not include PHI. This is not an EHR.
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="body">
        <div v-if="checklist" class="checklist">
          <div class="checklist-title">Compliance checklist (read-only)</div>
          <div class="checklist-grid">
            <div class="check-item">
              <div class="k">Parents Contacted</div>
              <div class="v">{{ formatDateOnly(checklist.parents_contacted_at) }}</div>
            </div>
            <div class="check-item">
              <div class="k">Successful?</div>
              <div class="v">
                {{ checklist.parents_contacted_successful === null ? '—' : (checklist.parents_contacted_successful ? 'Yes' : 'No') }}
              </div>
            </div>
            <div class="check-item">
              <div class="k">Intake Date</div>
              <div class="v">{{ formatDateOnly(checklist.intake_at) }}</div>
            </div>
            <div class="check-item">
              <div class="k">First Service</div>
              <div class="v">{{ formatDateOnly(checklist.first_service_at) }}</div>
            </div>
          </div>
          <div v-if="checklistAudit" class="checklist-audit">{{ checklistAudit }}</div>
        </div>

        <div class="messages">
          <div v-if="notes.length === 0" class="empty">No messages yet.</div>
          <div v-for="n in notes" :key="n.id" class="msg">
            <div class="meta">
              <span class="author">{{ n.author_name || 'Unknown' }}</span>
              <span class="date">{{ formatDateTime(n.created_at) }}</span>
              <span v-if="n.category" class="category">{{ formatCategory(n.category) }}</span>
              <span v-if="n.urgency" class="category">{{ formatUrgency(n.urgency) }}</span>
            </div>
            <div class="text">{{ n.message }}</div>
          </div>
        </div>

        <div class="composer">
          <div class="row">
            <label>
              Category
              <select v-model="category">
                <option v-for="c in categoryOptions" :key="c.key" :value="c.key">
                  {{ c.label }}
                </option>
              </select>
            </label>
            <label style="margin-left: 12px;">
              Urgency
              <select v-model="urgency">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <textarea v-model="message" rows="4" placeholder="Enter your message (initials only)..." />
          <button class="btn btn-primary" @click="send" :disabled="sending || !message.trim()">
            {{ sending ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const props = defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, default: null }
});
defineEmits(['close']);

const loading = ref(false);
const sending = ref(false);
const error = ref('');
const notes = ref([]);
const checklist = ref(null);
const checklistAudit = ref('');

const message = ref('');
const category = ref('general');
const urgency = ref('low');
const categoryOptions = ref([
  { key: 'general', label: 'General' },
  { key: 'behavior', label: 'Behavior' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'medical', label: 'Medical' }
]);

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    // Load category options from school settings (best-effort)
    if (props.schoolOrganizationId) {
      try {
        const cr = await api.get(`/school-settings/${props.schoolOrganizationId}/comment-categories`);
        if (Array.isArray(cr.data?.categories) && cr.data.categories.length) {
          categoryOptions.value = cr.data.categories;
          // If current category is not in options, reset.
          const keys = new Set(cr.data.categories.map((c) => c.key));
          if (!keys.has(category.value)) category.value = 'general';
        }
      } catch {
        // ignore
      }
    }
    const resp = await api.get(`/clients/${props.client.id}/notes`);
    // School users only ever see shared notes (backend filters).
    notes.value = (resp.data || []).filter((n) => !n.is_internal_only);

    // Compliance checklist (read-only for school staff)
    try {
      const c = (await api.get(`/clients/${props.client.id}`)).data || {};
      checklist.value = {
        parents_contacted_at: c.parents_contacted_at || null,
        parents_contacted_successful: c.parents_contacted_successful === null || c.parents_contacted_successful === undefined ? null : !!c.parents_contacted_successful,
        intake_at: c.intake_at || null,
        first_service_at: c.first_service_at || null
      };
      const who = c.checklist_updated_by_name || null;
      const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
      checklistAudit.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
    } catch {
      checklist.value = null;
      checklistAudit.value = '';
    }
    // Mark as read (best-effort).
    try {
      await api.post(`/clients/${props.client.id}/notes/read`);
    } catch {
      // ignore
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    loading.value = false;
  }
};

const send = async () => {
  try {
    sending.value = true;
    error.value = '';
    await api.post(`/clients/${props.client.id}/notes`, {
      message: message.value.trim(),
      is_internal_only: false,
      category: category.value,
      urgency: urgency.value
    });
    message.value = '';
    category.value = 'general';
    urgency.value = 'low';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
const formatCategory = (c) => ({
  general: 'General',
  status: 'Status',
  administrative: 'Admin',
  billing: 'Billing',
  clinical: 'Clinical'
}[c] || c);

const formatUrgency = (u) => ({
  low: 'Low',
  medium: 'Medium',
  high: 'High'
}[String(u || '').toLowerCase()] || u);

const formatDateOnly = (d) => (d ? String(d).slice(0, 10) : '—');

onMounted(load);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 900px;
  max-width: 95vw;
  max-height: 90vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.checklist {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
  margin-bottom: 12px;
}
.checklist-title {
  font-weight: 700;
  margin-bottom: 8px;
}
.checklist-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.check-item .k {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.check-item .v {
  margin-top: 2px;
}
.checklist-audit {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.close { border: none; background: none; font-size: 28px; cursor: pointer; }
.phi-warning {
  margin: 12px 16px 0 16px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}
.body { padding: 16px; display: grid; grid-template-columns: 1fr; gap: 12px; }
.messages {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  overflow-y: auto;
  max-height: 44vh;
}
.msg { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
.author { color: var(--text-primary); font-weight: 700; }
.category { padding: 2px 8px; border: 1px solid var(--border); border-radius: 999px; }
.text { color: var(--text-primary); white-space: pre-wrap; }
.composer { border-top: 1px solid var(--border); padding-top: 12px; }
textarea, select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.row { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 10px; }
.loading, .empty { color: var(--text-secondary); }
.error { color: #c33; }
</style>

