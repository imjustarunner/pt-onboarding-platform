<template>
  <section class="fee-schedule" aria-label="Billing fee schedules">
    <header class="fee-heading">
      <div>
        <p class="eyebrow">{{ agencyName || 'Practice' }}</p>
        <h2>Fee schedules</h2>
        <p>Set billed charges by service, payer and provider. Each rate shows where it comes from.</p>
      </div>
      <a v-if="serviceCodesPath" class="button secondary" :href="serviceCodesPath">Manage service codes</a>
      <button v-else class="button secondary" type="button" @click="emit('manage-service-codes')">Manage service codes</button>
    </header>

    <div class="mode-tabs" role="tablist" aria-label="Fee schedule type">
      <button v-for="option in modes" :key="option.value" type="button" role="tab"
        :aria-selected="mode === option.value" :class="{ active: mode === option.value }"
        :disabled="busy || hasUnsavedChanges" @click="setMode(option.value)">{{ option.label }}</button>
    </div>

    <div class="schedule-context">
      <label>Rates to manage
        <select aria-label="Rates to manage" :value="scope" :disabled="busy || hasUnsavedChanges" @change="setScope($event.target.value)">
          <option v-if="overview.canManagePlatform" value="platform">Platform defaults</option>
          <option value="practice">Practice defaults</option>
          <option v-if="mode === 'insurance'" value="payer">Payer rates</option>
          <option v-if="mode === 'insurance'" value="credential">HCBS credential modifiers</option>
          <option v-else value="category">Provider category rates</option>
          <option value="provider">Provider rates</option>
        </select>
      </label>
      <label v-if="mode === 'insurance' && ['payer', 'provider'].includes(scope)">Payer
        <select aria-label="Payer" :value="payerId" :disabled="busy || hasUnsavedChanges" @change="setPayer($event.target.value)">
          <option value="">Select a payer</option>
          <option v-for="payer in overview.payers" :key="payer.id" :value="String(payer.id)">{{ payer.name }}</option>
        </select>
      </label>
      <label v-if="mode === 'insurance' && scope === 'credential'">HCBS category
        <select v-model="credentialKey" aria-label="HCBS credential category" :disabled="busy || hasUnsavedChanges">
          <option value="">Select a category</option>
          <option v-for="category in overview.credentialScopes || []" :key="category.key" :value="category.key">{{ category.label }}</option>
        </select>
      </label>
      <label v-if="mode === 'self_pay' && scope === 'category'">Provider category
        <select v-model="categoryKey" aria-label="Provider category" :disabled="busy || hasUnsavedChanges">
          <option value="">Select a category</option>
          <option v-for="category in overview.categories" :key="category.key" :value="category.key">{{ category.label }}</option>
        </select>
      </label>
      <label v-if="scope === 'provider'">{{ mode === 'insurance' ? 'Credentialed billing provider' : 'Provider' }}
        <select v-model="providerUserId" :aria-label="mode === 'insurance' ? 'Credentialed billing provider' : 'Provider'" :disabled="busy || hasUnsavedChanges || (mode === 'insurance' && !payerId)">
          <option value="">Select a provider</option>
          <option v-for="provider in selectableProviders" :key="provider.id" :value="String(provider.id)">{{ provider.name }}</option>
        </select>
      </label>
    </div>

    <template v-if="mode === 'insurance' && payerId && overview.canViewCredentialingDocuments">
      <CredentialingOperationsPanel v-for="payer in (overview.credentialingDocumentPayers || []).filter(p => p.payerId === payerId)" :key="`${agencyId}:${payer.definitionId}`" :agency-id="Number(agencyId)" kind="payer" :record-id="Number(payer.definitionId)" documents-only read-only />
    </template>
    <p class="inheritance" data-testid="rate-inheritance">
      <span>Platform default</span><span aria-hidden="true">→</span><span>Practice default</span><span aria-hidden="true">→</span>
      <span v-if="mode === 'insurance'">HCBS category</span><span v-if="mode === 'insurance'" aria-hidden="true">→</span>
      <span>{{ mode === 'insurance' ? 'Payer rate' : 'Provider category rate' }}</span><span aria-hidden="true">→</span><span>Provider rate</span>
    </p>
    <p v-if="mode === 'self_pay'" class="context-help">Self-pay rates use the provider’s category unless an individual override is saved. Existing appointment quotes retain their saved rate.</p>
    <p v-else class="context-help">These are billed charges; payer reimbursement may differ. Existing claims keep their recorded charges.</p>
    <p v-if="mode === 'insurance' && scope === 'provider'" class="context-help">Only fully licensed billing providers credentialed with the selected payer are available.</p>
    <p v-if="scope === 'platform'" class="message warning">You are editing platform defaults for all practices that inherit them. Saved practice, payer, category and provider overrides continue to apply.</p>
    <div v-if="mode === 'insurance' && scope !== 'platform' && !overview.readOnly" class="payer-catalog-actions">
      <button class="text-button" type="button" :disabled="busy || hasUnsavedChanges" @click="previewPayerSync">Sync verified payer catalog</button>
      <a v-if="overview.credentialingPath" :href="overview.credentialingPath">Manage payer credentialing</a>
    </div>
    <p v-if="syncError" role="alert" class="message error">{{ syncError }}</p>
    <p v-if="syncNotice" role="status" class="message success">{{ syncNotice }}</p>
    <section v-if="syncPlan" class="payer-sync-review" aria-label="Review payer catalog sync">
      <h3>Review payer catalog sync</h3>
      <p>{{ syncCounts.link }} existing {{ syncCounts.link === 1 ? 'definition' : 'definitions' }} to link · {{ syncCounts.create }} new {{ syncCounts.create === 1 ? 'definition' : 'definitions' }} · {{ syncPlan.conflicts.length }} needing manual review</p>
      <ul v-if="syncPlan.operations.length">
        <li v-for="operation in syncPlan.operations" :key="operation.payerId"><strong>{{ operation.name || operation.payerId }}</strong> <span>({{ operation.payerId }}) · {{ operation.action === 'link_existing' ? 'Link existing credentialing definition' : 'Create credentialing definition' }}</span></li>
      </ul>
      <p v-else>The verified payer catalog has no automatic changes to apply.</p>
      <ul v-if="syncPlan.conflicts.length" class="sync-conflicts">
        <li v-for="conflict in syncPlan.conflicts" :key="conflict.payerId"><strong>{{ conflict.payerId }}</strong> · {{ conflict.reason }}<span v-if="conflict.definitionIds?.length"> Definitions {{ conflict.definitionIds.join(', ') }}.</span></li>
      </ul>
      <p v-if="syncPlan.conflicts.length">Resolve these matches in <a v-if="overview.credentialingPath" :href="overview.credentialingPath">payer credentialing</a><span v-else>payer credentialing</span>. Only the listed verified links will be applied.</p>
      <p class="context-help">This connects payer definitions. Provider credentialing status still requires its own verification.</p>
      <div class="sync-buttons">
        <button v-if="syncPlan.operations.length" class="button primary" type="button" :disabled="busy || !syncPlan.planToken" @click="applyPayerSync">Apply {{ syncPlan.operations.length }} verified {{ syncPlan.operations.length === 1 ? 'link' : 'links' }}</button>
        <button class="button secondary" type="button" :disabled="busy" @click="syncPlan = null">Close review</button>
      </div>
    </section>

    <p v-if="error" role="alert" class="message error">{{ error }}</p>
    <div v-if="reloadNeeded" class="reload-notice"><p>The saved schedule changed. Reload current rates before saving again.</p><button class="button secondary" type="button" :disabled="busy" @click="load">Reload current rates</button></div>
    <p v-if="notice" role="status" class="message success">{{ notice }}</p>
    <p v-for="(warning, index) in overview.warnings" :key="index" class="message warning">{{ typeof warning === 'string' ? warning : warning.message }}</p>
    <p v-if="overview.unlinkedCredentialCount && overview.credentialingPath" class="context-help"><a :href="overview.credentialingPath">Review {{ overview.unlinkedCredentialCount }} unlinked credentialing {{ overview.unlinkedCredentialCount === 1 ? 'record' : 'records' }}</a> to connect provider insurance acceptance to the practice payer list.</p>
    <p v-if="hasUnsavedChanges" class="draft-notice">You have unsaved rate edits. Save each changed rate or <button type="button" class="text-button" :disabled="busy" @click="discardEdits">discard unsaved edits</button> before switching schedules.</p>
    <p v-if="loading" role="status" class="empty-state">Loading fee schedule…</p>
    <p v-else-if="!agencyId" class="empty-state">Choose a practice to manage its fee schedules.</p>
    <p v-else-if="!scopeReady" class="empty-state">{{ selectionHelp }}</p>
    <template v-else-if="loaded">
      <div class="schedule-toolbar">
        <label class="search-label">Find a service
          <input v-model="search" aria-label="Find a service" type="search" placeholder="Service code or description" />
        </label>
        <label v-if="!overview.readOnly" class="reason-label">Change note <span class="optional-label">(optional)</span>
          <input v-model="reason" aria-label="Reason for changes" maxlength="1000" placeholder="For example, annual fee update" :disabled="busy" />
        </label>
        <label class="checkbox-label"><input v-model="showHidden" type="checkbox" /> Show hidden services</label>
        <button v-if="scope === 'practice' && !overview.readOnly" class="button secondary" type="button" title="Save platform defaults only where the practice has no saved rate. Existing custom rates are retained." :disabled="busy || hasUnsavedChanges" @click="usePlatformDefaults">Fill missing practice rates</button>
      </div>
      <p v-if="overview.readOnly" class="message warning">You can view these rates. Billing settings access is required to change them.</p>
      <div v-if="visibleRows.length" class="rate-table-wrap">
        <table class="rate-table">
          <thead><tr><th scope="col">Service</th><th scope="col">Current rate</th><th scope="col">{{ editLabel }}</th><th v-if="mode === 'insurance'" scope="col">Default modifiers</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.serviceCode" :class="{ 'hidden-service': row.isHidden }" :data-service-code="row.serviceCode">
              <th scope="row" class="service-cell">
                <strong>{{ row.serviceCode }}<span v-if="row.isAddon" class="small-badge">Add-on</span><span v-if="row.isHidden" class="small-badge">Hidden</span></strong>
                <span>{{ row.description || 'Service description not set' }}</span>
                <small>{{ unitLabel(row) }}</small>
              </th>
              <td data-label="Current rate" class="current-rate">
                <strong>{{ money(row.rateCents) }}</strong>
                <span class="source-badge" :class="{ inherited: !isCustom(row) }">{{ row.sourceLabel || sourceLabel(row.source) }}</span>
                <small v-if="row.customRateCents != null">Default: {{ money(row.inheritedRateCents) }} · {{ sourceLabel(row.inheritedSource) }}<template v-if="mode === 'self_pay'"> · {{ row.inheritedRateUnit === 'hour' ? 'per hour' : 'per session' }}</template></small>
              </td>
              <td :data-label="editLabel">
                <label class="rate-input"><span aria-hidden="true">$</span><input
                  v-model="drafts[row.serviceCode]" type="text" inputmode="decimal" autocomplete="off"
                  :aria-label="`${row.serviceCode} ${editLabel.toLowerCase()} in dollars`"
                  :disabled="busy || overview.readOnly" placeholder="Not set" />
                </label>
                <select v-if="mode === 'self_pay'" v-model="unitDrafts[row.serviceCode]" class="rate-unit-select"
                  :aria-label="`${row.serviceCode} self-pay rate basis`" :disabled="busy || overview.readOnly">
                  <option value="session">Per session</option><option value="hour">Per hour</option>
                </select>
                <small v-if="isDirty(row)" class="unsaved">Unsaved change</small>
              </td>
              <td v-if="mode === 'insurance'" data-label="Default modifiers">
                <strong>{{ (row.modifiers || []).join(', ') || 'None' }}</strong>
                <span class="source-badge" :class="{ inherited: !row.modifierCustom }">{{ row.modifierSourceLabel || 'No default set' }}</span>
                <label class="rate-input"><input v-model="modifierDrafts[row.serviceCode]" type="text" :aria-label="`${row.serviceCode} default modifiers`" :disabled="busy || overview.readOnly" placeholder="U9 or NONE" /></label>
                <button v-if="!overview.readOnly" class="text-button" type="button" :disabled="busy || reloadNeeded" @click="saveModifiers(row)">Save modifiers</button>
              </td>
              <td data-label="Actions" class="action-cell">
                <template v-if="!overview.readOnly">
                  <button class="button primary" type="button" :disabled="busy || reloadNeeded" @click="saveRate(row, 'set')">{{ saveLabel }}</button>
                  <button v-if="row.customRateCents != null" class="text-button" type="button" :disabled="busy || reloadNeeded" @click="saveRate(row, 'reset')">Use {{ inheritedLabel(row) }}</button>
                  <button v-if="!['practice', 'platform'].includes(scope)" class="text-button" type="button" :disabled="busy || reloadNeeded" @click="saveRate(row, 'update_practice_default')">Update practice default</button>
                  <button v-if="scope === 'practice'" class="text-button visibility-button" type="button" :disabled="busy || reloadNeeded || hasUnsavedChanges" @click="setVisibility(row)">{{ row.isHidden ? 'Show in fee schedules' : 'Hide from fee schedules' }}</button>
                </template>
                <span v-else>View only</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty-state">{{ search ? 'No services match this search.' : 'No visible services in this schedule. Show hidden services or manage the practice’s service codes.' }}</p>
      <p class="context-help">Hiding a fee row changes this list. Activate, deactivate, add services, or edit billing units in <a v-if="serviceCodesPath" :href="serviceCodesPath">Service codes</a><button v-else type="button" class="text-button" @click="emit('manage-service-codes')">Service codes</button>.</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch, inject } from 'vue';
