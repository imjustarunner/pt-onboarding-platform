<template>
  <div class="billing-management">
    <div class="section-header">
      <h2>Billing</h2>
      <p class="section-description">
        Transparent billing breakdown and QuickBooks integration.
      </p>
    </div>
    
    <div v-if="!currentAgencyId" class="placeholder-content">
      <div class="placeholder-icon">💳</div>
      <h3>Select an Agency</h3>
      <p>Choose an agency context to view billing details.</p>
      <div class="agency-picker" v-if="billingAgencies.length > 0">
        <input
          v-model="agencySearch"
          class="input"
          type="text"
          placeholder="Search agencies…"
        />
        <select v-model="selectedAgencyId" class="select">
          <option value="">Select an agency…</option>
          <option v-for="a in filteredBillingAgencies" :key="a.id" :value="String(a.id)">
            {{ a.name }} ({{ a.slug }})
          </option>
        </select>
        <button class="btn" :disabled="!selectedAgencyId" @click="applyAgencySelection">
          View Billing
        </button>
      </div>

      <div v-if="isSuperAdmin" class="card" style="margin-top: 16px; text-align: left;">
        <h3>Platform Default Pricing (Super Admin)</h3>
        <p class="muted">These defaults apply to all agencies unless overridden per agency.</p>

        <div v-if="pricingError" class="error">{{ pricingError }}</div>

        <div class="pricing-grid">
          <div class="form-group">
            <div class="label">Base Fee ($/month)</div>
            <input v-model.number="platformDraft.baseFeeDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Included Schools</div>
            <input v-model.number="platformDraft.includedSchools" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Programs</div>
            <input v-model.number="platformDraft.includedPrograms" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Admins</div>
            <input v-model.number="platformDraft.includedAdmins" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Active Candidates</div>
            <input v-model.number="platformDraft.includedActiveOnboardees" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Unit Cost: School ($/mo)</div>
            <input v-model.number="platformDraft.unitSchoolDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Program ($/mo)</div>
            <input v-model.number="platformDraft.unitProgramDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Admin ($/mo)</div>
            <input v-model.number="platformDraft.unitAdminDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Active Candidate ($/mo)</div>
            <input v-model.number="platformDraft.unitOnboardeeDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Phone Number ($/mo)</div>
            <input v-model.number="platformDraft.unitPhoneNumberDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">SMS Cost: Outbound to Clients ($/msg)</div>
            <input v-model.number="platformDraft.smsOutboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Inbound from Clients ($/msg)</div>
            <input v-model.number="platformDraft.smsInboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Notification SMS ($/msg)</div>
            <input v-model.number="platformDraft.smsNotificationDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Add-on: Public Availability ($/month)</div>
            <input v-model.number="platformDraft.publicAvailabilityAddonMonthlyDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
        </div>

        <div style="display:flex; gap: 10px; margin-top: 12px;">
          <button class="btn" type="button" @click="savePlatformPricing" :disabled="pricingLoading || pricingSaving">
            {{ pricingSaving ? 'Saving…' : 'Save platform pricing' }}
          </button>
          <button class="btn btn-secondary" type="button" @click="loadPlatformPricing" :disabled="pricingLoading || pricingSaving">
            {{ pricingLoading ? 'Loading…' : 'Reload' }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="content">
      <div v-if="banner" class="banner" :class="banner.kind">
        <strong>{{ banner.title }}</strong>
        <span>{{ banner.message }}</span>
      </div>

      <div v-if="isSuperAdmin" class="card">
        <h3>Pricing (Super Admin)</h3>
        <p class="muted">Set global defaults and optionally override pricing for this agency.</p>

        <div v-if="pricingError" class="error">{{ pricingError }}</div>

        <div class="inline" style="align-items: end; margin-bottom: 12px;">
          <div style="flex: 1;">
            <div class="label">Agency override enabled</div>
            <select v-model="agencyOverrideEnabled" class="select" :disabled="pricingLoading || pricingSaving">
              <option :value="false">No (use platform defaults)</option>
              <option :value="true">Yes (override for this agency)</option>
            </select>
          </div>
          <button class="btn btn-secondary" type="button" @click="loadAgencyPricing" :disabled="pricingLoading || pricingSaving">
            {{ pricingLoading ? 'Loading…' : 'Reload' }}
          </button>
        </div>

        <div class="pricing-grid">
          <div class="form-group">
            <div class="label">Base Fee ($/month)</div>
            <input v-model.number="agencyDraft.baseFeeDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Included Schools</div>
            <input v-model.number="agencyDraft.includedSchools" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Programs</div>
            <input v-model.number="agencyDraft.includedPrograms" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Admins</div>
            <input v-model.number="agencyDraft.includedAdmins" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Active Candidates</div>
            <input v-model.number="agencyDraft.includedActiveOnboardees" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Unit Cost: School ($/mo)</div>
            <input v-model.number="agencyDraft.unitSchoolDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Program ($/mo)</div>
            <input v-model.number="agencyDraft.unitProgramDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Admin ($/mo)</div>
            <input v-model.number="agencyDraft.unitAdminDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Active Candidate ($/mo)</div>
            <input v-model.number="agencyDraft.unitOnboardeeDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Phone Number ($/mo)</div>
            <input v-model.number="agencyDraft.unitPhoneNumberDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">SMS Cost: Outbound to Clients ($/msg)</div>
            <input v-model.number="agencyDraft.smsOutboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Inbound from Clients ($/msg)</div>
            <input v-model.number="agencyDraft.smsInboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Notification SMS ($/msg)</div>
            <input v-model.number="agencyDraft.smsNotificationDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Add-on: Public Availability</div>
            <select v-model="agencyDraft.publicAvailabilityAddonEnabled" class="select" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving">
              <option :value="false">Disabled</option>
              <option :value="true">Enabled (billed monthly)</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap: 10px; margin-top: 12px;">
          <button class="btn" type="button" @click="saveAgencyPricingOverride" :disabled="pricingLoading || pricingSaving">
            {{ pricingSaving ? 'Saving…' : (agencyOverrideEnabled ? 'Save agency override' : 'Clear agency override') }}
          </button>
        </div>
      </div>

      <div class="card">
        <h3>Current Plan Status</h3>
        <div class="status-grid">
          <div>
            <div class="label">Current Bill (Estimated)</div>
            <div class="big">{{ estimate ? money(estimate.totals.totalCents) : '—' }}</div>
          </div>
          <div>
            <div class="label">Billing Cycle</div>
            <div class="value">{{ estimate?.billingCycle?.label || '—' }}</div>
          </div>
          <div>
            <div class="label">QuickBooks</div>
            <div class="value">
              <span :class="['pill', qboStatus?.isConnected ? 'pill-on' : 'pill-off']">
                {{ qboStatus?.isConnected ? 'Connected' : 'Not connected' }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="estimateError" class="error">{{ estimateError }}</div>
      </div>

      <div class="card">
        <h3>Usage Breakdown</h3>
        <p class="muted">Only “Active Candidates” (users in ONBOARDING) count toward active onboardee billing.</p>

        <table class="table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Included</th>
              <th>Currently Used</th>
              <th>Overage</th>
              <th>Unit Cost</th>
              <th>Total Extra</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in breakdownRows" :key="row.key">
              <td>{{ row.label }}</td>
              <td>{{ row.included }}</td>
              <td>{{ row.used }}</td>
              <td>{{ row.overage }}</td>
              <td>{{ row.unitCost }}</td>
              <td>{{ row.extra }}</td>
            </tr>
            <tr class="base-row">
              <td>Platform Base</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>{{ estimate ? money(estimate.totals.baseFeeCents) : '—' }}</td>
              <td>{{ estimate ? money(estimate.totals.baseFeeCents) : '—' }}</td>
            </tr>
            <tr class="total-row">
              <td colspan="5"><strong>TOTAL</strong></td>
              <td><strong>{{ estimate ? money(estimate.totals.totalCents) : '—' }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Management</h3>
        <div class="manage-grid">
          <div>
            <div class="label">Billing Email</div>
            <div class="inline">
              <input v-model="billingEmail" class="input" type="email" placeholder="accounting@agency.com" />
              <button class="btn" :disabled="savingEmail" @click="saveBillingEmail">
                {{ savingEmail ? 'Saving…' : 'Update' }}
              </button>
            </div>
          </div>

          <div>
            <div class="label">QuickBooks Connection</div>
            <div class="inline">
              <button v-if="!qboStatus?.isConnected" class="btn" :disabled="connectingQbo" @click="connectQuickBooks">
                {{ connectingQbo ? 'Redirecting…' : 'Connect QuickBooks' }}
              </button>
              <button v-else class="btn btn-danger" :disabled="disconnectingQbo" @click="disconnectQuickBooks">
                {{ disconnectingQbo ? 'Disconnecting…' : 'Disconnect' }}
              </button>
            </div>
          </div>

          <div>
            <div class="label">Invoices</div>
            <div class="inline">
              <button class="btn" :disabled="generatingInvoice" @click="generateInvoice">
                {{ generatingInvoice ? 'Generating…' : 'Generate Invoice' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="manageError" class="error">{{ manageError }}</div>

        <div v-if="invoices.length === 0" class="empty">No invoices yet.</div>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Total</th>
              <th>Status</th>
              <th>QuickBooks Bill</th>
              <th style="width: 160px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in invoices" :key="inv.id">
              <td class="mono">{{ inv.period_start }} - {{ inv.period_end }}</td>
              <td>{{ money(inv.total_cents) }}</td>
              <td>
                <span :class="['pill', inv.status === 'sent' ? 'pill-on' : inv.status === 'failed' ? 'pill-bad' : 'pill-off']">
                  {{ inv.status }}
                </span>
              </td>
              <td class="mono">{{ inv.qbo_bill_id || '—' }}</td>
              <td class="actions">
                <button class="btn" @click="downloadPdf(inv.id)" :disabled="!inv.pdf_storage_path">
                  Download PDF
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Linked Schools (for billing)</h3>
        <p class="muted">
          These schools count toward your billing “Schools” usage. Link schools even before any clients exist.
        </p>

        <div class="row">
          <input
            v-model="schoolSearch"
            class="input"
            type="text"
            placeholder="Search schools by name or slug…"
            @input="debouncedLoadAvailableSchools"
          />
          <select v-model="selectedSchoolId" class="select">
            <option value="">Select a school…</option>
            <option v-for="s in availableSchools" :key="s.id" :value="String(s.id)">
              {{ s.name }} ({{ s.slug }})
            </option>
          </select>
          <button class="btn" :disabled="!selectedSchoolId || linking" @click="linkSelectedSchool">
            {{ linking ? 'Linking…' : 'Link School' }}
          </button>
        </div>

        <div v-if="error" class="error">{{ error }}</div>

        <div v-if="linkedSchools.length === 0" class="empty">
          No schools linked yet.
        </div>

        <table v-else class="table">
          <thead>
            <tr>
              <th>School</th>
              <th>Slug</th>
              <th>Status</th>
              <th style="width: 120px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in linkedSchools" :key="row.id">
              <td>{{ row.school_name }}</td>
              <td class="mono">{{ row.school_slug }}</td>
              <td>
                <span :class="['pill', row.is_active ? 'pill-on' : 'pill-off']">
                  {{ row.is_active ? 'Linked' : 'Unlinked' }}
                </span>
              </td>
              <td class="actions">
                <button class="btn btn-danger" :disabled="unlinkingId === row.school_organization_id" @click="unlink(row.school_organization_id)">
                  {{ unlinkingId === row.school_organization_id ? 'Unlinking…' : 'Unlink' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const agencySearch = ref('');
const selectedAgencyId = ref('');

const normalizeText = (v) => String(v || '').trim().toLowerCase();
const billingAgencies = computed(() => {
  const list = agencyStore.agencies || agencyStore.userAgencies || [];
  return [...list]
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => normalizeText(a?.name).localeCompare(normalizeText(b?.name)));
});

const filteredBillingAgencies = computed(() => {
  const q = normalizeText(agencySearch.value);
  if (!q) return billingAgencies.value;
  return billingAgencies.value.filter((a) => {
    const hay = `${normalizeText(a?.name)} ${normalizeText(a?.slug)} ${normalizeText(a?.portal_url)}`;
    return hay.includes(q);
  });
});

const applyAgencySelection = async () => {
  const id = parseInt(selectedAgencyId.value, 10);
  if (!id) return;
  const agency = billingAgencies.value.find((a) => a.id === id);
  if (!agency) return;
  agencyStore.setCurrentAgency(agency);
};

const applyAgencyFromQuery = () => {
  const raw = route.query.agencyId;
  const id = parseInt(String(raw || ''), 10);
  if (!id) return false;
  const agency = billingAgencies.value.find((a) => a.id === id);
  if (!agency) return false;
  selectedAgencyId.value = String(id);
  agencyStore.setCurrentAgency(agency);
  return true;
};

const estimate = ref(null);
const estimateError = ref('');
const qboStatus = ref(null);
const invoices = ref([]);
const billingEmail = ref('');
const manageError = ref('');

const savingEmail = ref(false);
const connectingQbo = ref(false);
const disconnectingQbo = ref(false);
const generatingInvoice = ref(false);

const banner = ref(null);

const pricingLoading = ref(false);
const pricingSaving = ref(false);
const pricingError = ref('');

const platformDraft = ref({
  baseFeeDollars: 0,
  includedSchools: 0,
  includedPrograms: 0,
  includedAdmins: 0,
  includedActiveOnboardees: 0,
  unitSchoolDollars: 0,
  unitProgramDollars: 0,
  unitAdminDollars: 0,
  unitOnboardeeDollars: 0,
  unitPhoneNumberDollars: 0,
  smsOutboundClientDollars: 0,
  smsInboundClientDollars: 0,
  smsNotificationDollars: 0,
  publicAvailabilityAddonMonthlyDollars: 0
});

const agencyOverrideEnabled = ref(false);
const agencyDraft = ref({
  baseFeeDollars: 0,
  includedSchools: 0,
  includedPrograms: 0,
  includedAdmins: 0,
  includedActiveOnboardees: 0,
  unitSchoolDollars: 0,
  unitProgramDollars: 0,
  unitAdminDollars: 0,
  unitOnboardeeDollars: 0,
  unitPhoneNumberDollars: 0,
  smsOutboundClientDollars: 0,
  smsInboundClientDollars: 0,
  smsNotificationDollars: 0,
  publicAvailabilityAddonEnabled: false
});

const linkedSchools = ref([]);
const availableSchools = ref([]);
const selectedSchoolId = ref('');
const schoolSearch = ref('');
const error = ref('');

const linking = ref(false);
const unlinkingId = ref(null);

const money = (cents) => {
  const v = Number(cents || 0) / 100;
  return `$${v.toFixed(2)}`;
};

const dollarsToCents = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

const setDraftFromPricing = (draftRef, pricing) => {
  const p = pricing || {};
  draftRef.value = {
    baseFeeDollars: Number(p.baseFeeCents || 0) / 100,
    includedSchools: Number(p.included?.schools || 0),
    includedPrograms: Number(p.included?.programs || 0),
    includedAdmins: Number(p.included?.admins || 0),
    includedActiveOnboardees: Number(p.included?.activeOnboardees || 0),
    unitSchoolDollars: Number(p.unitCents?.school || 0) / 100,
    unitProgramDollars: Number(p.unitCents?.program || 0) / 100,
    unitAdminDollars: Number(p.unitCents?.admin || 0) / 100,
    unitOnboardeeDollars: Number(p.unitCents?.onboardee || 0) / 100,
    unitPhoneNumberDollars: Number(p.unitCents?.phoneNumber || 0) / 100,
    smsOutboundClientDollars: Number(p.smsUnitCents?.outboundClient || 0) / 100,
    smsInboundClientDollars: Number(p.smsUnitCents?.inboundClient || 0) / 100,
    smsNotificationDollars: Number(p.smsUnitCents?.notification || 0) / 100,
    publicAvailabilityAddonMonthlyDollars: Number(p.addonsUnitCents?.publicAvailability || 0) / 100,
    publicAvailabilityAddonEnabled: Boolean(p.addonsEnabled?.publicAvailability)
  };
};

const buildPricingPayloadFromDraft = (draft) => {
  const d = draft || {};
  return {
    baseFeeCents: dollarsToCents(d.baseFeeDollars),
    included: {
      schools: Math.max(0, parseInt(d.includedSchools || 0, 10) || 0),
      programs: Math.max(0, parseInt(d.includedPrograms || 0, 10) || 0),
      admins: Math.max(0, parseInt(d.includedAdmins || 0, 10) || 0),
      activeOnboardees: Math.max(0, parseInt(d.includedActiveOnboardees || 0, 10) || 0)
    },
    unitCents: {
      school: dollarsToCents(d.unitSchoolDollars),
      program: dollarsToCents(d.unitProgramDollars),
      admin: dollarsToCents(d.unitAdminDollars),
      onboardee: dollarsToCents(d.unitOnboardeeDollars),
      phoneNumber: dollarsToCents(d.unitPhoneNumberDollars)
    },
    smsUnitCents: {
      inboundClient: dollarsToCents(d.smsInboundClientDollars),
      outboundClient: dollarsToCents(d.smsOutboundClientDollars),
      notification: dollarsToCents(d.smsNotificationDollars)
    },
    addonsUnitCents: {
      publicAvailability: dollarsToCents(d.publicAvailabilityAddonMonthlyDollars)
    },
    addonsEnabled: {
      publicAvailability: Boolean(d.publicAvailabilityAddonEnabled)
    }
  };
};

const breakdownRows = computed(() => {
  const items = estimate.value?.lineItems || [];
  return items.map(it => ({
    key: it.key,
    label: it.label,
    included: it.included,
    used: it.used,
    overage: it.overage,
    unitCost: `$${(Number(it.unitCostCents || 0) / 100).toFixed(2)}`,
    extra: money(it.extraCents)
  }));
});

let searchTimer = null;
const debouncedLoadAvailableSchools = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadAvailableSchools(), 250);
};

const loadEstimate = async () => {
  estimateError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/estimate`);
    estimate.value = res.data;
  } catch (e) {
    estimateError.value = e?.response?.data?.error?.message || 'Failed to load billing estimate';
  }
};

const loadPlatformPricing = async () => {
  if (!isSuperAdmin.value) return;
  pricingError.value = '';
  pricingLoading.value = true;
  try {
    const res = await api.get('/billing/pricing/default');
    setDraftFromPricing(platformDraft, res.data?.pricing || null);
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to load platform pricing';
  } finally {
    pricingLoading.value = false;
  }
};

const savePlatformPricing = async () => {
  if (!isSuperAdmin.value) return;
  pricingError.value = '';
  pricingSaving.value = true;
  try {
    await api.put('/billing/pricing/default', { pricing: buildPricingPayloadFromDraft(platformDraft.value) });
    await loadPlatformPricing();
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to save platform pricing';
  } finally {
    pricingSaving.value = false;
  }
};

const loadAgencyPricing = async () => {
  pricingError.value = '';
  if (!currentAgencyId.value) return;
  pricingLoading.value = true;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/pricing`);
    const override = res.data?.pricingOverride ?? null;
    agencyOverrideEnabled.value = override != null;
    setDraftFromPricing(agencyDraft, (override != null ? override : res.data?.platformPricing) || null);
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to load agency pricing';
  } finally {
    pricingLoading.value = false;
  }
};

const saveAgencyPricingOverride = async () => {
  if (!isSuperAdmin.value) return;
  pricingError.value = '';
  if (!currentAgencyId.value) return;
  pricingSaving.value = true;
  try {
    // If the add-on is being enabled, we must persist an override payload (billing gate).
    if (agencyDraft.value?.publicAvailabilityAddonEnabled && !agencyOverrideEnabled.value) {
      agencyOverrideEnabled.value = true;
    }
    const payload = agencyOverrideEnabled.value ? buildPricingPayloadFromDraft(agencyDraft.value) : null;
    await api.put(`/billing/${currentAgencyId.value}/pricing`, { pricing: payload });
    await Promise.all([loadAgencyPricing(), loadEstimate()]);
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to save agency pricing override';
  } finally {
    pricingSaving.value = false;
  }
};

const loadQboStatus = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/quickbooks/status`);
    qboStatus.value = res.data;
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load QuickBooks status';
  }
};

const loadSettings = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/settings`);
    billingEmail.value = res.data?.billingEmail || '';
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load billing settings';
  }
};

