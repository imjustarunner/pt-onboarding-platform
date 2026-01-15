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
        <div class="messages">
          <div v-if="notes.length === 0" class="empty">No messages yet.</div>
          <div v-for="n in notes" :key="n.id" class="msg">
            <div class="meta">
              <span class="author">{{ n.author_name || 'Unknown' }}</span>
              <span class="date">{{ formatDateTime(n.created_at) }}</span>
              <span v-if="n.category" class="category">{{ formatCategory(n.category) }}</span>
            </div>
            <div class="text">{{ n.message }}</div>
          </div>
        </div>

        <div class="composer">
          <div class="row">
            <label>
              Category
              <select v-model="category">
                <option value="general">General</option>
                <option value="status">Status update</option>
                <option value="administrative">Administrative</option>
                <option value="billing">Billing</option>
                <option value="clinical">Clinical question</option>
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
  client: { type: Object, required: true }
});
defineEmits(['close']);

const loading = ref(false);
const sending = ref(false);
const error = ref('');
const notes = ref([]);

const message = ref('');
const category = ref('general');

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/clients/${props.client.id}/notes`);
    // School users only ever see shared notes (backend filters).
    notes.value = (resp.data || []).filter((n) => !n.is_internal_only);
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
      category: category.value
    });
    message.value = '';
    category.value = 'general';
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

