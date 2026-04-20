<template>
  <div v-if="open" class="rdq-overlay" @click.self="close">
    <div class="rdq-drawer">
      <header class="rdq-head">
        <h3>Pending referral directory changes</h3>
        <button type="button" class="rdq-icon-btn" @click="close" aria-label="Close">✕</button>
      </header>

      <div v-if="loading" class="rdq-state">Loading…</div>
      <div v-else-if="!pending.length" class="rdq-state">
        Nothing pending — the queue is clear.
      </div>

      <ul v-else class="rdq-list">
        <li v-for="cr in pending" :key="cr.id" class="rdq-item">
          <div class="rdq-item-head">
            <span class="rdq-badge" :class="`is-${cr.change_type}`">{{ typeLabel(cr.change_type) }}</span>
            <strong>{{ itemName(cr) }}</strong>
            <span class="rdq-submitter">
              by {{ submitterName(cr) }} · {{ formatDate(cr.created_at) }}
            </span>
          </div>

          <div v-if="cr.change_type === 'delete'" class="rdq-diff-note">
            Will soft-delete entry #{{ cr.entry_id }} ({{ cr.entry_current_name || 'unknown' }}).
          </div>

          <div v-else class="rdq-diff">
            <div class="rdq-col">
              <div class="rdq-col-head">{{ cr.change_type === 'create' ? 'Proposed' : 'Current' }}</div>
              <dl>
                <template v-for="field in DIFF_FIELDS" :key="`cur-${field.key}`">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ formatVal(cr.change_type === 'create' ? cr.proposed_payload?.[field.key] : cr[`entry_current_${field.key}`]) }}</dd>
                </template>
              </dl>
            </div>
            <div v-if="cr.change_type === 'update'" class="rdq-col">
              <div class="rdq-col-head">Proposed</div>
              <dl>
                <template v-for="field in DIFF_FIELDS" :key="`new-${field.key}`">
                  <dt>{{ field.label }}</dt>
                  <dd :class="{ 'is-changed': isChanged(cr, field.key) }">
                    {{ formatVal(cr.proposed_payload?.[field.key]) }}
                  </dd>
                </template>
              </dl>
            </div>
          </div>

          <div class="rdq-actions">
            <input
              v-model="notesById[cr.id]"
              type="text"
              placeholder="Optional note to submitter"
              class="rdq-notes"
              maxlength="500"
            />
            <button class="btn btn-secondary" :disabled="busyId === cr.id" @click="review(cr, 'reject')">Reject</button>
            <button class="btn btn-primary" :disabled="busyId === cr.id" @click="review(cr, 'approve')">Approve</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'reviewed']);

const pending = ref([]);
const loading = ref(false);
const busyId = ref(null);
const notesById = reactive({});

const DIFF_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'organization_name', label: 'Organization' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
  { key: 'specialties', label: 'Specialties' },
  { key: 'insurances_accepted', label: 'Insurances' },
  { key: 'notes', label: 'Notes' }
];

watch(() => props.open, (isOpen) => {
  if (isOpen) refresh();
}, { immediate: true });

function close() { emit('close'); }

function typeLabel(t) {
  return t === 'create' ? 'New' : t === 'update' ? 'Edit' : 'Delete';
}
function itemName(cr) {
  if (cr.change_type === 'create') return cr.proposed_payload?.name || '(unnamed)';
  return cr.entry_current_name || cr.proposed_payload?.name || `Entry #${cr.entry_id}`;
}
function submitterName(cr) {
  return [cr.submitted_by_first_name, cr.submitted_by_last_name].filter(Boolean).join(' ') || 'Unknown user';
}
function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function formatVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}
function isChanged(cr, key) {
  const cur = cr[`entry_current_${key}`];
  const nxt = cr.proposed_payload?.[key];
  return (cur || '') !== (nxt || '');
}

async function refresh() {
  loading.value = true;
  try {
    const params = props.agencyId ? { agencyId: props.agencyId } : {};
    const resp = await api.get('/referral-directory/change-requests', { params: { status: 'pending', ...params } });
    pending.value = resp.data?.changeRequests || [];
  } catch (e) {
    console.warn('[ReferralDirectoryAdminQueue] refresh failed', e?.message);
    pending.value = [];
  } finally {
    loading.value = false;
  }
}

async function review(cr, action) {
  if (busyId.value) return;
  busyId.value = cr.id;
  try {
    const body = { adminNotes: notesById[cr.id] || null };
    const params = props.agencyId ? { agencyId: props.agencyId } : {};
    await api.post(`/referral-directory/change-requests/${cr.id}/${action}`, body, { params });
    pending.value = pending.value.filter((r) => r.id !== cr.id);
    delete notesById[cr.id];
    emit('reviewed', { id: cr.id, action });
  } catch (e) {
    alert(e?.response?.data?.error?.message || `Failed to ${action} change request`);
  } finally {
    busyId.value = null;
  }
}

defineExpose({ refresh });
</script>

<style scoped>
.rdq-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; justify-content: flex-end;
  z-index: 9100;
}
.rdq-drawer {
  background: var(--card-bg, #fff);
  color: var(--text, #111);
  width: min(720px, 100%);
  height: 100%;
  overflow: auto;
  box-shadow: -12px 0 40px rgba(0,0,0,0.2);
}
.rdq-head {
  position: sticky; top: 0;
  background: inherit;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.rdq-head h3 { margin: 0; font-size: 16px; }
.rdq-icon-btn { background: none; border: none; cursor: pointer; font-size: 18px; color: var(--muted, #6b7280); }
.rdq-state { padding: 24px 18px; color: var(--muted, #6b7280); }
.rdq-list { list-style: none; margin: 0; padding: 12px 18px 24px; display: flex; flex-direction: column; gap: 14px; }
.rdq-item { border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 12px 14px; }
.rdq-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rdq-submitter { margin-left: auto; font-size: 12px; color: var(--muted, #6b7280); }
.rdq-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: #eff6ff;
  color: #1d4ed8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rdq-badge.is-update { background: #fef3c7; color: #92400e; }
.rdq-badge.is-delete { background: #fee2e2; color: #991b1b; }
.rdq-diff { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 10px; }
.rdq-diff :deep(dl) { display: grid; grid-template-columns: 160px 1fr; row-gap: 4px; margin: 0; font-size: 13px; }
.rdq-diff :deep(dt) { color: var(--muted, #6b7280); }
.rdq-col-head { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted, #6b7280); margin-bottom: 4px; }
.rdq-diff dd.is-changed { background: #ecfdf5; padding: 1px 4px; border-radius: 4px; }
.rdq-diff-note { margin: 8px 0; font-size: 13px; color: #991b1b; }
.rdq-actions { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.rdq-notes { flex: 1; padding: 7px 10px; font-size: 13px; border: 1px solid var(--border, #d1d5db); border-radius: 6px; }
@media (min-width: 720px) {
  .rdq-diff { grid-template-columns: 1fr 1fr; }
}
</style>
