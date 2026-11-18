<template>
  <Teleport to="body">
    <dialog ref="dialog" class="unlinked-cleanup" aria-labelledby="unlinked-cleanup-title" @cancel.prevent="close">
      <header><h2 id="unlinked-cleanup-title">Clean up my unlinked test notes</h2><button type="button" :disabled="busy" aria-label="Close cleanup" @click="close">×</button></header>
      <p>Select only test items you want to permanently delete. This removes saved drafts from In progress and client charts, along with their My Work entries. Queue-only test items can also be removed.</p>
      <p>Only your own unlinked items appear. Session-linked work, signed notes, tasks, and drafts used by existing clinical records are kept. Uploaded files and clinical records are kept.</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="loading" role="status">Checking unlinked items…</p>
      <template v-else>
        <p v-if="!items.length && !message">No eligible unlinked drafts or My Work entries found.</p>
        <p v-else-if="!items.length">Refresh the preview to check for any remaining items.</p>
        <template v-else>
          <p>{{ total }} eligible items<span v-if="total > items.length">; showing {{ items.length }}. Reopen the preview after this batch to review more</span>.</p>
          <label><input type="checkbox" :checked="selected.length === items.length" :disabled="busy" @change="selectAll($event.target.checked)" /> Select all shown</label>
          <ul class="unlinked-cleanup__items">
            <li v-for="item in items" :key="key(item)">
              <label><input v-model="selected" type="checkbox" :value="key(item)" :disabled="busy" />
                <span><strong>{{ item.initials || (item.clientId ? `Client #${item.clientId}` : 'No client') }}</strong> · {{ item.dateOfService || 'No service date' }} · {{ item.serviceCode || 'No service code' }}<br />
                  <small>{{ item.kind === 'draft' ? `Draft #${item.id}` : 'My Work only' }}<template v-if="item.kind === 'draft' && item.workQueueCount"> · {{ item.workQueueCount }} My Work {{ item.workQueueCount === 1 ? 'entry' : 'entries' }}</template></small>
                </span>
              </label>
            </li>
          </ul>
          <label class="unlinked-cleanup__confirmation">Type DELETE UNLINKED to confirm permanent deletion
            <input v-model="confirmation" :disabled="busy" autocomplete="off" spellcheck="false" />
          </label>
        </template>
      </template>
      <footer>
        <button type="button" :disabled="busy" @click="close">Close</button>
        <button type="button" :disabled="busy || loading" @click="loadPreview">Refresh preview</button>
        <button type="button" class="unlinked-cleanup__delete" :disabled="busy || loading || !selected.length || confirmation !== 'DELETE UNLINKED'" @click="removeSelected">{{ busy ? 'Deleting…' : `Delete selected (${selected.length})` }}</button>
      </footer>
    </dialog>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({ afterDelete: { type: Function, required: true } });
const emit = defineEmits(['close']);
const dialog = ref(null);
const items = ref([]);
const total = ref(0);
const selected = ref([]);
const confirmation = ref('');
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');
const key = item => `${item.kind}:${item.id}`;
const close = () => { if (!busy.value) emit('close'); };
const selectAll = checked => { selected.value = checked ? items.value.map(key) : []; };

async function loadPreview() {
  loading.value = true;
  error.value = '';
  items.value = [];
  selected.value = [];
  confirmation.value = '';
  try {
    const { data } = await api.get('/clinical-notes/drafts/unlinked-cleanup', { skipGlobalLoading: true });
    items.value = data.items || [];
    total.value = data.total || 0;
  } catch (err) { error.value = err.response?.data?.error?.message || 'Unable to preview unlinked notes.'; }
  finally { loading.value = false; }
}

async function removeSelected() {
  if (busy.value || !selected.value.length || confirmation.value !== 'DELETE UNLINKED') return;
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    const selection = items.value.filter(item => selected.value.includes(key(item))).map(({ kind, id, version }) => ({ kind, id, version }));
    const { data } = await api.post('/clinical-notes/drafts/unlinked-cleanup', {
      items: selection, confirmation: confirmation.value
    }, { skipGlobalLoading: true });
    message.value = `Deleted ${data.deletedDraftIds.length} drafts and ${data.deletedWorkQueueIds.length} My Work entries.`;
    selected.value = [];
    confirmation.value = '';
    items.value = [];
    try { await props.afterDelete(data); }
    catch { error.value = 'Deletion succeeded. Refresh the workspace to update its lists.'; }
    // No automatic second deletion. A new batch always needs a fresh review.
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Cleanup failed. Refresh the preview before trying again.';
    selected.value = [];
    confirmation.value = '';
  } finally { busy.value = false; }
}

onMounted(() => {
  if (dialog.value?.showModal) dialog.value.showModal();
  else dialog.value?.setAttribute('open', '');
  loadPreview();
});
</script>

<style scoped>
.unlinked-cleanup { width: min(720px, calc(100vw - 32px)); max-height: 85vh; overflow: auto; border: 1px solid #cbd5e1; border-radius: 16px; padding: 24px; color: #172033; background: white; }
.unlinked-cleanup::backdrop { background: rgb(15 23 42 / 55%); }
header, footer { display: flex; align-items: center; gap: 12px; }
header { justify-content: space-between; }
h2 { margin: 0; font-size: 1.2rem; }
footer { justify-content: flex-end; flex-wrap: wrap; margin-top: 20px; }
button { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; color: #172033; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.unlinked-cleanup__delete { background: #b91c1c; color: white; border-color: #b91c1c; }
.unlinked-cleanup__items { list-style: none; padding: 0; max-height: 35vh; overflow: auto; }
li { padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
li label { display: flex; align-items: flex-start; gap: 10px; }
.unlinked-cleanup__confirmation { display: grid; gap: 8px; }
.unlinked-cleanup__confirmation input { padding: 10px; border: 1px solid #94a3b8; border-radius: 6px; }
[role=alert] { color: #b91c1c; }
</style>
