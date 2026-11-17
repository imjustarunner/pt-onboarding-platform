<template>
  <Teleport to="body">
    <div v-if="menu" class="follow-up-menu-backdrop" @pointerdown.self="dismissMenu" @contextmenu.prevent.self="dismissMenu">
      <div class="follow-up-menu" role="menu" aria-label="Client actions" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @keydown.esc.stop.prevent="dismissMenu" @keydown.tab.prevent="dismissMenu">
        <button ref="menuButton" type="button" role="menuitem" @click="open(client)">Create follow-up task</button>
      </div>
    </div>

    <div v-if="isOpen" class="follow-up-overlay" @click.self="close" @keydown="onDialogKeydown">
      <form ref="dialog" class="follow-up-dialog" role="dialog" aria-modal="true" aria-labelledby="client-follow-up-title" @submit.prevent="save">
        <div class="follow-up-heading">
          <h2 id="client-follow-up-title">Create follow-up task</h2>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" aria-label="Close follow-up task" @click="close">Close</button>
        </div>
        <div class="follow-up-client">
          <strong>{{ clientLabel }}</strong>
          <span>Client #{{ client.id }}<template v-if="client.identifier_code"> · {{ client.identifier_code }}</template></span>
          <span v-if="client.agency_name || client.organization_name">{{ client.agency_name || client.organization_name }}</span>
          <RouterLink :to="clientLocation" target="_blank" rel="noopener">Open client profile ↗</RouterLink>
        </div>
        <p class="follow-up-assignee">Assigned to you · {{ assigneeLabel }}</p>
        <label>Title<input ref="titleInput" v-model="draft.title" class="form-control" type="text" required maxlength="255" /></label>
        <label>Note<textarea v-model="draft.note" class="form-control" rows="4" placeholder="What do you need to follow up on?" /></label>
        <div class="follow-up-fields">
          <label>Due date<input v-model="draft.dueDate" class="form-control" type="date" /></label>
          <label>Priority<select v-model="draft.urgency" class="form-control"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </div>
        <label class="follow-up-private"><input v-model="draft.isPrivate" type="checkbox" /> Private — only you can see this task</label>
        <p v-if="error" class="follow-up-error" role="alert">{{ error }}</p>
        <div class="follow-up-actions">
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="close">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="saving || !draft.title.trim() || !authStore.user?.id">{{ saving ? 'Creating…' : 'Create task' }}</button>
        </div>
      </form>
    </div>
    <div v-if="created" class="follow-up-success" role="status">
      Follow-up task created.
      <RouterLink :to="tasksLocation">View my tasks</RouterLink>
      <button type="button" aria-label="Dismiss task confirmation" @click="created = false">×</button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useTasksStore } from '../../store/tasks';
import { useClientDisplayMode } from '../../composables/useClientDisplayMode.js';
import { clientFollowUpLocation, followUpClient } from '../../utils/clientFollowUpTask.js';

const props = defineProps({ agencyId: { type: [Number, String], default: null } });
const emit = defineEmits(['created']);
const route = useRoute();
const authStore = useAuthStore();
const tasksStore = useTasksStore();
const { getClientLabel } = useClientDisplayMode();
const client = ref(null);
const menu = ref(null);
const menuButton = ref(null);
const dialog = ref(null);
const titleInput = ref(null);
const isOpen = ref(false);
const saving = ref(false);
const error = ref('');
const created = ref(false);
const draft = reactive({ title: '', note: '', dueDate: '', urgency: 'medium', isPrivate: true });
let returnFocus = null;
let confirmationTimer;
const clientLabel = computed(() => getClientLabel(client.value));
const assigneeLabel = computed(() => [authStore.user?.first_name, authStore.user?.last_name].filter(Boolean).join(' ') || authStore.user?.email || 'You');
const metadata = computed(() => ({
  source: 'client_follow_up', clientId: client.value?.id,
  agencyId: client.value?.agency_id, organizationSlug: String(route.params.organizationSlug || '')
}));
const clientLocation = computed(() => clientFollowUpLocation({ metadata: metadata.value }));
const tasksLocation = computed(() => ({
  path: `${route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''}/tasks`,
  query: { tab: 'mine' }
}));

function dismissMenu() {
  menu.value = null;
  returnFocus?.focus?.();
}