import defaultBillingApi from '../../services/api';
const api = inject('billingTransport', defaultBillingApi);
import CredentialingOperationsPanel from '../admin/CredentialingOperationsPanel.vue';

const props = defineProps({
  agencyId: { type: [Number, String], default: 0 },
  agencyName: { type: String, default: '' },
  serviceCodesPath: { type: String, default: '' },
  initialMode: { type: String, default: 'insurance' },
  initialScope: { type: String, default: '' },
  initialProviderId: { type: [Number, String], default: 0 },
  initialPayerId: { type: [Number, String], default: '' },
  initialCategoryKey: { type: String, default: '' }
});
const emit = defineEmits(['updated', 'context-change', 'manage-service-codes']);
const endpoint = '/medical-billing/fee-schedule/canonical';
const modes = [{ value: 'insurance', label: 'Insurance fees' }, { value: 'self_pay', label: 'Self-pay fees' }];
const initialContext = () => ({
  mode: props.initialMode === 'self_pay' ? 'self_pay' : 'insurance',
  scope: ['practice', 'platform', 'payer', 'provider', 'category', 'credential'].includes(props.initialScope) ? props.initialScope
    : Number(props.initialProviderId) > 0 ? 'provider' : props.initialCategoryKey ? 'category' : props.initialPayerId ? 'payer' : 'practice',
  payerId: String(props.initialPayerId || ''), providerUserId: Number(props.initialProviderId) > 0 ? String(props.initialProviderId) : '', categoryKey: props.initialCategoryKey || ''
});
const startingContext = initialContext();
const mode = ref(startingContext.mode);
const scope = ref(startingContext.scope), payerId = ref(startingContext.payerId), providerUserId = ref(startingContext.providerUserId), categoryKey = ref(startingContext.categoryKey), credentialKey = ref('');
const emptyOverview = () => ({ payers: [], providers: [], categories: [], credentialScopes: [], rows: [], warnings: [], revision: 0, readOnly: true });
const overview = ref(emptyOverview()), drafts = ref({}), unitDrafts = ref({}), modifierDrafts = ref({}), search = ref(''), showHidden = ref(false), reason = ref('');
const loading = ref(false), saving = ref(false), syncing = ref(false), loaded = ref(false), error = ref(''), notice = ref(''), reloadNeeded = ref(false);
const syncPlan = ref(null), syncError = ref(''), syncNotice = ref('');
const syncCounts = computed(() => ({ link: syncPlan.value?.operations.filter(row => row.action === 'link_existing').length || 0, create: syncPlan.value?.operations.filter(row => row.action === 'create_definition').length || 0 }));
const busy = computed(() => loading.value || saving.value || syncing.value);
let requestGeneration = 0;
let metadataLoaded = false;
const money = value => value == null ? 'Not set' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) / 100);
const dollars = value => value == null ? '' : (Number(value) / 100).toFixed(2);
const sourceLabel = source => ({ platform: 'Platform default', platform_starter: 'Platform starter default', practice: 'Practice default', legacy_practice: 'Saved practice rate', payer: 'Payer rate', legacy_payer: 'Saved payer rate', category: 'Provider category rate', credential: 'HCBS credential category', provider: 'Provider rate', legacy_provider: 'Saved provider rate', legacy_catalog: 'Saved service rate', unset: 'No default set' })[source] || 'No default set';
const isCustom = row => row.customRateCents != null;
const inheritedLabel = row => ({ platform: 'platform default', platform_starter: 'platform default', practice: 'practice default', legacy_practice: 'practice default', payer: 'payer rate', legacy_payer: 'payer rate', category: 'category rate', legacy_catalog: 'saved service rate' })[row.inheritedSource] || 'inherited rate';
const editLabel = computed(() => ({ platform: 'Platform rate', practice: 'Practice rate', payer: 'Payer rate', category: 'Category rate', credential: 'HCBS modifiers', provider: 'Provider rate' })[scope.value]);
const saveLabel = computed(() => `Save ${editLabel.value.toLowerCase()}`);
const scopeReady = computed(() => ['practice', 'platform'].includes(scope.value) || (scope.value === 'payer' && !!payerId.value) || (scope.value === 'category' && !!categoryKey.value) || (scope.value === 'credential' && !!credentialKey.value) || (scope.value === 'provider' && !!providerUserId.value && (mode.value === 'self_pay' || !!payerId.value)));
const selectableProviders = computed(() => overview.value.providers.filter(provider => mode.value === 'self_pay' || (provider.eligiblePayerIds || []).some(id => String(id) === String(payerId.value))));
const selectionHelp = computed(() => {
  if (scope.value === 'credential') return 'Select an HCBS category to set modifiers for unlicensed, prelicensed, or licensed providers.';
  if (scope.value === 'category') return 'Select a provider category to view its self-pay rates.';
  if (scope.value === 'payer') return 'Select a payer to view its rates and practice defaults.';
  if (mode.value === 'insurance' && !payerId.value) return 'Select a payer, then a fully licensed provider credentialed with that payer.';
  if (mode.value === 'insurance' && payerId.value && !selectableProviders.value.length) return 'No fully licensed billing providers are currently credentialed with this payer. Review the practice’s payer credentialing.';
  return 'Select a provider to view their rates and inherited defaults.';
});
const effectiveUnit = row => row.rateUnit || (mode.value === 'self_pay' ? 'session' : 'unit');
const isDirty = row => String(drafts.value[row.serviceCode] ?? '') !== dollars(row.rateCents) || unitDrafts.value[row.serviceCode] !== effectiveUnit(row);
const hasUnsavedChanges = computed(() => overview.value.rows.some(isDirty));
const visibleRows = computed(() => {
  const query = search.value.trim().toLowerCase();
  return overview.value.rows.filter(row => (showHidden.value || !row.isHidden) && (!query || `${row.serviceCode} ${row.description || ''}`.toLowerCase().includes(query)));
});
function unitLabel(row) {
  if (mode.value === 'self_pay') return row.rateUnit === 'hour' ? 'Per hour · prorated to booked duration' : 'Per session';
  if (Number(row.unitMinutes) > 0 && row.unitCalcMode !== 'SINGLE') return `Per ${Number(row.unitMinutes)}-minute billable unit`;
  return row.unitCalcMode === 'SINGLE' ? 'Per service' : 'Per billable unit';
}
function context() {
  return { agencyId: Number(props.agencyId), mode: mode.value, scope: scope.value,
    ...(payerId.value && mode.value === 'insurance' && ['payer', 'provider'].includes(scope.value) ? { payerId: payerId.value } : {}),
    ...(providerUserId.value && scope.value === 'provider' ? { providerUserId: Number(providerUserId.value) } : {}),
    ...(categoryKey.value && scope.value === 'category' ? { categoryKey: categoryKey.value } : {}),
    ...(credentialKey.value && scope.value === 'credential' ? { credentialKey: credentialKey.value } : {}) };
}
function apply(data, savedCode = null) {
  metadataLoaded = true;
  const oldDrafts = drafts.value;
  const oldUnits = unitDrafts.value;
  const keep = new Set(savedCode ? overview.value.rows.filter(row => row.serviceCode !== savedCode && isDirty(row)).map(row => row.serviceCode) : []);
  overview.value = { ...emptyOverview(), ...data, payers: data.payers || [], providers: data.providers || [], categories: data.categories || [], rows: data.rows || [], warnings: data.warnings || [] };
  drafts.value = Object.fromEntries(overview.value.rows.map(row => [row.serviceCode, keep.has(row.serviceCode) ? oldDrafts[row.serviceCode] : dollars(row.rateCents)]));
  modifierDrafts.value = Object.fromEntries(overview.value.rows.map(row => [row.serviceCode, (row.modifiers || []).join(', ')]));
  unitDrafts.value = Object.fromEntries(overview.value.rows.map(row => [row.serviceCode, keep.has(row.serviceCode) ? oldUnits[row.serviceCode] : effectiveUnit(row)]));
  loaded.value = true;
}
async function load() {
  const generation = ++requestGeneration;
  loaded.value = false; loading.value = false; error.value = ''; notice.value = ''; reloadNeeded.value = false;
  syncPlan.value = null; syncError.value = ''; syncNotice.value = ''; syncing.value = false;
  overview.value = { ...overview.value, rows: [] }; drafts.value = {}; unitDrafts.value = {};
  if (!Number(props.agencyId) || (!scopeReady.value && metadataLoaded)) return;
  loading.value = true;
  try {
    const metadataOnly = !scopeReady.value;
    const requestedContext = metadataOnly ? { agencyId: Number(props.agencyId), mode: mode.value, scope: 'practice' } : context();
    const { data } = await api.get(endpoint, { params: { ...requestedContext, includeHidden: 1 } });
    if (generation === requestGeneration) {
      apply(metadataOnly ? { ...data, rows: [] } : data);
      if (metadataOnly) loaded.value = false;
    }
  } catch (e) { if (generation === requestGeneration) error.value = e.response?.data?.error?.message || 'Unable to load this fee schedule.'; }
  finally { if (generation === requestGeneration) loading.value = false; }
}
function setMode(value) { mode.value = value; scope.value = 'practice'; payerId.value = ''; providerUserId.value = ''; categoryKey.value = ''; credentialKey.value = ''; reason.value = ''; }
function setScope(value) { scope.value = value; providerUserId.value = ''; categoryKey.value = ''; credentialKey.value = ''; reason.value = ''; }
function setPayer(value) { payerId.value = value; providerUserId.value = ''; }
function discardEdits() {
  drafts.value = Object.fromEntries(overview.value.rows.map(row => [row.serviceCode, dollars(row.rateCents)]));
  unitDrafts.value = Object.fromEntries(overview.value.rows.map(row => [row.serviceCode, effectiveUnit(row)]));
}
function parseCents(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Enter a dollar amount with at most two decimal places. Use 0.00 for an explicitly free service.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) throw new Error('Enter a rate between $0.00 and $1,000,000.00.');
  return cents;
}
async function mutate(payload, { savedCode = null, success = 'Fee schedule saved.' } = {}) {
  if (busy.value || overview.value.readOnly || reloadNeeded.value) return;
  const generation = requestGeneration;
  saving.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post(endpoint, { ...context(), revision: overview.value.revision, ...payload });
    if (generation !== requestGeneration) return;
    apply(data, savedCode); notice.value = success; emit('updated', data);
  } catch (e) {
    if (generation === requestGeneration) {
      error.value = e.response?.data?.error?.message || 'Unable to save this fee schedule.';
      reloadNeeded.value = e.response?.status === 409;
    }
  } finally { if (generation === requestGeneration) saving.value = false; }
}
async function saveRate(row, action) {
  if (busy.value || overview.value.readOnly || reloadNeeded.value) return;
  try {
    const payload = { action, serviceCode: row.serviceCode, reason: reason.value.trim() };
    if (action !== 'reset') { payload.rateCents = parseCents(drafts.value[row.serviceCode]); payload.rateUnit = unitDrafts.value[row.serviceCode]; }
    await mutate(payload, { savedCode: row.serviceCode, success: action === 'update_practice_default' ? `${row.serviceCode} practice default updated. Saved payer and provider overrides still apply.` : `${row.serviceCode} ${action === 'reset' ? 'now uses its inherited rate' : 'rate saved'}.` });
  } catch (e) { error.value = e.message; }
}
async function saveModifiers(row) {
  const text = String(modifierDrafts.value[row.serviceCode] || '').trim();
  await mutate({ action: text ? 'set_modifiers' : 'reset_modifiers', serviceCode: row.serviceCode, modifiers: text ? text.split(/[,\s]+/) : undefined, reason: reason.value.trim() }, { savedCode: row.serviceCode, success: `${row.serviceCode} modifier default saved.` });
}
async function setVisibility(row) {
  await mutate({ action: 'set_visibility', serviceCode: row.serviceCode, isHidden: !row.isHidden, reason: reason.value.trim() }, { savedCode: row.serviceCode, success: `${row.serviceCode} ${row.isHidden ? 'shown' : 'hidden'} in fee schedules.` });
}
async function usePlatformDefaults() {
  if (busy.value || hasUnsavedChanges.value || overview.value.readOnly) return;
  const generation = requestGeneration;
  saving.value = true; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post(`${endpoint}/defaults`, { agencyId: Number(props.agencyId), mode: mode.value, revision: overview.value.revision, reason: reason.value.trim() });
    if (generation !== requestGeneration) return;
    apply(data); notice.value = 'Missing practice rates filled from platform defaults. Existing custom rates were retained.'; emit('updated', data);
  } catch (e) {
    if (generation === requestGeneration) { error.value = e.response?.data?.error?.message || 'Unable to fill missing practice rates.'; reloadNeeded.value = e.response?.status === 409; }
  } finally { if (generation === requestGeneration) saving.value = false; }
}
async function previewPayerSync() {
  if (busy.value || overview.value.readOnly || hasUnsavedChanges.value) return;
  const generation = requestGeneration;
  syncing.value = true; syncPlan.value = null; syncError.value = ''; syncNotice.value = '';
  try {
    const { data } = await api.post('/medical-billing/fee-schedule/sync-payers', { agencyId: Number(props.agencyId), apply: false });
    if (generation === requestGeneration) syncPlan.value = { ...data, operations: data.operations || [], conflicts: data.conflicts || [] };
  } catch (e) { if (generation === requestGeneration) syncError.value = e.response?.data?.error?.message || 'Unable to review the payer catalog sync.'; }
  finally { if (generation === requestGeneration) syncing.value = false; }
}
async function applyPayerSync() {
  if (busy.value || overview.value.readOnly || !syncPlan.value?.planToken) return;
  const generation = requestGeneration;
  syncing.value = true; syncError.value = ''; syncNotice.value = '';
  try {
    const { data } = await api.post('/medical-billing/fee-schedule/sync-payers', { agencyId: Number(props.agencyId), apply: true, planToken: syncPlan.value.planToken });
    if (generation !== requestGeneration) return;
    syncPlan.value = null;
    const count = (data.results || []).length;
    syncNotice.value = `${count} payer ${count === 1 ? 'link' : 'links'} saved.${data.conflicts?.length ? ` ${data.conflicts.length} still need manual review in credentialing.` : ''}`;
    const refreshContext = scopeReady.value ? context() : { agencyId: Number(props.agencyId), mode: mode.value, scope: 'practice' };
    try {
      const response = await api.get(endpoint, { params: { ...refreshContext, includeHidden: 1 } });
      if (generation !== requestGeneration) return;
      if (scopeReady.value) apply(response.data);
      else overview.value = { ...emptyOverview(), ...response.data, rows: [] };
    } catch { if (generation === requestGeneration) syncError.value = 'Payer links were saved. Reopen the schedule to refresh the provider list.'; }
    if (generation === requestGeneration) emit('updated', data);
  } catch (e) {
    if (generation === requestGeneration) {
      syncError.value = e.response?.data?.error?.message || 'Unable to apply the payer catalog sync.';
      if (e.response?.status === 409) syncPlan.value = null;
    }
  } finally { if (generation === requestGeneration) syncing.value = false; }
}
function applyInitialContext() {
  const initial = initialContext();
  mode.value = initial.mode; scope.value = initial.scope; payerId.value = initial.payerId; providerUserId.value = initial.providerUserId; categoryKey.value = initial.categoryKey;
}
watch(() => props.agencyId, () => { requestGeneration++; metadataLoaded = false; saving.value = false; syncing.value = false; overview.value = emptyOverview(); applyInitialContext(); reason.value = ''; });
watch(() => [props.initialMode, props.initialScope, props.initialProviderId, props.initialPayerId, props.initialCategoryKey], () => { if (!hasUnsavedChanges.value && !saving.value) applyInitialContext(); });
watch([() => props.agencyId, mode, scope, payerId, providerUserId, categoryKey, credentialKey], () => { emit('context-change', context()); load(); }, { immediate: true });
onBeforeUnmount(() => { requestGeneration++; });
defineExpose({ refresh: load });
</script>