const saveBillingEmail = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  savingEmail.value = true;
  try {
    await api.put(`/billing/${currentAgencyId.value}/settings`, { billingEmail: billingEmail.value || null });
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to update billing email';
  } finally {
    savingEmail.value = false;
  }
};

const connectQuickBooks = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  connectingQbo.value = true;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/quickbooks/connect`);
    const authUrl = res.data?.authUrl;
    if (!authUrl) throw new Error('Missing QuickBooks authUrl');
    window.location.href = authUrl;
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || e?.message || 'Failed to start QuickBooks connection';
    connectingQbo.value = false;
  }
};

const disconnectQuickBooks = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  disconnectingQbo.value = true;
  try {
    await api.post(`/billing/${currentAgencyId.value}/quickbooks/disconnect`);
    await loadQboStatus();
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to disconnect QuickBooks';
  } finally {
    disconnectingQbo.value = false;
  }
};

const loadInvoices = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/invoices`);
    invoices.value = res.data || [];
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load invoices';
  }
};

const generateInvoice = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  generatingInvoice.value = true;
  try {
    await api.post(`/billing/${currentAgencyId.value}/invoices/generate`);
    await Promise.all([loadInvoices(), loadEstimate()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to generate invoice';
  } finally {
    generatingInvoice.value = false;
  }
};

const downloadPdf = (invoiceId) => {
  const url = `${api.defaults.baseURL}/billing/invoices/${invoiceId}/pdf`;
  window.open(url, '_blank');
};

const loadLinkedSchools = async () => {
  error.value = '';
  if (!currentAgencyId.value) return;
  const res = await api.get(`/agencies/${currentAgencyId.value}/schools`, { params: { includeInactive: true } });
  linkedSchools.value = res.data || [];
};

const loadAvailableSchools = async () => {
  error.value = '';
  const params = {};
  if (schoolSearch.value && schoolSearch.value.trim()) params.search = schoolSearch.value.trim();
  const res = await api.get('/agencies/schools', { params });
  availableSchools.value = res.data || [];
};

const linkSelectedSchool = async () => {
  if (!currentAgencyId.value || !selectedSchoolId.value) return;
  error.value = '';
  linking.value = true;
  try {
    await api.post(`/agencies/${currentAgencyId.value}/schools`, {
      schoolOrganizationId: parseInt(selectedSchoolId.value, 10),
      isActive: true
    });
    selectedSchoolId.value = '';
    await loadLinkedSchools();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to link school';
  } finally {
    linking.value = false;
  }
};

const unlink = async (schoolOrganizationId) => {
  if (!currentAgencyId.value) return;
  error.value = '';
  unlinkingId.value = schoolOrganizationId;
  try {
    await api.delete(`/agencies/${currentAgencyId.value}/schools/${schoolOrganizationId}`);
    await loadLinkedSchools();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to unlink school';
  } finally {
    unlinkingId.value = null;
  }
};

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    if (authStore.user?.role === 'super_admin') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }
  }

  if (isSuperAdmin.value) {
    await loadPlatformPricing();
  }

  // Deep-link support (e.g. from admin billing overage acknowledgement)
  applyAgencyFromQuery();

  const qboParam = String(route.query.qbo || '');
  if (qboParam === 'connected') {
    banner.value = { kind: 'success', title: 'QuickBooks connected.', message: 'Your agency is now connected to QuickBooks Online.' };
  } else if (qboParam === 'error') {
    banner.value = { kind: 'error', title: 'QuickBooks connection failed.', message: 'Please try again or contact support.' };
  }

  await Promise.all([
    loadEstimate(),
    loadAgencyPricing(),
    loadQboStatus(),
    loadSettings(),
    loadInvoices(),
    loadAvailableSchools(),
    loadLinkedSchools()
  ]);
});

