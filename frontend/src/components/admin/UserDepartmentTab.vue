<template>
  <div class="tab-panel">
    <h2>Departments</h2>
    <p class="section-description">Department access for Budget Management. Enable access and assign departments per agency.</p>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="loading">Loading…</div>

    <div v-else>
      <div class="field">
        <label>Agency</label>
        <select v-model="selectedAgencyId">
          <option value="">Select an agency…</option>
          <option v-for="a in agencyOptions" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
      </div>

      <div v-if="selectedAgencyId" class="department-access-section" style="margin-top: 16px;">
        <label class="compact-toggle" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <input
            type="checkbox"
            v-model="hasDepartmentAccess"
            :disabled="saving"
            @change="saveAccess"
          />
          <span>Department access</span>
        </label>
        <p class="muted" style="margin-bottom: 12px;">When enabled, this user can access Budget Management for the selected agency.</p>

        <div v-if="hasDepartmentAccess" class="department-assignments" style="margin-top: 12px;">
          <label class="field-label">Assigned departments</label>
          <div v-if="departmentsLoading" class="muted">Loading departments…</div>
          <div v-else class="department-checkboxes" style="display: flex; flex-wrap: wrap; gap: 12px; flex-direction: column;">
            <label v-for="d in departments" :key="d.id" style="display: flex; align-items: center; gap: 12px;">
              <input
                type="checkbox"
                :value="d.id"
                v-model="selectedDepartmentIds"
                :disabled="saving"
                @change="saveAccess"
              />
              <span>{{ d.name }}</span>
              <label v-if="canShowApproverForDepartment(d.id)" style="display: flex; align-items: center; gap: 6px; margin-left: 12px; font-weight: normal;">
                <input
                  type="checkbox"
                  :checked="isApproverForDepartment(d.id)"
                  :disabled="saving || !selectedDepartmentIds.includes(d.id)"
                  @change="(e) => { setApproverForDepartment(d.id, e.target.checked); saveAccess(); }"
                />
                <span class="muted">Approver</span>
              </label>
            </label>
            <span v-if="!departments.length" class="muted">No departments configured. Add them in Settings → Workflow → Departments.</span>
          </div>
        </div>

        <div v-if="hasDepartmentAccess && isAssistantAdmin" class="assistant-admin-permissions" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
          <label class="field-label">Assistant Admin permissions</label>
          <p class="muted" style="margin-bottom: 10px; font-size: 13px;">Granular permissions for Budget Management when role is Assistant Admin.</p>
          <div class="permission-checkboxes" style="display: flex; flex-wrap: wrap; gap: 12px;">
            <label v-for="p in assistantAdminPermissionOptions" :key="p.key" style="display: flex; align-items: center; gap: 6px;">
              <input
                type="checkbox"
                :checked="assistantAdminPermissions[p.key]"
                :disabled="saving"
                @change="(e) => { setAssistantAdminPermission(p.key, e.target.checked); saveAccess(); }"
              />
              <span>{{ p.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <div v-if="selectedAgencyId && !budgetEnabled" class="hint" style="margin-top: 12px; padding: 8px 12px; background: #fff3cd; border-radius: 8px;">
        Budget Management is not enabled for this agency. Enable it in Agency → Features.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';

const ASSISTANT_ADMIN_PERMISSION_OPTIONS = [
  { key: 'canManageBudgetAllocation', label: 'Manage budget allocation' },
  { key: 'canManageBudgetSettings', label: 'Manage categories, accounts, purposes' },
  { key: 'canApproveExpenses', label: 'Approve expenses' },
  { key: 'canViewReports', label: 'View reports & export' }
];

const props = defineProps({
  userId: { type: [Number, String], required: true },
  userAgencies: { type: Array, default: () => [] },
  userRole: { type: String, default: '' }
});

const loading = ref(false);
const error = ref('');
const saving = ref(false);
const selectedAgencyId = ref('');
const accessByAgency = ref({});
const departments = ref([]);
const departmentsLoading = ref(false);
const budgetEnabled = ref(false);

const agencyOptions = computed(() => props.userAgencies || []);
const isAssistantAdmin = computed(() => String(props.userRole || '').trim().toLowerCase() === 'assistant_admin');
const assistantAdminPermissionOptions = ASSISTANT_ADMIN_PERMISSION_OPTIONS;

const hasDepartmentAccess = computed({
  get() {
    const a = accessByAgency.value[selectedAgencyId.value];
    return a?.hasDepartmentAccess ?? false;
  },
  set(v) {
    if (!selectedAgencyId.value) return;
    if (!accessByAgency.value[selectedAgencyId.value]) {
      accessByAgency.value[selectedAgencyId.value] = {};
    }
    accessByAgency.value[selectedAgencyId.value].hasDepartmentAccess = v;
  }
});

const selectedDepartmentIds = computed({
  get() {
    const a = accessByAgency.value[selectedAgencyId.value];
    return a?.departmentIds ?? [];
  },
  set(v) {
    if (!selectedAgencyId.value) return;
    const a = accessByAgency.value[selectedAgencyId.value] || {};
    const existing = a.departmentAssignments || [];
    const existingMap = new Map(existing.map((x) => [x.departmentId, x.isApprover]));
    const newAssign = v.map((id) => ({
      departmentId: id,
      isApprover: existingMap.get(id) === true
    }));
    accessByAgency.value[selectedAgencyId.value] = {
      ...a,
      departmentIds: v,
      departmentAssignments: newAssign
    };
  }
});

const canShowApproverForDepartment = (deptId) => {
  return isAssistantAdmin.value && assistantAdminPermissions.value?.canApproveExpenses === true;
};

const isApproverForDepartment = (deptId) => {
  const a = accessByAgency.value[selectedAgencyId.value];
  const assign = (a?.departmentAssignments ?? []).find((x) => x.departmentId === deptId);
  return assign?.isApprover === true;
};

const setApproverForDepartment = (deptId, value) => {
  const a = accessByAgency.value[selectedAgencyId.value] || {};
  let assign = a.departmentAssignments || [];
  const idx = assign.findIndex((x) => x.departmentId === deptId);
  if (idx >= 0) {
    assign = [...assign];
    assign[idx] = { ...assign[idx], isApprover: value };
  } else {
    assign = [...assign, { departmentId: deptId, isApprover: value }];
  }
  accessByAgency.value[selectedAgencyId.value] = { ...a, departmentAssignments: assign };
};

const assistantAdminPermissions = ref({});

function syncAssistantAdminPermissionsFromAccess() {
  const a = accessByAgency.value[selectedAgencyId.value];
  const base = a?.assistantAdminPermissions ?? {};
  assistantAdminPermissions.value = ASSISTANT_ADMIN_PERMISSION_OPTIONS.reduce((acc, p) => {
    acc[p.key] = base[p.key] === true;
    return acc;
  }, {});
}

function setAssistantAdminPermission(key, value) {
  assistantAdminPermissions.value[key] = value;
  if (!accessByAgency.value[selectedAgencyId.value]) {
    accessByAgency.value[selectedAgencyId.value] = {};
  }
  accessByAgency.value[selectedAgencyId.value].assistantAdminPermissions = { ...assistantAdminPermissions.value };
}

async function loadAccess() {
  if (!props.userId) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/users/${props.userId}/department-access`);
    const map = {};
    (data || []).forEach((a) => {
      map[String(a.agencyId)] = {
        hasDepartmentAccess: a.hasDepartmentAccess,
        departmentIds: a.departmentIds || [],
        departmentAssignments: a.departmentAssignments || a.departmentIds?.map((id) => ({ departmentId: id, isApprover: false })) || [],
        assistantAdminPermissions: a.assistantAdminPermissions || {}
      };
    });
    accessByAgency.value = map;
    syncAssistantAdminPermissionsFromAccess();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load department access';
  } finally {
    loading.value = false;
  }
}

async function loadDepartments() {
  if (!selectedAgencyId.value) return;
  departmentsLoading.value = true;
  try {
    const { data } = await api.get(`/agencies/${selectedAgencyId.value}/departments`);
    departments.value = data || [];
  } catch {
    departments.value = [];
  } finally {
    departmentsLoading.value = false;
  }
}

async function checkBudgetEnabled() {
  if (!selectedAgencyId.value) return;
  try {
    const { data } = await api.get('/budget/status', { params: { agencyId: selectedAgencyId.value } });
    budgetEnabled.value = data?.enabled ?? false;
  } catch {
    budgetEnabled.value = false;
  }
}

async function saveAccess() {
  if (!props.userId || !selectedAgencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    const a = accessByAgency.value[selectedAgencyId.value] || {};
    const deptAssign = a.departmentAssignments?.length
      ? a.departmentAssignments
      : (a.departmentIds || []).map((id) => ({ departmentId: id, isApprover: false }));
    await api.put(`/users/${props.userId}/department-access`, {
      agencyId: parseInt(selectedAgencyId.value, 10),
      hasDepartmentAccess: a.hasDepartmentAccess ?? false,
      departmentAssignments: deptAssign,
      assistantAdminPermissions: a.assistantAdminPermissions ?? {}
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

watch(() => props.userId, loadAccess, { immediate: true });
watch(selectedAgencyId, () => {
  loadDepartments();
  checkBudgetEnabled();
  syncAssistantAdminPermissionsFromAccess();
});
</script>
