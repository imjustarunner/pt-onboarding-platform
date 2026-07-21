<template>
  <div class="ptp">
    <div class="ptp-head">
      <div>
        <div class="ptp-title">Payroll To‑Dos</div>
        <div class="ptp-hint">
          These block running payroll until marked Done. Check items off here, or add a one-off To‑Do for this period.
          Changes save immediately and appear on the Payroll page too.
        </div>
        <div v-if="periodLabel" class="ptp-period">Period: <strong>{{ periodLabel }}</strong></div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="reload">Refresh</button>
    </div>

    <div class="ptp-tabs">
      <button type="button" class="ptp-tab" :class="{ active: tab === 'period' }" @click="tab = 'period'">
        This pay period
        <span v-if="pendingCount" class="ptp-count">{{ pendingCount }}</span>
      </button>
      <button type="button" class="ptp-tab" :class="{ active: tab === 'templates' }" @click="tab = 'templates'">
        Recurring templates
      </button>
    </div>

    <div v-if="error" class="ptp-error">{{ error }}</div>

    <!-- Period todos -->
    <div v-if="tab === 'period'" class="ptp-body">
      <div class="ptp-card">
        <div class="ptp-section-title">Add a To‑Do (this period)</div>
        <div class="ptp-grid">
          <div class="field">
            <label>Scope</label>
            <select v-model="newDraft.scope" :disabled="creating || locked">
              <option value="agency">Agency-wide</option>
              <option value="provider">Per-provider</option>
            </select>
          </div>
          <div v-if="newDraft.scope === 'provider'" class="field">
            <label>Provider</label>
            <select v-model="newDraft.targetUserId" :disabled="creating || locked || loadingUsers">
              <option :value="null">Select provider…</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
            </select>
          </div>
          <div class="field" style="grid-column: 1 / -1;">
            <label>Title</label>
            <input v-model="newDraft.title" type="text" placeholder="e.g., Verify X before running payroll" :disabled="creating || locked" />
          </div>
          <div class="field" style="grid-column: 1 / -1;">
            <label>Description (optional)</label>
            <textarea v-model="newDraft.description" rows="2" placeholder="Optional details…" :disabled="creating || locked" />
          </div>
        </div>
        <div class="ptp-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="creating || locked || !canCreateNew"
            @click="createTodo"
          >
            {{ creating ? 'Adding…' : 'Add To‑Do' }}
          </button>
        </div>
      </div>

      <div class="ptp-section-title" style="margin-top: 16px;">
        To‑Dos for this pay period
        <span v-if="pendingCount" class="ptp-muted" style="font-weight: 400;">({{ pendingCount }} pending)</span>
      </div>
      <div v-if="loading" class="ptp-muted">Loading…</div>
      <div v-else-if="!todos.length" class="ptp-muted">No To‑Dos yet.</div>
      <div v-else class="ptp-table-wrap">
        <table class="ptp-table">
          <thead>
            <tr>
              <th style="width: 80px;">Done</th>
              <th>To‑Do</th>
              <th style="width: 200px;">Scope</th>
              <th style="width: 160px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in todos" :key="t.id" :class="{ 'ptp-row--done': isDone(t) }">
              <td>
                <input
                  type="checkbox"
                  :checked="isDone(t)"
                  :disabled="updatingId === t.id || locked"
                  @change="toggleDone(t, $event.target.checked)"
                />
              </td>
              <td>
                <div v-if="editingId !== t.id">
                  <div><strong>{{ t.title }}</strong></div>
                  <div v-if="t.description" class="ptp-muted" style="margin-top: 4px;">{{ t.description }}</div>
                </div>
                <div v-else class="ptp-edit">
                  <div class="field">
                    <label>Title</label>
                    <input v-model="editDraft.title" type="text" :disabled="savingEdit" />
                  </div>
                  <div class="field" style="margin-top: 8px;">
                    <label>Description</label>
                    <textarea v-model="editDraft.description" rows="2" :disabled="savingEdit" />
                  </div>
                </div>
              </td>
              <td class="ptp-muted">
                <div v-if="editingId !== t.id">
                  <span v-if="String(t.scope || 'agency') === 'provider'">Provider: {{ nameFor(t.target_user_id) }}</span>
                  <span v-else>Agency-wide</span>
                  <div v-if="t.template_id" class="ptp-pill">From template</div>
                </div>
                <div v-else class="ptp-edit">
                  <div class="field">
                    <label>Scope</label>
                    <select v-model="editDraft.scope" :disabled="savingEdit">
                      <option value="agency">Agency-wide</option>
                      <option value="provider">Per-provider</option>
                    </select>
                  </div>
                  <div v-if="editDraft.scope === 'provider'" class="field" style="margin-top: 8px;">
                    <label>Provider</label>
                    <select v-model="editDraft.targetUserId" :disabled="savingEdit">
                      <option :value="null">Select provider…</option>
                      <option v-for="u in users" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                    </select>
                  </div>
                </div>
              </td>
              <td class="right">
                <div v-if="editingId !== t.id" class="ptp-row-actions">
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="updatingId === t.id || locked" @click="beginEdit(t)">
                    Edit
                  </button>
                  <button
                    v-if="!t.template_id"
                    type="button"
                    class="btn btn-danger btn-sm"
                    :disabled="updatingId === t.id || locked"
                    title="Deletes only ad-hoc To-Dos (recurring template items cannot be deleted here)."
                    @click="deleteTodo(t)"
                  >
                    Delete
                  </button>
                </div>
                <div v-else class="ptp-row-actions">
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="savingEdit" @click="cancelEdit">Cancel</button>
                  <button type="button" class="btn btn-primary btn-sm" :disabled="savingEdit || !canSaveEdit" @click="saveEdit">
                    {{ savingEdit ? 'Saving…' : 'Save' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Templates -->
    <div v-else class="ptp-body">
      <div class="ptp-card">
        <div class="ptp-section-title">Create recurring template</div>
        <div class="ptp-grid">
          <div class="field">
            <label>Scope</label>
            <select v-model="templateDraft.scope" :disabled="savingTemplate">
              <option value="agency">Agency-wide</option>
              <option value="provider">Per-provider</option>
            </select>
          </div>
          <div v-if="templateDraft.scope === 'provider'" class="field">
            <label>Provider</label>
            <select v-model="templateDraft.targetUserId" :disabled="savingTemplate || loadingUsers">
              <option :value="null">Select provider…</option>
              <option v-for="u in users" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Start at pay period</label>
            <select v-model="templateDraft.startPayrollPeriodId" :disabled="savingTemplate">
              <option :value="null">Start immediately</option>
              <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
            </select>
          </div>
          <div class="field">
            <label>Active</label>
            <select v-model="templateDraft.isActive" :disabled="savingTemplate">
              <option :value="true">Active</option>
              <option :value="false">Inactive</option>
            </select>
          </div>
          <div class="field" style="grid-column: 1 / -1;">
            <label>Title</label>
            <input v-model="templateDraft.title" type="text" placeholder="e.g., Confirm XYZ is correct" :disabled="savingTemplate" />
          </div>
          <div class="field" style="grid-column: 1 / -1;">
            <label>Description (optional)</label>
            <textarea v-model="templateDraft.description" rows="2" placeholder="Optional details…" :disabled="savingTemplate" />
          </div>
        </div>
        <div class="ptp-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="savingTemplate || !canCreateTemplate"
            @click="createTemplate"
          >
            {{ savingTemplate ? 'Saving…' : 'Create template' }}
          </button>
        </div>
      </div>

      <div class="ptp-section-title" style="margin-top: 16px;">Templates</div>
      <div v-if="templatesLoading" class="ptp-muted">Loading templates…</div>
      <div v-else-if="!templates.length" class="ptp-muted">No templates yet.</div>
      <div v-else class="ptp-table-wrap">
        <table class="ptp-table">
          <thead>
            <tr>
              <th style="width: 80px;">Active</th>
              <th>Template</th>
              <th style="width: 180px;">Starts</th>
              <th style="width: 160px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id">
              <td>
                <input
                  type="checkbox"
                  :checked="Number(t.is_active) === 1"
                  :disabled="busyTemplateId === t.id"
                  @change="toggleTemplateActive(t, $event.target.checked)"
                />
              </td>
              <td>
                <div v-if="editingTemplateId !== t.id">
                  <div><strong>{{ t.title }}</strong></div>
                  <div class="ptp-muted" style="margin-top: 4px;">
                    <span v-if="String(t.scope || 'agency') === 'provider'">Provider: {{ nameFor(t.target_user_id) }}</span>
                    <span v-else>Agency-wide</span>
                  </div>
                  <div v-if="t.description" class="ptp-muted" style="margin-top: 4px;">{{ t.description }}</div>
                </div>
                <div v-else class="ptp-edit">
                  <div class="ptp-grid">
                    <div class="field">
                      <label>Scope</label>
                      <select v-model="editTemplateDraft.scope" :disabled="savingTemplateEdit">
                        <option value="agency">Agency-wide</option>
                        <option value="provider">Per-provider</option>
                      </select>
                    </div>
                    <div v-if="editTemplateDraft.scope === 'provider'" class="field">
                      <label>Provider</label>
                      <select v-model="editTemplateDraft.targetUserId" :disabled="savingTemplateEdit">
                        <option :value="null">Select provider…</option>
                        <option v-for="u in users" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Start at pay period</label>
                      <select v-model="editTemplateDraft.startPayrollPeriodId" :disabled="savingTemplateEdit">
                        <option :value="null">Start immediately</option>
                        <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label>Active</label>
                      <select v-model="editTemplateDraft.isActive" :disabled="savingTemplateEdit">
                        <option :value="true">Active</option>
                        <option :value="false">Inactive</option>
                      </select>
                    </div>
                    <div class="field" style="grid-column: 1 / -1;">
                      <label>Title</label>
                      <input v-model="editTemplateDraft.title" type="text" :disabled="savingTemplateEdit" />
                    </div>
                    <div class="field" style="grid-column: 1 / -1;">
                      <label>Description</label>
                      <textarea v-model="editTemplateDraft.description" rows="2" :disabled="savingTemplateEdit" />
                    </div>
                  </div>
                </div>
              </td>
              <td class="ptp-muted">
                <template v-if="editingTemplateId !== t.id">
                  <span v-if="Number(t.start_payroll_period_id || 0) > 0">{{ startPeriodLabel(t.start_payroll_period_id) }}</span>
                  <span v-else>Immediately</span>
                </template>
              </td>
              <td class="right">
                <div v-if="editingTemplateId !== t.id" class="ptp-row-actions">
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyTemplateId === t.id" @click="beginEditTemplate(t)">
                    Edit
                  </button>
                  <button type="button" class="btn btn-danger btn-sm" :disabled="busyTemplateId === t.id" @click="deleteTemplate(t)">
                    {{ busyTemplateId === t.id ? '…' : 'Delete' }}
                  </button>
                </div>
                <div v-else class="ptp-row-actions">
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="savingTemplateEdit" @click="cancelEditTemplate">Cancel</button>
                  <button type="button" class="btn btn-primary btn-sm" :disabled="savingTemplateEdit || !canSaveTemplateEdit" @click="saveTemplateEdit">
                    {{ savingTemplateEdit ? 'Saving…' : 'Save' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="ptp-muted" style="margin-top: 8px;">
        Template edits affect future pay periods. Existing period To‑Dos are unchanged.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  periodId: { type: [Number, String], required: true },
  periodLabel: { type: String, default: '' },
  periodStatus: { type: String, default: '' },
  periods: { type: Array, default: () => [] }
});

const emit = defineEmits(['changed']);

const locked = computed(() => {
  const s = String(props.periodStatus || '').toLowerCase();
  return s === 'posted' || s === 'finalized';
});

const tab = ref('period');
const loading = ref(false);
const templatesLoading = ref(false);
const loadingUsers = ref(false);
const error = ref('');
const todos = ref([]);
const templates = ref([]);
const users = ref([]);
const updatingId = ref(null);
const creating = ref(false);
const editingId = ref(null);
const savingEdit = ref(false);
const savingTemplate = ref(false);
const busyTemplateId = ref(null);
const editingTemplateId = ref(null);
const savingTemplateEdit = ref(false);

const newDraft = ref({ scope: 'agency', targetUserId: null, title: '', description: '' });
const editDraft = ref({ title: '', description: '', scope: 'agency', targetUserId: null });
const templateDraft = ref({
  scope: 'agency',
  targetUserId: null,
  startPayrollPeriodId: null,
  title: '',
  description: '',
  isActive: true
});
const editTemplateDraft = ref({
  scope: 'agency',
  targetUserId: null,
  startPayrollPeriodId: null,
  title: '',
  description: '',
  isActive: true
});

const isDone = (t) => String(t?.status || '').toLowerCase() === 'done';

const pendingCount = computed(() => (todos.value || []).filter((t) => !isDone(t)).length);

const canCreateNew = computed(() => {
  const title = String(newDraft.value.title || '').trim();
  if (!title) return false;
  if (newDraft.value.scope === 'provider' && !(Number(newDraft.value.targetUserId) > 0)) return false;
  return true;
});

const canSaveEdit = computed(() => {
  const title = String(editDraft.value.title || '').trim();
  if (!title) return false;
  if (editDraft.value.scope === 'provider' && !(Number(editDraft.value.targetUserId) > 0)) return false;
  return true;
});

const canCreateTemplate = computed(() => {
  const title = String(templateDraft.value.title || '').trim();
  if (!title) return false;
  if (templateDraft.value.scope === 'provider' && !(Number(templateDraft.value.targetUserId) > 0)) return false;
  return true;
});

const canSaveTemplateEdit = computed(() => {
  const title = String(editTemplateDraft.value.title || '').trim();
  if (!title) return false;
  if (editTemplateDraft.value.scope === 'provider' && !(Number(editTemplateDraft.value.targetUserId) > 0)) return false;
  return true;
});

const nameFor = (userId) => {
  const u = (users.value || []).find((x) => Number(x.id) === Number(userId));
  if (!u) return userId ? `User #${userId}` : '—';
  return `${u.last_name || ''}, ${u.first_name || ''}`.replace(/^,\s*|,\s*$/g, '') || `User #${userId}`;
};

const periodRangeLabel = (p) => {
  if (!p) return '';
  const a = String(p.period_start || '').slice(0, 10);
  const b = String(p.period_end || '').slice(0, 10);
  return a && b ? `${a} → ${b}` : `Period #${p.id}`;
};

const startPeriodLabel = (periodId) => {
  const p = (props.periods || []).find((x) => Number(x.id) === Number(periodId));
  return p ? periodRangeLabel(p) : `Period #${periodId}`;
};

const loadUsers = async () => {
  if (!props.agencyId) return;
  loadingUsers.value = true;
  try {
    const resp = await api.get('/payroll/agency-users', { params: { agencyId: props.agencyId, includeInactive: true } });
    users.value = (resp.data || []).slice().sort((a, b) =>
      String(a.last_name || '').localeCompare(String(b.last_name || '')) ||
      String(a.first_name || '').localeCompare(String(b.first_name || ''))
    );
  } catch {
    users.value = [];
  } finally {
    loadingUsers.value = false;
  }
};

const loadTodos = async () => {
  if (!props.periodId) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${props.periodId}/todos`);
    todos.value = resp.data || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load payroll To‑Dos';
    todos.value = [];
  } finally {
    loading.value = false;
  }
};

const loadTemplates = async () => {
  if (!props.agencyId) return;
  templatesLoading.value = true;
  try {
    const resp = await api.get('/payroll/todo-templates', { params: { agencyId: props.agencyId } });
    templates.value = resp.data || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load recurring To‑Do templates';
    templates.value = [];
  } finally {
    templatesLoading.value = false;
  }
};

const reload = async () => {
  error.value = '';
  await Promise.all([loadUsers(), loadTodos(), loadTemplates()]);
};

const toggleDone = async (t, done) => {
  if (!t?.id || !props.periodId) return;
  updatingId.value = t.id;
  error.value = '';
  try {
    await api.patch(`/payroll/periods/${props.periodId}/todos/${t.id}`, { status: done ? 'done' : 'pending' });
    await loadTodos();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update To‑Do';
  } finally {
    updatingId.value = null;
  }
};

const createTodo = async () => {
  if (!props.periodId || !canCreateNew.value) return;
  creating.value = true;
  error.value = '';
  try {
    const scope = newDraft.value.scope === 'provider' ? 'provider' : 'agency';
    await api.post(`/payroll/periods/${props.periodId}/todos`, {
      title: String(newDraft.value.title || '').trim(),
      description: String(newDraft.value.description || '').trim() || null,
      scope,
      targetUserId: scope === 'provider' ? Number(newDraft.value.targetUserId) : 0
    });
    newDraft.value = { scope: 'agency', targetUserId: null, title: '', description: '' };
    await loadTodos();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to create To‑Do';
  } finally {
    creating.value = false;
  }
};

const beginEdit = (t) => {
  editingId.value = t.id;
  editDraft.value = {
    title: String(t.title || ''),
    description: String(t.description || ''),
    scope: String(t.scope || 'agency') === 'provider' ? 'provider' : 'agency',
    targetUserId: Number(t.target_user_id || 0) || null
  };
};

const cancelEdit = () => {
  editingId.value = null;
};

const saveEdit = async () => {
  if (!props.periodId || !editingId.value || !canSaveEdit.value) return;
  savingEdit.value = true;
  error.value = '';
  try {
    const scope = editDraft.value.scope === 'provider' ? 'provider' : 'agency';
    await api.patch(`/payroll/periods/${props.periodId}/todos/${editingId.value}`, {
      title: String(editDraft.value.title || '').trim(),
      description: String(editDraft.value.description || '').trim() || null,
      scope,
      targetUserId: scope === 'provider' ? Number(editDraft.value.targetUserId) : 0
    });
    editingId.value = null;
    await loadTodos();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update To‑Do';
  } finally {
    savingEdit.value = false;
  }
};

const deleteTodo = async (t) => {
  if (!props.periodId || !t?.id) return;
  if (t.template_id) {
    error.value = 'This To‑Do comes from a recurring template. Edit or delete the template instead.';
    return;
  }
  if (!window.confirm('Delete this To‑Do for this pay period?')) return;
  updatingId.value = t.id;
  error.value = '';
  try {
    await api.delete(`/payroll/periods/${props.periodId}/todos/${t.id}`);
    await loadTodos();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to delete To‑Do';
  } finally {
    updatingId.value = null;
  }
};

const createTemplate = async () => {
  if (!props.agencyId || !canCreateTemplate.value) return;
  savingTemplate.value = true;
  error.value = '';
  try {
    const scope = templateDraft.value.scope === 'provider' ? 'provider' : 'agency';
    await api.post('/payroll/todo-templates', {
      agencyId: props.agencyId,
      title: String(templateDraft.value.title || '').trim(),
      description: String(templateDraft.value.description || '').trim() || null,
      scope,
      targetUserId: scope === 'provider' ? Number(templateDraft.value.targetUserId) : 0,
      startPayrollPeriodId: templateDraft.value.startPayrollPeriodId || null,
      isActive: !!templateDraft.value.isActive
    });
    templateDraft.value = {
      scope: 'agency',
      targetUserId: null,
      startPayrollPeriodId: null,
      title: '',
      description: '',
      isActive: true
    };
    await loadTemplates();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to create recurring To‑Do template';
  } finally {
    savingTemplate.value = false;
  }
};

const beginEditTemplate = (t) => {
  editingTemplateId.value = t.id;
  editTemplateDraft.value = {
    scope: String(t.scope || 'agency') === 'provider' ? 'provider' : 'agency',
    targetUserId: Number(t.target_user_id || 0) || null,
    startPayrollPeriodId: Number(t.start_payroll_period_id || 0) > 0 ? Number(t.start_payroll_period_id) : null,
    title: String(t.title || ''),
    description: String(t.description || ''),
    isActive: Number(t.is_active) === 1
  };
};

const cancelEditTemplate = () => {
  editingTemplateId.value = null;
};

const saveTemplateEdit = async () => {
  if (!props.agencyId || !editingTemplateId.value || !canSaveTemplateEdit.value) return;
  savingTemplateEdit.value = true;
  error.value = '';
  try {
    const scope = editTemplateDraft.value.scope === 'provider' ? 'provider' : 'agency';
    await api.patch(`/payroll/todo-templates/${editingTemplateId.value}`, {
      agencyId: props.agencyId,
      title: String(editTemplateDraft.value.title || '').trim(),
      description: String(editTemplateDraft.value.description || '').trim() || null,
      scope,
      targetUserId: scope === 'provider' ? Number(editTemplateDraft.value.targetUserId) : 0,
      startPayrollPeriodId: editTemplateDraft.value.startPayrollPeriodId || null,
      isActive: !!editTemplateDraft.value.isActive
    });
    editingTemplateId.value = null;
    await loadTemplates();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update template';
  } finally {
    savingTemplateEdit.value = false;
  }
};

const toggleTemplateActive = async (tpl, nextActive) => {
  if (!tpl?.id || !props.agencyId) return;
  busyTemplateId.value = tpl.id;
  error.value = '';
  try {
    await api.patch(`/payroll/todo-templates/${tpl.id}`, {
      agencyId: props.agencyId,
      title: tpl.title,
      description: tpl.description || null,
      scope: tpl.scope,
      targetUserId: tpl.target_user_id,
      startPayrollPeriodId: tpl.start_payroll_period_id,
      isActive: !!nextActive
    });
    await loadTemplates();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update template';
  } finally {
    busyTemplateId.value = null;
  }
};

const deleteTemplate = async (tpl) => {
  if (!tpl?.id || !props.agencyId) return;
  if (!window.confirm('Delete this recurring To‑Do template? (Existing pay period To‑Dos will remain.)')) return;
  busyTemplateId.value = tpl.id;
  error.value = '';
  try {
    await api.delete(`/payroll/todo-templates/${tpl.id}`, { params: { agencyId: props.agencyId } });
    await loadTemplates();
    emit('changed');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to delete template';
  } finally {
    busyTemplateId.value = null;
  }
};

watch(() => [props.agencyId, props.periodId], reload);
onMounted(reload);
</script>

<style scoped>
.ptp { display: flex; flex-direction: column; gap: 12px; }
.ptp-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.ptp-title { font-size: 1.05rem; font-weight: 800; color: var(--text-primary, #1d2633); }
.ptp-hint { font-size: 13px; color: var(--text-secondary, #64748b); margin-top: 4px; max-width: 820px; }
.ptp-period { margin-top: 6px; font-size: 13px; }
.ptp-tabs {
  display: flex; flex-wrap: wrap; gap: 0;
  border-bottom: 2px solid var(--border, #e2e8f0);
}
.ptp-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-size: 13px; font-weight: 600;
  background: none; border: none; border-bottom: 2px solid transparent;
  margin-bottom: -2px; cursor: pointer; color: var(--text-secondary, #64748b);
}
.ptp-tab:hover { color: var(--pr-forest, #2d5a3d); }
.ptp-tab.active { color: var(--pr-forest, #2d5a3d); border-bottom-color: var(--pr-forest, #2d5a3d); }
.ptp-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700;
}
.ptp-error {
  padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px;
}
.ptp-muted { color: var(--text-secondary, #64748b); font-size: 13px; }
.ptp-section-title {
  font-size: 13px; font-weight: 750; color: var(--text-primary, #1d2633);
}
.ptp-card {
  border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
  padding: 12px 14px; background: #fafbfc;
}
.ptp-table-wrap { overflow-x: auto; max-height: 420px; overflow-y: auto; }
.ptp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ptp-table th, .ptp-table td {
  padding: 8px 10px; border-bottom: 1px solid var(--border, #e2e8f0);
  text-align: left; vertical-align: top;
}
.ptp-table th {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--text-secondary, #64748b); position: sticky; top: 0; background: #fff;
}
.ptp-table .right { text-align: right; }
.ptp-row--done td { opacity: 0.65; }
.ptp-row-actions { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.ptp-actions { display: flex; justify-content: flex-end; margin-top: 10px; }
.ptp-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;
}
.field label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--text-secondary, #64748b); margin-bottom: 4px;
}
.field input, .field select, .field textarea {
  width: 100%; padding: 6px 8px; border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px; font-size: 13px; background: #fff; box-sizing: border-box;
}
.ptp-pill {
  display: inline-block; margin-top: 4px; padding: 1px 7px; border-radius: 999px;
  background: #eef2ff; color: #3730a3; font-size: 11px; font-weight: 600;
}
.ptp-edit { min-width: 180px; }
@media (max-width: 720px) {
  .ptp-grid { grid-template-columns: 1fr; }
}
</style>