<style scoped>
.fee-schedule { background: #fff; border: 1px solid #dae4ee; border-radius: 16px; color: #20364c; padding: 24px; }
.fee-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
h2 { margin: 3px 0 8px; font-size: 23px; } p { line-height: 1.5; margin: 7px 0; }
.eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #567389; }
.fee-heading p:not(.eyebrow), .context-help { color: #5b7082; font-size: 14px; }
.button { border: 1px solid #bccddd; background: #fff; border-radius: 8px; padding: 9px 12px; text-decoration: none; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; }
.primary { color: #fff; background: #176f83; border-color: #176f83; } .secondary { color: #225675; }
button:disabled, input:disabled, select:disabled { opacity: .6; cursor: not-allowed; }
.mode-tabs { display: flex; gap: 6px; border-bottom: 1px solid #dbe4eb; margin: 22px 0 20px; }
.mode-tabs button { border: 0; border-bottom: 3px solid transparent; background: transparent; padding: 12px 18px; color: #597086; font: inherit; font-weight: 600; cursor: pointer; }
.mode-tabs button.active { border-bottom-color: #176f83; color: #176f83; }
.schedule-context { display: flex; flex-wrap: wrap; gap: 16px; }
label { display: flex; flex-direction: column; gap: 7px; font-size: 13px; font-weight: 600; }
input, select { min-height: 42px; padding: 9px 11px; border: 1px solid #bccddd; border-radius: 7px; background: white; color: #20364c; font: inherit; font-size: 14px; }
.schedule-context label { flex: 1 1 210px; max-width: 380px; }
.inheritance { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 18px; padding: 12px; background: #f0f6f9; border-radius: 8px; color: #376278; font-size: 12px; }
.inheritance span:not([aria-hidden]) { font-weight: 600; }
.message, .reload-notice, .draft-notice { padding: 12px 14px; margin: 14px 0; border-radius: 8px; font-size: 14px; }
.error { color: #9c2828; background: #fff1f0; border: 1px solid #f3c8c4; }
.success { color: #14634b; background: #edf8f3; border: 1px solid #c7e8d9; }
.warning, .reload-notice { color: #785117; background: #fff8e9; border: 1px solid #ecd7ad; }
.payer-catalog-actions, .sync-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin: 12px 0; font-size: 13px; }
.payer-sync-review { padding: 16px; background: #f5f9fc; border: 1px solid #c9dce8; border-radius: 10px; margin: 16px 0; font-size: 14px; }
.payer-sync-review h3 { font-size: 17px; margin: 0 0 8px; } .payer-sync-review li { margin: 9px 0; overflow-wrap: anywhere; }
.sync-conflicts { color: #79551b; }
.draft-notice { color: #244f72; background: #eef5fc; }
.schedule-toolbar { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; margin: 22px 0 8px; }
.search-label { flex: 1 1 230px; max-width: 360px; }
.checkbox-label { flex-direction: row; align-items: center; min-height: 42px; font-weight: 500; }
.checkbox-label input { width: 17px; min-height: 17px; accent-color: #176f83; }
.reason-label { display: grid; grid-template-columns: max-content 1fr; column-gap: 4px; flex: 1 1 230px; max-width: 360px; }
.reason-label input { grid-column: 1 / -1; width: 100%; } .optional-label { color: #63788a; font-weight: 400; }
.rate-table-wrap { overflow: auto; margin-top: 18px; }
.rate-table { border-collapse: collapse; width: 100%; font-size: 14px; text-align: left; }
.rate-table thead th { background: #f1f5f9; color: #486075; font-size: 12px; padding: 12px; }
.rate-table td, .rate-table tbody th { padding: 16px 12px; border-bottom: 1px solid #e1e9ef; vertical-align: top; }
.service-cell { min-width: 190px; max-width: 360px; font-weight: 400; }
.service-cell > span, small { display: block; margin-top: 6px; color: #63788a; line-height: 1.4; }
.service-cell strong { font-size: 15px; }
.small-badge { margin-left: 7px; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; color: #486075; background: #eaf0f5; vertical-align: middle; }
.current-rate { min-width: 165px; } .current-rate > strong { display: block; font-size: 16px; }
.source-badge { display: inline-block; font-size: 11px; font-weight: 600; color: #235c73; background: #e8f2f7; padding: 4px 7px; border-radius: 5px; margin-top: 7px; }
.source-badge.inherited { color: #5e6570; background: #f0f2f5; }
.rate-input { display: flex; flex-direction: row; align-items: center; border: 1px solid #bccddd; border-radius: 7px; padding-left: 11px; width: 140px; max-width: 100%; background: white; }
.rate-input input { border: 0; padding-left: 0; width: 100%; min-width: 0; } .rate-input:focus-within { outline: 2px solid #75aab8; outline-offset: 1px; }
.rate-input input:focus { outline: none; }
.rate-unit-select { display: block; margin-top: 8px; width: 140px; max-width: 100%; }
.action-cell { min-width: 180px; } .action-cell > * { display: block; margin-bottom: 10px; }
.text-button { border: 0; background: none; color: #235e82; text-decoration: underline; text-underline-offset: 3px; padding: 0; font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
.visibility-button { color: #657887; } .unsaved { color: #956012; font-weight: 600; }
.hidden-service { background: #f8fafb; } .empty-state { text-align: center; padding: 30px 16px; color: #61768a; }
a { color: #235e82; }
@media (max-width: 760px) {
  .fee-schedule { padding: 16px 12px; border-radius: 12px; } .fee-heading { flex-direction: column; gap: 12px; }
  .schedule-context { gap: 12px; } .schedule-context label { max-width: none; flex-basis: 100%; }
  .schedule-toolbar { align-items: stretch; gap: 12px; } .search-label, .reason-label { max-width: none; flex-basis: 100%; }
  .rate-table-wrap { overflow: visible; } .rate-table, .rate-table tbody { display: block; }
  .rate-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .rate-table tbody tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); border: 1px solid #d9e4ec; border-radius: 10px; margin-bottom: 14px; overflow: hidden; }
  .rate-table td, .rate-table tbody th { border: 0; padding: 12px; min-width: 0; max-width: none; }
  .service-cell { grid-column: 1 / -1; background: #f3f7fa; }
  .rate-table td[data-label]::before { display: block; content: attr(data-label); font-size: 11px; font-weight: 600; color: #657b8d; margin-bottom: 9px; }
  .action-cell { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; border-top: 1px solid #e4ebf1 !important; }
  .action-cell::before { display: none !important; } .action-cell > * { margin: 0; }
  .current-rate > strong { font-size: 15px; } .rate-input { width: auto; }
  .inheritance { gap: 6px; font-size: 11px; } .mode-tabs button { flex: 1; padding-left: 8px; padding-right: 8px; }
}
</style>
