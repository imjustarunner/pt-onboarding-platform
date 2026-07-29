<template>
  <div class="detail-section cc-messages-tab">
    <div class="cc-messages-banner" role="status">
      <span aria-hidden="true">ℹ️</span>
      <span><strong>Reminder:</strong> Use initials only. Do not include PHI. This is not Therapy Notes.</span>
    </div>

    <p v-if="loading" class="muted">Loading messages…</p>
    <p v-else-if="error" class="cc-messages-error">{{ error }}</p>

    <div v-else class="cc-messages-layout">
      <!-- Client-facing messages -->
      <section class="cc-messages-card">
        <div class="cc-messages-card__head">
          <div>
            <h3 class="cc-messages-card__title">Messages</h3>
            <p class="cc-messages-card__sub">Client-facing notes (initials only)</p>
          </div>
          <div class="cc-messages-filters">
            <select v-model="categoryFilter" class="cc-messages-select" aria-label="Filter by category">
              <option value="all">All categories</option>
              <option value="general">General</option>
              <option value="status">Status update</option>
              <option value="administrative">Administrative</option>
              <option value="billing">Billing</option>
            </select>
          </div>
        </div>

        <div v-if="filteredSharedMessages.length" class="cc-messages-list">
          <article v-for="note in filteredSharedMessages" :key="note.id" class="cc-messages-item">
            <div class="cc-messages-item__meta">
              <span class="cc-messages-item__author">{{ note.author_name || 'Unknown' }}</span>
              <span class="cc-messages-item__date">{{ formatDateTime(note.created_at) }}</span>
              <span v-if="note.category" class="cc-messages-pill">{{ formatCategory(note.category) }}</span>
            </div>
            <div class="cc-messages-item__body">{{ note.message }}</div>
          </article>
        </div>
        <div v-else class="cc-messages-empty">
          <div class="cc-messages-empty__icon" aria-hidden="true">💬</div>
          <p><strong>No messages yet.</strong></p>
          <p>Add the first message using the form below.</p>
        </div>

        <div class="cc-messages-compose">
          <h4 class="cc-messages-card__title" style="font-size: 15px;">Add message</h4>
          <div class="cc-messages-compose__row">
            <div class="cc-messages-field">
              <label for="msg-category">Category</label>
              <select id="msg-category" v-model="newNoteCategory" class="cc-messages-select">
                <option value="general">General</option>
                <option value="status">Status update</option>
                <option value="administrative">Administrative</option>
                <option value="billing">Billing</option>
              </select>
            </div>
            <div class="cc-messages-field">
              <label>Visibility</label>
              <span class="cc-messages-pill">Client-facing</span>
            </div>
          </div>
          <textarea
            v-model="newNoteMessage"
            class="cc-messages-textarea"
            rows="4"
            maxlength="2000"
            placeholder="Type your message here…"
          />
          <div class="cc-messages-compose__foot">
            <span class="cc-messages-hint">Remember: Use initials only. No PHI.</span>
            <span class="cc-messages-char">{{ newNoteMessage.length }}/2000</span>
          </div>
          <button
            type="button"
            class="cc-btn-primary"
            style="width: auto; align-self: flex-start;"
            :disabled="!newNoteMessage.trim() || creatingNote"
            @click="createSharedNote"
          >
            {{ creatingNote ? 'Sending…' : 'Send message' }}
          </button>
        </div>
      </section>

      <!-- Internal notes -->
      <section v-if="isBackofficeRole" class="cc-messages-card">
        <div class="cc-messages-card__head">
          <div>
            <h3 class="cc-messages-card__title cc-messages-lock">
              <span aria-hidden="true">🔒</span> Internal notes
            </h3>
            <p class="cc-messages-card__sub">Admin only — not client-facing</p>
          </div>
          <button type="button" class="cc-btn-primary" style="width: auto;" @click="openInternalComposer">
            New admin note
          </button>
        </div>

        <div v-if="internalNotes.length" class="cc-messages-list">
          <article
            v-for="note in internalNotes"
            :key="note.id"
            class="cc-messages-item cc-messages-item--internal"
          >
            <div class="cc-messages-item__meta">
              <span class="cc-messages-item__author">{{ note.author_name || 'Unknown' }}</span>
              <span class="cc-messages-item__date">{{ formatDateTime(note.created_at) }}</span>
              <span v-if="note.category" class="cc-messages-pill">{{ formatCategory(note.category) }}</span>
              <span class="cc-messages-pill cc-messages-pill--internal">Internal</span>
            </div>
            <div class="cc-messages-item__body">{{ note.message }}</div>
          </article>
        </div>
        <div v-else class="cc-messages-empty">
          <div class="cc-messages-empty__icon" aria-hidden="true">📝</div>
          <p><strong>No internal notes yet.</strong></p>
          <p>Internal notes are for backoffice staff only. They are not client-facing messages.</p>
        </div>
      </section>
    </div>

    <div v-if="showInternalComposer" class="cc-messages-modal" @click.self="closeInternalComposer">
      <div class="cc-messages-modal__panel" role="dialog" aria-modal="true" aria-labelledby="internal-note-title">
        <div class="cc-messages-modal__head">
          <div>
            <h3 id="internal-note-title">New admin note</h3>
            <p class="cc-messages-card__sub">Internal only. Not visible to school staff or providers.</p>
          </div>
          <button type="button" class="cc-btn-soft" style="width: auto;" @click="closeInternalComposer">✕</button>
        </div>
        <textarea
          v-model="internalNoteMessage"
          class="cc-messages-textarea"
          rows="6"
          maxlength="2000"
          placeholder="Add an internal admin note…"
        />
        <div class="cc-messages-compose__foot">
          <span class="cc-messages-char">{{ internalNoteMessage.length }}/2000</span>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="cc-btn-soft" style="width: auto;" @click="closeInternalComposer">Cancel</button>
            <button
              type="button"
              class="cc-btn-primary"
              style="width: auto;"
              :disabled="creatingInternal || !internalNoteMessage.trim()"
              @click="createInternalNote"
            >
              {{ creatingInternal ? 'Saving…' : 'Save note' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import '../../../styles/client-messages-tab.css';

const props = defineProps({
  clientId: { type: Number, required: true },
  isBackofficeRole: { type: Boolean, default: false }
});

const loading = ref(false);
const error = ref('');
const notes = ref([]);
const categoryFilter = ref('all');
const newNoteMessage = ref('');
const newNoteCategory = ref('general');
const creatingNote = ref(false);
const showInternalComposer = ref(false);
const internalNoteMessage = ref('');
const creatingInternal = ref(false);

const sharedMessages = computed(() => (notes.value || []).filter((n) => !n?.is_internal_only));
const internalNotes = computed(() => (notes.value || []).filter((n) => !!n?.is_internal_only));

const filteredSharedMessages = computed(() => {
  const list = sharedMessages.value;
  if (categoryFilter.value === 'all') return list;
  return list.filter((n) => String(n?.category || 'general').toLowerCase() === categoryFilter.value);
});

function formatCategory(c) {
  const map = {
    general: 'General',
    status: 'Status',
    administrative: 'Admin',
    billing: 'Billing',
    packages: 'Packages',
    clinical: 'Clinical'
  };
  return map[String(c || '').toLowerCase()] || c;
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return Number.isNaN(d.getTime()) ? String(dateString) : d.toLocaleString();
}

async function loadNotes() {
  if (!props.clientId) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get(`/clients/${props.clientId}/notes`);
    notes.value = response.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load messages';
    notes.value = [];
  } finally {
    loading.value = false;
  }
}

async function createSharedNote() {
  if (!newNoteMessage.value.trim() || !props.clientId) return;
  creatingNote.value = true;
  error.value = '';
  try {
    await api.post(`/clients/${props.clientId}/notes`, {
      message: newNoteMessage.value.trim(),
      is_internal_only: false,
      category: newNoteCategory.value
    });
    newNoteMessage.value = '';
    newNoteCategory.value = 'general';
    await loadNotes();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to send message';
  } finally {
    creatingNote.value = false;
  }
}

function openInternalComposer() {
  internalNoteMessage.value = '';
  showInternalComposer.value = true;
}

function closeInternalComposer() {
  showInternalComposer.value = false;
}

async function createInternalNote() {
  if (!internalNoteMessage.value.trim() || !props.clientId) return;
  creatingInternal.value = true;
  error.value = '';
  try {
    await api.post(`/clients/${props.clientId}/notes`, {
      message: internalNoteMessage.value.trim(),
      is_internal_only: true,
      category: 'administrative'
    });
    internalNoteMessage.value = '';
    showInternalComposer.value = false;
    await loadNotes();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save internal note';
  } finally {
    creatingInternal.value = false;
  }
}

onMounted(loadNotes);
watch(() => props.clientId, loadNotes);
</script>

<style scoped>
.muted { color: var(--text-secondary, #64748b); }
</style>
