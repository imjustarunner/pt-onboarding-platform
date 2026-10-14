<template>
  <details class="provider-rollout" @toggle="onToggle">
    <summary>Optional provider transitions · claims here, ERAs in TherapyNotes</summary>
    <p>Billing is available to all providers whose claims meet the practice’s billing requirements. Use these optional records to hold a provider’s submissions or set a service-date cutoff while moving from TherapyNotes.</p>
    <p>Claims still require the practice connection, insurance, payer enrollment and signed documentation to be ready. Supervised providers also need the correct payer rule and supervisor review.</p>
    <button type="button" :disabled="busy" @click="load">Refresh rollout</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="loaded && evidence" aria-label="Setup from existing records">
      <h4>Provider–payer setup from existing records</h4>
      <p>Refreshed from billing imports and credentialing. Recorded payments show historical activity; confirm the electronic payer ID, current enrollment and ERA delivery before starting submissions.</p>
      <p v-if="evidence.lastImportAt">Latest completed report import: {{ evidence.lastImportAt }}</p>
      <label>Filter provider or payer<input v-model="evidenceSearch" type="search" /></label>
      <details v-if="evidence.providerActivity?.length">
        <summary>Provider activity from payroll report imports</summary>
        <p>These imports retain provider and service-code history. Payer routing and enrollment come from credentialing and payer setup.</p>
        <ul><li v-for="activity in filteredActivity" :key="activity.providerUserId">{{ providerName(activity.providerUserId) }} · {{ activity.serviceCodes.join(', ') }} · latest service {{ activity.lastServiceDate || 'not recorded' }}</li></ul>
      </details>
      <p v-if="!evidence.pairs.length">No matched provider–payer records found for this practice.</p>
      <ul>
        <li v-for="pair in filteredEvidence" :key="`${pair.providerUserId}:${pair.payerName}`">
          <strong>{{ providerName(pair.providerUserId) }} · {{ pair.payerName }}</strong>
          <div>{{ pair.reportLines }} report lines · {{ pair.paidReportLines }} with recorded insurance payments<span v-if="pair.lastServiceDate"> · latest service {{ pair.lastServiceDate }}</span></div>
          <div v-for="credential in pair.credentials" :key="`${credential.providerUserId}:${credential.definitionId}`">
            {{ credential.inherited ? `Supervisor credentialing (${providerName(credential.providerUserId)})` : 'Provider credentialing' }} · {{ credential.effectiveDate ? `effective ${credential.effectiveDate}` : 'effective date missing' }}
          </div>
          <div v-for="group in pair.billingGroups" :key="`${group.id}:${group.effectiveDate}`">{{ group.label || 'Billing group' }} · NPI {{ group.npi }} · {{ group.officeId ? `office #${group.officeId}` : 'office mapping missing' }}</div>
          <div v-if="pair.requiresSupervision">Billing supervisor: {{ pair.supervisorUserId ? providerName(pair.supervisorUserId) : 'assignment needed' }}</div>
          <div>{{ pair.payerMappingConflict ? 'Conflicting saved electronic payer IDs — review the payer mapping' : pair.payerId ? `Electronic payer ID from saved setup: ${pair.payerId}` : 'Electronic payer ID needs verification' }}</div>
          <button v-if="canManage" type="button" :disabled="busy" @click="useEvidence(pair)">Use existing setup</button>
        </li>
      </ul>
      <p v-if="matchingEvidence.length > filteredEvidence.length">Showing {{ filteredEvidence.length }} of {{ matchingEvidence.length }} matches. Narrow the filter to find another provider or payer.</p>
    </section>
    <p v-if="loaded && !policy.entries.length">No provider-specific holds or cutover dates. Normal claim checks apply to everyone.</p>
    <ul v-if="loaded">
      <li v-for="entry in policy.entries" :key="`${entry.providerUserId}:${entry.payerId}`">
        {{ providerName(entry.providerUserId) }} · {{ entry.payerId }} · {{ entry.status }} ·
        {{ entry.startDate }}{{ entry.endDate ? ` through ${entry.endDate}` : ' onward' }}
        <button v-if="canManage" type="button" :disabled="busy" @click="edit(entry)">Review / change</button>
      </li>
    </ul>
    <form v-if="loaded && canManage" @submit.prevent="save">
      <label>Provider<select v-model="form.providerUserId" required :disabled="busy">
        <option value="">Choose provider</option><option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
      </select></label>
      <label>Payer name<input v-model="form.payerName" maxlength="255" :disabled="busy" /></label>
      <label>Electronic payer ID<input v-model="form.payerId" required maxlength="80" :disabled="busy" placeholder="Use the verified Claim.MD payer ID" /></label>
      <label class="check"><input v-model="form.requiresSupervision" type="checkbox" :disabled="busy" />This provider requires supervised billing (including interns).</label>
      <label v-if="form.requiresSupervision">Responsible supervising clinician<select v-model="form.supervisorUserId" required :disabled="busy"><option value="">Choose supervisor</option><option v-for="provider in providers.filter(p => Number(p.id) !== Number(form.providerUserId))" :key="provider.id" :value="provider.id">{{ provider.name }}</option></select></label>
      <label>First service date in this app<input v-model="form.startDate" type="date" required :disabled="busy" /></label>
      <label>Last service date (optional)<input v-model="form.endDate" type="date" :min="form.startDate" :disabled="busy" /></label>
      <label>Status<select v-model="form.status" :disabled="busy"><option value="draft">Preparing · hold submissions</option><option value="active">Allow submissions within these dates</option><option value="paused">Pause submissions</option></select></label>
      <label>Payer / routing review reference<textarea v-model="form.reference" required maxlength="1000" :disabled="busy" placeholder="Reference the verified setup; omit patient information." /></label>
      <label class="check"><input v-model="form.routingVerified" type="checkbox" :disabled="busy" />The payer’s ERA delivery to TherapyNotes has been verified for this billing identity.</label>
      <label v-if="form.status === 'active'" class="check"><input v-model="form.cutoverReviewed" type="checkbox" required :disabled="busy" />I reviewed the cutover dates and confirmed these services will not also be submitted from TherapyNotes.</label>
      <p>Saving does not change ERA enrollment or send a claim.</p>
      <button :disabled="busy">Save provider and payer</button>
      <button type="button" :disabled="busy" @click="reset">Add another provider / payer</button>
    </form>
  </details>
