<template>
  <section class="scope-panel" aria-label="Roster filters">
    <div class="scope-heading">
      <div><strong>Focus your roster</strong><p>Start with a tenant, then narrow down the people you need.</p></div>
      <span class="scope-badge">{{ selectedTenant?.name || 'Choose a tenant' }}</span>
    </div>
    <div class="scope-fields">
      <div class="scope-field">
        <label for="roster-tenant">1 · Tenant / agency</label>
        <input v-model="tenantSearch" type="search" aria-label="Search tenants" placeholder="Search tenants, e.g. ITSCO" />
        <select id="roster-tenant" :value="agencyId" @change="changeTenant($event.target.value)">
          <option value="">Choose a tenant…</option>
          <option v-for="tenant in matchingTenants" :key="tenant.id" :value="String(tenant.id)">{{ tenant.name }}</option>
        </select>
        <small v-if="!matchingTenants.length">No tenants match your search.</small>
      </div>
      <div class="scope-field">
        <label for="roster-status">2 · Status</label>
        <select id="roster-status" :value="statusFilter" @change="$emit('update:statusFilter', $event.target.value)">
          <option value="">All statuses (including archived)</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ getStatusLabel(status) }}</option>
        </select>
      </div>
      <div class="scope-field">
        <label for="roster-role">3 · Role</label>
        <select id="roster-role" :value="roleFilter" :disabled="persona === 'school_staff' || persona === 'guardians'" @change="$emit('update:roleFilter', $event.target.value)">
          <template v-if="persona === 'school_staff'"><option value="school_staff">School staff</option></template>
          <template v-else-if="persona === 'guardians'"><option value="client_guardian">Guardian</option></template>
          <template v-else>
            <option value="">All roles</option>
            <option v-for="role in roles" :key="role.value" :value="role.value">{{ role.label }}</option>
          </template>
        </select>
      </div>
      <div class="scope-field">
        <label for="roster-organization">4 · Affiliated organization</label>
        <input v-model="organizationSearch" type="search" aria-label="Search affiliated organizations" placeholder="Search schools, programs…" :disabled="!agencyId" />
        <select id="roster-organization" :value="organizationId" :disabled="!agencyId" @change="$emit('update:organizationId', $event.target.value)">
          <option value="">{{ agencyId ? 'All within this tenant' : 'Choose a tenant first' }}</option>
          <option v-for="org in matchingOrganizations" :key="org.id" :value="String(org.id)">{{ org.name }}</option>
        </select>
        <small>Optional · only organizations affiliated with this tenant.</small>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { VALID_EMPLOYEE_STATUSES, getStatusLabel } from '../../utils/statusUtils';

const props = defineProps({
  organizations: { type: Array, default: () => [] },
  agencyId: { type: [String, Number], default: '' },
  organizationId: { type: [String, Number], default: '' },
  statusFilter: { type: String, default: 'ACTIVE_EMPLOYEE' },
  roleFilter: { type: String, default: '' },
  persona: { type: String, default: 'employees' },
  roles: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:agencyId', 'update:organizationId', 'update:statusFilter', 'update:roleFilter']);
const tenantSearch = ref('');
const organizationSearch = ref('');
const statuses = ['ACTIVE_EMPLOYEE', 'INACTIVE_EMPLOYEE', 'PROSPECTIVE', ...VALID_EMPLOYEE_STATUSES.filter((s) => !['ACTIVE_EMPLOYEE', 'INACTIVE_EMPLOYEE', 'PROSPECTIVE'].includes(s))];
const tenants = computed(() => props.organizations.filter((org) => String(org.organization_type || 'agency').toLowerCase() === 'agency'));
const selectedTenant = computed(() => tenants.value.find((org) => String(org.id) === String(props.agencyId)));
const matches = (org, query) => `${org.name || ''} ${org.slug || ''} ${org.portal_url || ''}`.toLowerCase().includes(query.trim().toLowerCase());
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
const matchingTenants = computed(() => tenants.value.filter((org) => String(org.id) === String(props.agencyId) || matches(org, tenantSearch.value)).sort(byName));
const matchingOrganizations = computed(() => props.organizations.filter((org) =>
  props.agencyId && String(org.organization_type || 'agency').toLowerCase() !== 'agency' &&
  String(org.affiliated_agency_id || org.__affiliatedAgencyId || '') === String(props.agencyId) &&
  (String(org.id) === String(props.organizationId) || matches(org, organizationSearch.value))
).sort(byName));
function changeTenant(value) {
  organizationSearch.value = '';
  emit('update:organizationId', '');
  emit('update:agencyId', value);
}
</script>

<style scoped>
.scope-panel { padding: 18px; border: 1px solid var(--border, #dce5e4); border-radius: 16px; background: linear-gradient(120deg, color-mix(in srgb, var(--primary, #237566) 8%, var(--bg, #fff)), var(--bg, #fff)); }
.scope-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.scope-heading strong { font-size: 16px; color: var(--text-primary, #183d35); }
.scope-heading p { margin: 5px 0 0; font-size: 12px; color: var(--text-secondary, #526760); }
.scope-badge { border: 1px solid var(--border, #dce5e4); border-radius: 30px; padding: 6px 12px; font-size: 12px; font-weight: 700; background: var(--bg, #fff); color: var(--text-primary, #183d35); }
.scope-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.scope-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.scope-field label { font-size: 12px; font-weight: 750; color: var(--text-secondary, #526760); }
.scope-field input, .scope-field select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--border, #dce5e4); border-radius: 8px; padding: 10px; background: var(--bg, #fff); color: var(--text-primary, #183d35); font: inherit; font-size: 13px; }
.scope-field small { color: var(--text-secondary, #526760); font-size: 11px; }
.scope-field :disabled { opacity: .55; }
@media (max-width: 1100px) { .scope-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .scope-fields { grid-template-columns: minmax(0, 1fr); } .scope-heading { flex-direction: column; } }
</style>