async function openContextMenu(event, record) {
  if (event.defaultPrevented || event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const selected = followUpClient(record, props.agencyId);
  if (!selected.id || !authStore.user?.id || isOpen.value) return;
  event.preventDefault();
  event.stopPropagation();
  returnFocus = document.activeElement;
  client.value = selected;
  const rect = event.currentTarget?.getBoundingClientRect?.();
  menu.value = {
    x: Math.max(8, Math.min(event.clientX || rect?.left || 8, window.innerWidth - 248)),
    y: Math.max(8, Math.min(event.clientY || rect?.top || 8, window.innerHeight - 64))
  };
  await nextTick();
  menuButton.value?.focus();
}

async function open(record) {
  if (saving.value) return;
  const selected = followUpClient(record, props.agencyId);
  if (!selected.id || !authStore.user?.id) return;
  if (!menu.value) returnFocus = document.activeElement;
  menu.value = null;
  client.value = selected;
  Object.assign(draft, { title: `Follow up with ${getClientLabel(selected)}`, note: '', dueDate: '', urgency: 'medium', isPrivate: true });
  error.value = '';
  created.value = false;
  isOpen.value = true;
  await nextTick();
  titleInput.value?.focus();
}

function close() {
  if (saving.value) return;
  isOpen.value = false;
  returnFocus?.focus?.();
}

function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    event.preventDefault();
    close();
  }
  if (event.key !== 'Tab') return;
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled), input, textarea, select, a[href]')];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

async function save() {
  if (saving.value || !draft.title.trim() || !authStore.user?.id) return;
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post('/me/tasks', {
      title: draft.title.trim(), description: draft.note.trim() || null,
      dueDate: draft.dueDate || null, urgency: draft.urgency,
      assignedToUserId: Number(authStore.user.id), agencyId: client.value.agency_id || undefined,
      isPrivate: draft.isPrivate, categories: ['client'], metadata: metadata.value
    });
    saving.value = false;
    close();
    created.value = true;
    clearTimeout(confirmationTimer);
    confirmationTimer = setTimeout(() => { created.value = false; }, 8000);
    emit('created', data);
    void tasksStore.fetchTaskCounts(client.value.agency_id).catch(() => {});
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Unable to create the follow-up task. Please try again.';
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => { clearTimeout(confirmationTimer); });
defineExpose({ open, openContextMenu });
</script>

<style scoped>
.follow-up-menu-backdrop, .follow-up-overlay { position:fixed; inset:0; z-index:22000; }
.follow-up-menu { position:fixed; width:240px; max-width:calc(100vw - 16px); padding:6px; border:1px solid var(--border,#dbe4ee); border-radius:10px; background:var(--bg,#fff); box-shadow:0 8px 32px #0003; }
.follow-up-menu button { width:100%; padding:12px; border:0; border-radius:6px; text-align:left; background:transparent; color:var(--text-primary,#173c62); cursor:pointer; font:inherit; }
.follow-up-menu button:hover, .follow-up-menu button:focus-visible { background:var(--bg-alt,#f1f5f9); }
.follow-up-overlay { display:flex; align-items:center; justify-content:center; padding:20px; background:#0007; }
.follow-up-dialog { width:100%; max-width:540px; max-height:calc(100dvh - 40px); overflow-y:auto; padding:24px; border-radius:14px; background:var(--bg,#fff); color:var(--text-primary,#173c62); box-shadow:0 16px 60px #0004; }
.follow-up-heading, .follow-up-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.follow-up-heading h2 { margin:0; font-size:21px; }
.follow-up-client { display:flex; flex-direction:column; gap:4px; margin-top:18px; padding:12px; border:1px solid var(--border,#dbe4ee); border-radius:8px; background:var(--bg-alt,#f8fafc); }
.follow-up-client span, .follow-up-assignee { font-size:13px; color:var(--text-secondary,#64748b); }
.follow-up-dialog label { display:flex; flex-direction:column; gap:6px; margin:14px 0; font-size:14px; font-weight:600; }
.follow-up-fields { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.follow-up-fields label { min-width:0; }
.follow-up-dialog .follow-up-private { flex-direction:row; align-items:center; font-weight:400; }
.follow-up-actions { justify-content:flex-end; margin-top:20px; }
.follow-up-error { color:var(--danger,#b91c1c); }
.follow-up-success { position:fixed; bottom:24px; right:24px; z-index:22001; display:flex; align-items:center; flex-wrap:wrap; gap:12px; max-width:calc(100vw - 48px); padding:16px; border:1px solid var(--border,#dbe4ee); border-radius:10px; background:var(--bg,#fff); color:var(--text-primary,#173c62); box-shadow:0 8px 28px #0003; }
.follow-up-success button { border:0; background:transparent; color:inherit; font-size:22px; cursor:pointer; }
@media(max-width:500px) { .follow-up-dialog { padding:18px; } .follow-up-heading { align-items:flex-start; } .follow-up-fields { grid-template-columns:1fr; gap:0; } }
</style>