</template>
<script>
const blank = () => ({ providerUserId: '', payerId: '', payerName: '', startDate: '', endDate: '', status: 'draft', reference: '', routingVerified: false, cutoverReviewed: false, requiresSupervision: true, supervisorUserId: '' });
export default {
  props: { fetchPolicy: { type: Function, required: true }, saveEntry: { type: Function, required: true } },
  data: () => ({ busy: false, loaded: false, error: '', notice: '', policy: { revision: 0, entries: [] }, providers: [], evidence: null, evidenceSearch: '', canManage: false, form: blank(), active: true }),
  computed: {
    matchingEvidence() { const search = this.evidenceSearch.trim().toLowerCase(); return (this.evidence?.pairs || []).filter(p => `${this.providerName(p.providerUserId)} ${p.payerName}`.toLowerCase().includes(search)); },
    filteredEvidence() { return this.matchingEvidence.slice(0, 50); },
    filteredActivity() { const search = this.evidenceSearch.trim().toLowerCase(); return (this.evidence?.providerActivity || []).filter(p => this.providerName(p.providerUserId).toLowerCase().includes(search)); }
  },
  beforeUnmount() { this.active = false; },
  methods: {
    onToggle(event) { if (event.target.open && !this.loaded && !this.busy) this.load(); },
    providerName(id) { return this.providers.find(p => Number(p.id) === Number(id))?.name || `Provider #${id}`; },
    reset() { this.form = blank(); this.notice = ''; },
    edit(entry) { this.form = { ...entry, endDate: entry.endDate || '', cutoverReviewed: false }; this.notice = ''; },
    useEvidence(pair) {
      const existing = pair.payerId && this.policy.entries.find(e => Number(e.providerUserId) === Number(pair.providerUserId) && e.payerId === pair.payerId);
      if (existing) { this.edit(existing); return; }
      this.form = { ...blank(), providerUserId: pair.providerUserId, payerName: pair.payerName, payerId: pair.payerId || '',
        requiresSupervision: pair.requiresSupervision, supervisorUserId: pair.supervisorUserId || '',
        reference: `Existing credentialing and billing reports; latest reported service ${pair.lastServiceDate || 'not recorded'}.` };
      this.notice = 'Existing provider and payer details loaded. Confirm the electronic payer ID, cutover date and ERA routing before activation.';
    },
    async load() {
      if (this.busy) return;
      this.busy = true; this.error = '';
      try { const data = await this.fetchPolicy(); if (this.active) { this.policy = data.policy; this.providers = data.providers; this.evidence = data.evidence || null; this.canManage = data.canManage; this.loaded = true; this.form.cutoverReviewed = false; } }
      catch (e) { if (this.active) this.error = e.response?.data?.error?.message || e.message || 'Unable to load rollout.'; }
      finally { if (this.active) this.busy = false; }
    },
    async save() {
      if (this.busy) return;
      this.busy = true; this.error = ''; this.notice = '';
      try { const data = await this.saveEntry({ ...this.form, providerUserId: Number(this.form.providerUserId), revision: this.policy.revision }); if (this.active) { this.policy = data.policy; this.form.cutoverReviewed = false; this.notice = 'Rollout saved. Each claim still requires review before submission.'; } }
      catch (e) { if (this.active) this.error = e.response?.data?.error?.message || e.message || 'Unable to save rollout.'; }
      finally { if (this.active) this.busy = false; }
    }
  }
};
</script>
<style scoped>
.provider-rollout{border:1px solid #ccd7e5;padding:1rem;border-radius:8px;margin:1rem 0}.provider-rollout summary{cursor:pointer;font-weight:600}.provider-rollout form{display:grid;gap:12px;max-width:700px}.provider-rollout label{display:grid;gap:5px}.provider-rollout .check{display:flex;align-items:flex-start;gap:8px}.provider-rollout input,.provider-rollout select,.provider-rollout textarea{font:inherit;max-width:100%;padding:8px}.provider-rollout li{margin:10px 0}.provider-rollout [role=alert]{color:#a22222}
</style>