watch(billingAgencies, () => {
  if (!currentAgencyId.value) applyAgencyFromQuery();
});

watch(currentAgencyId, async (newId, oldId) => {
  if (!newId || newId === oldId) return;
  await Promise.all([
    loadEstimate(),
    loadAgencyPricing(),
    loadQboStatus(),
    loadSettings(),
    loadInvoices(),
    loadAvailableSchools(),
    loadLinkedSchools()
  ]);
});
</script>

<style scoped>
.billing-management {
  width: 100%;
}

.section-header {
  margin-bottom: 32px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.section-description {
  color: var(--text-secondary);
  margin: 0;
}

.placeholder-content {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-alt);
  border-radius: 12px;
  border: 2px dashed var(--border);
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.placeholder-content h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.placeholder-content p {
  margin: 8px 0;
  color: var(--text-secondary);
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.agency-picker {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr 280px 140px;
  gap: 10px;
  align-items: center;
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
}

@media (max-width: 900px) {
  .agency-picker {
    grid-template-columns: 1fr;
  }
}

.placeholder-note {
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.8;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.banner {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
}

.banner.success {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.12);
}

.banner.error {
  border-color: rgba(220, 38, 38, 0.35);
  background: rgba(220, 38, 38, 0.12);
}

.card {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.card h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.muted {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  align-items: end;
}

.label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.big {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.value {
  font-size: 14px;
  color: var(--text-primary);
}

.manage-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-top: 8px;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (max-width: 1100px) {
  .pricing-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 700px) {
  .pricing-grid {
    grid-template-columns: 1fr;
  }
}

.inline {
  display: flex;
  gap: 10px;
  align-items: center;
}

.row {
  display: grid;
  grid-template-columns: 1fr 280px 140px;
  gap: 10px;
  align-items: center;
  margin: 12px 0 16px 0;
}

.input,
.select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-primary);
}

.btn {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--primary);
  color: white;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.btn-danger {
  background: transparent;
  color: var(--danger, #dc2626);
  border-color: var(--danger, #dc2626);
}

.error {
  margin: 8px 0 0 0;
  color: var(--danger, #dc2626);
}

.empty {
  padding: 10px 0;
  color: var(--text-secondary);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  color: var(--text-primary);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--text-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.pill {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border);
}

.pill-on {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: var(--text-primary);
}

.pill-off {
  background: rgba(107, 114, 128, 0.12);
  border-color: rgba(107, 114, 128, 0.35);
  color: var(--text-secondary);
}

.pill-bad {
  background: rgba(220, 38, 38, 0.12);
  border-color: rgba(220, 38, 38, 0.35);
  color: var(--text-primary);
}

.base-row td {
  padding-top: 14px;
}

.total-row td {
  border-bottom: none;
  padding-top: 14px;
}
</style>
