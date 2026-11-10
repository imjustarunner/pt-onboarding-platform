<template>
  <div class="billing-shell" style="--bw-brand: #1555b0; --bw-on-brand: #ffffff">
    <aside class="billing-nav" aria-label="Billing navigation">
      <div class="brand-lockup"><AuricWellBrand context="Billing & Claims" /></div>
      <nav><button v-for="item in navigation" :key="item.id" :class="{ active: section === item.id }" :aria-current="section === item.id ? 'page' : undefined" @click="setSection(item.id)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path :d="item.icon" /></svg>{{ item.label }}</button></nav>
      <button v-if="!route.meta?.auricwellPreview" class="text-button" @click="router.push('/fundthred/app/collections')">FundThred collections →</button>
      <div class="nav-footer"><span class="access-dot"></span> Billing access only<small>{{ signedInName }}</small></div>
    </aside>

    <main class="billing-main">
      <header class="workspace-header"><div><span class="eyebrow">AURICWELL · BILLING & CLAIMS</span><h1>{{ pageTitle }}</h1><p>{{ pageDescription }}</p></div><button class="secondary" :disabled="loading" @click="reload">{{ loading ? 'Refreshing…' : 'Refresh' }}</button></header>
      <section v-if="!route.meta?.auricwellPreview && organizations.length" class="scope-bar" :class="{ 'single-agency': !hasMultipleOrganizations }" aria-label="Organization scope">
        <label v-if="hasMultipleOrganizations"><span>Organization scope</span><select v-model="scopeId" data-testid="organization-scope"><option value="all">All authorized companies ({{ organizations.length }})</option><option v-for="org in organizations" :key="org.id" :value="String(org.id)">{{ org.name }}</option></select></label>
        <div class="scope-context"><strong>{{ scopeId === 'all' ? 'Your authorized billing organizations' : scopedOrganization?.name }}</strong><span>Signed in as {{ signedInName }} · Billing for {{ scopeId === 'all' ? 'multiple organizations' : scopedOrganization?.name }}</span></div>
        <span v-if="updatedAt" class="timestamp">Updated {{ clockTime(updatedAt) }}</span>
      </section>
      <p v-if="!route.meta?.auricwellPreview && scopedOrganization && ['admin','super_admin'].includes(authStore.user?.role)" class="panel-note"><button class="text-button" @click="openBillingIdentity">Billing identity setup: tax ID and practice profile →</button></p>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <p v-if="loading && !organizations.length" class="empty-state" role="status">Loading your billing organizations…</p>
      <p v-else-if="!organizations.length && !error" class="empty-state">No organizations with medical billing access are available for your account.</p>
      <template v-if="organizations.length">
        <div class="lifecycle" aria-label="Billing lifecycle"><button @click="setSection('payers')"><b>1</b><span>Payer connection<small>Claims and ERA enrollment</small></span></button><span>→</span><button @click="setSection('claims')"><b>2</b><span>Claim submission<small>Review, approve, track responses</small></span></button><span>→</span><button @click="setSection('payments')"><b>3</b><span>ERA &amp; payment<small>Match, reconcile, post</small></span></button></div>
        <div class="acceptance-note"><span aria-hidden="true">ⓘ</span> <strong>Accepted does not mean paid.</strong> Acknowledgements confirm claim processing; payment requires remittance and reconciliation.</div>

        <ClientPendingTasks v-if="!route.meta?.auricwellPreview && scopedOrganization && Number(route.query.clientId)>0" :key="`client-tasks-${scopeId}-${route.query.clientId}`" :agency-id="scopedOrganization.id" :client-id="route.query.clientId" :agency-slug="scopedOrganization.slug" billing-enabled />
        <InsuranceCardTasks v-if="!route.query.clientId && !route.meta?.auricwellPreview && scopedOrganization && ['workspace','settings'].includes(section)" :key="`insurance-${scopeId}`" :agency-id="scopedOrganization.id" staff collapsed />
        <template v-if="['workspace', 'claims', 'reports'].includes(section)">
          <section class="metric-grid" aria-label="Claim workload">
            <button class="metric" @click="filterQueue('all')"><span class="metric-symbol">▤</span><span><small>Active work items</small><strong>{{ totals?.active ?? '—' }}</strong><em>Across selected scope</em></span></button>
            <button class="metric" @click="filterQueue('ready_to_submit')"><span class="metric-symbol amber">↗</span><span><small>Final checks required</small><strong>{{ totals?.ready ?? '—' }}</strong><em>Signed note · submission review pending</em></span></button>
            <button class="metric" @click="filterQueue('in_progress')"><span class="metric-symbol amber">◷</span><span><small>In progress</small><strong>{{ totals?.progress ?? '—' }}</strong><em>Submitted or unresolved</em></span></button>
            <button class="metric" @click="filterQueue('attention')"><span class="metric-symbol red">!</span><span><small>Needs attention</small><strong>{{ totals?.attention ?? '—' }}</strong><em>Corrections, rejections or denials</em></span></button>
          </section>
        </template>

        <div v-if="section === 'workspace' && hasMultipleOrganizations" class="overview-layout" :class="{ 'with-drawer': selectedOrganization }">
          <section class="panel company-panel"><div class="panel-heading"><div><h2>Company billing overview</h2><p>Find the next task without opening every company.</p></div><label class="search"><span class="sr-only">Search companies</span><input v-model="companySearch" placeholder="Search companies…" /></label></div>
            <div class="table-scroll"><table><thead><tr><th>Company</th><th>Final checks</th><th>Drafts</th><th>Rejections / denials</th><th>ERA enrollment</th><th>EFT direct deposit</th><th>Payments</th><th></th></tr></thead><tbody><tr v-for="org in visibleOrganizations" :key="org.id" :class="{ selected: selectedOrganization?.id === org.id }"><td><button class="company-link" @click="selectCompany(org)"><img v-if="org.logoUrl" :src="logoUrl(org.logoUrl)" alt="" /><span v-else class="company-avatar">{{ initials(org.name) }}</span><span><strong>{{ org.name }}</strong><small v-if="org.billingManager" class="cell-detail">Billing managed by {{ org.billingManager.name }}</small></span></button></td><td><button class="count-link" @click="openCompanyQueue(org, 'ready_to_submit')">{{ org.counts?.ready_to_submit ?? org.counts?.ready ?? (org.counts ? 0 : '—') }}</button></td><td>{{ org.counts?.draft ?? (org.counts ? 0 : '—') }}</td><td><button class="count-link danger-text" @click="openCompanyQueue(org, 'attention')">{{ attentionCount(org) }}</button></td><td><span class="badge neutral">{{ eraSummary(org) }}</span></td><td><button class="text-button" @click="drillInto(org, 'payers')">{{ eftSummary(org) }}</button></td><td><button class="text-button" @click="drillInto(org, 'payments')">{{ org.payments?.postingCount ? money(org.payments.paidCents) + ' posted' : org.payments ? 'No payments posted' : 'Unavailable' }}</button></td><td><button class="text-button" :aria-label="`View ${org.name} billing details`" @click="selectCompany(org)">View details →</button></td></tr></tbody></table></div>
            <p v-if="!visibleOrganizations.length" class="empty-state">No companies match your search.</p>
          </section>
          <aside v-if="selectedOrganization" class="panel company-drawer" :style="billingBrand(selectedOrganization)" aria-label="Company billing details"><div class="panel-heading"><div><span class="eyebrow">COMPANY DETAILS</span><h2>{{ selectedOrganization.name }}</h2></div><button class="icon-button" aria-label="Close company details" @click="selectedCompanyId = null">×</button></div><p class="subtle">{{ selectedOrganization.connection?.configured ? 'Clearinghouse credentials configured' : 'Clearinghouse setup needed' }} · {{ selectedOrganization.connection?.mode || 'disabled' }}</p><div class="drawer-stats"><div><strong>{{ selectedOrganization.counts?.ready_to_submit ?? selectedOrganization.counts?.ready ?? (selectedOrganization.counts ? 0 : '—') }}</strong><span>Final checks required</span></div><div><strong>{{ attentionCount(selectedOrganization) }}</strong><span>Need attention</span></div></div><h3>Next actions</h3><button class="action-row" @click="openCompanyQueue(selectedOrganization, 'attention')">Review rejections and denials <span>→</span></button><button class="action-row" @click="openCompanyQueue(selectedOrganization, 'ready_to_submit')">Review prepared claims <span>→</span></button><button class="action-row" @click="drillInto(selectedOrganization, 'payers')">Check payer and ERA enrollment <span>→</span></button><button class="action-row" @click="drillInto(selectedOrganization, 'reports')">Open company reports <span>→</span></button><p class="subtle">Payment totals will appear after ERA reconciliation is available.</p><button class="primary wide" @click="drillInto(selectedOrganization, 'claims')">Work in {{ selectedOrganization.name }}</button></aside>
        </div>

        <BillingRuleSuggestions v-if="['workspace', 'claims'].includes(section) && scopedOrganization" :key="`suggestions-${scopeId}`" :agency-id="scopedOrganization.id" />
        <section v-if="['workspace', 'claims'].includes(section)" class="panel queue-panel">
          <div class="panel-heading"><div><h2>{{ scopeId === 'all' ? 'Cross-company work queue' : 'Claim work queue' }}</h2><p>Signed notes, drafts and billing activity are linked by patient. Scheduled visits stay in each patient’s service history.</p></div><form class="search" @submit.prevent="applySearch"><label class="sr-only" for="claim-search">Search claims</label><input id="claim-search" v-model="searchInput" placeholder="Patient, claim, provider, service or payer…" /><button class="secondary">Search</button></form></div>
          <div class="panel-toolbar"><button class="secondary" :aria-pressed="queueMode === 'claims'" @click="queueMode = 'claims'">Claims</button><button class="secondary" :aria-pressed="queueMode === 'connections'" @click="queueMode = 'connections'">Payer, ERA &amp; EFT activity ({{ connectionQueue.length }})</button></div>
          <template v-if="queueMode === 'claims'">
          <div class="queue-tabs" aria-label="Claim filters"><button v-for="tab in queueTabs" :key="tab.id" :class="{ active: status === tab.id }" :aria-pressed="status === tab.id" @click="changeStatus(tab.id)">{{ tab.label }}</button></div>
          <div v-if="scopedOrganization && status === 'ready_to_submit'" class="panel-toolbar"><button class="primary" :disabled="submittingSet || !claims.length" @click="submitReadySet">{{ submittingSet ? 'Submitting…' : 'Check and submit eligible claims' }}</button><p v-if="submitSetResult" class="panel-note">{{ submitSetResult }}</p></div>
          <p v-if="!capabilities.claims" class="empty-state">Claim data is unavailable until billing setup is complete.</p>
          <ClaimWorkTable v-else :items="claims" :organizations="organizations" :multiple-organizations="hasMultipleOrganizations" :sort-by="sortBy" :direction="sortDirection" :preference-key="`billing-columns:${authStore.user?.id || 'session'}`" @sort="sortClaims" @open="openClaim" />
          <p v-if="capabilities.claims && !claims.length && !loading" class="empty-state">No claims match this scope and filter.</p><div class="pagination"><span>{{ total.toLocaleString() }} work items · Page {{ page }} of {{ Math.max(1, Math.ceil(total / 30)) }}</span><div><button class="secondary" :disabled="loading || page <= 1" @click="page--">Previous</button><button class="secondary" :disabled="loading || page * 30 >= total" @click="page++">Next</button></div></div>
          </template>
          <template v-else><div class="table-scroll"><table><thead><tr><th v-if="hasMultipleOrganizations">Organization</th><th>Work item</th><th>Payer / billing office</th><th>Status</th><th>Last update</th><th>Next action</th></tr></thead><tbody><tr v-for="item in connectionQueue" :key="item.key"><td v-if="hasMultipleOrganizations">{{ item.organization.name }}</td><td>{{ item.label }}</td><td>{{ item.payer || '—' }}</td><td><span class="badge neutral">{{ item.status }}</span></td><td>{{ date(item.at) }}</td><td><button class="text-button" @click="drillInto(item.organization, item.section)">{{ item.section === 'settings' ? 'Configure' : 'Review enrollment' }} →</button></td></tr></tbody></table></div><p v-if="!connectionQueue.length" class="empty-state">No connection activity is recorded in this scope.</p><p class="panel-note">Enrollment events are shown as reported. Payment-matching tasks will join this queue when reconciliation is enabled.</p></template>
        </section>
        <details v-if="section === 'claims' && scopedOrganization" class="panel"><summary>Clearinghouse connection and response sync</summary><ClaimMdWorkspace :key="`connection-${scopeId}`" :agency-id="scopedOrganization.id" :connection="scopedOrganization.connection || {}" section="connection" @updated="reload" /></details>

        <section v-if="section === 'payers'" class="panel"><div class="panel-heading"><div><h2>Payer connections &amp; ERA enrollment</h2><p>Track each transaction separately for the selected company and billing office.</p></div></div><div class="table-scroll"><table><thead><tr><th v-if="hasMultipleOrganizations">Organization</th><th>Payer</th><th>Claims enrollment</th><th>ERA enrollment</th><th>Eligibility</th><th>EFT direct deposit</th><th></th></tr></thead><tbody><tr v-for="row in payerRows" :key="row.key"><td v-if="hasMultipleOrganizations">{{ row.organization.name }}</td><td>{{ row.payerId }}<small class="cell-detail">Office #{{ row.officeId }} · NPI {{ row.providerNpi }}</small></td><td>{{ row.claims }}</td><td>{{ row.era }}</td><td>{{ row.eligibility }}</td><td>{{ row.eft || 'Not recorded' }}</td><td><button class="text-button" @click="drillInto(row.organization, 'payers')">Manage →</button></td></tr></tbody></table></div><p v-if="!payerRows.length" class="empty-state">{{ capabilities.enrollments ? 'No payer enrollment activity has been recorded in this workspace.' : 'Enrollment tracking is awaiting setup.' }}</p><p class="panel-note">Contracting, claims enrollment, ERA enrollment, and bank deposit setup are separate. A configured API key does not verify a payer connection.</p><label v-if="!scopedOrganization" class="inline-scope">Connect a payer for <select v-model="scopeId"><option value="all">Choose a company</option><option v-for="org in organizations" :key="org.id" :value="String(org.id)">{{ org.name }}</option></select></label></section>
        <CallBillingQueue v-if="['workspace','claims'].includes(section) && scopedOrganization" :key="`call-billing-${scopeId}`" :agency-id="scopedOrganization.id" />

        <PayerEftPanel v-if="['payers', 'payments'].includes(section) && scopedOrganization" :key="`eft-${scopeId}`" :agency-id="scopedOrganization.id" @updated="reload" />
        <ClaimMdWorkspace v-if="section === 'payers' && scopedOrganization" :key="`payers-${scopeId}`" :agency-id="scopedOrganization.id" :connection="scopedOrganization.connection || {}" section="payers" @updated="reload" />

        <template v-if="section === 'payments'"><BankFeedPanel v-if="scopedOrganization && ['admin', 'super_admin'].includes(authStore.user?.role)" :key="`bank-${scopeId}`" :agency-id="scopedOrganization.id" :agency-name="scopedOrganization.name" />
          <RemittanceWorkspace v-if="scopedOrganization" :key="`era-${scopeId}`" :agency-id="scopedOrganization.id" :agency-name="scopedOrganization.name" />
          <section v-else class="panel empty-state"><h2>Select an organization</h2><p>Select a company above to import and reconcile its remittances and patient balances.</p></section>
        </template>

        <InsuranceVerificationQueue v-if="section === 'insurance'" :agency-id="scopeId === 'all' ? 0 : Number(scopeId)" :client-id="route.query.clientId" />
        <BillingTransactionHistory v-if="section === 'transactions'" :agency-id="scopeId" :client-id="route.query.clientId" @open-claim="openClaim" />

        <template v-if="section === 'fee-schedules'">
          <BillingFeeSchedule v-if="scopedOrganization" :key="`fee-schedule-${scopeId}`" :agency-id="scopedOrganization.id" :agency-name="scopedOrganization.name" :service-codes-path="serviceCodeSettingsPath" :initial-mode="route.query.feeMode === 'self_pay' ? 'self_pay' : 'insurance'" :initial-scope="String(route.query.feeScope || '')" :initial-provider-id="Number(route.query.feeProviderId || 0)" :initial-payer-id="String(route.query.feePayerId || '')" :initial-category-key="String(route.query.feeCategory || '')" @context-change="saveFeeContext" />
          <section v-else class="panel empty-state"><h2>Select a practice</h2><p>Choose an organization above to manage its insurance and self-pay fee schedules.</p></section>
        </template>
        <template v-if="section === 'reports'">
          <section class="panel"><div class="panel-heading"><div><h2>Claims by stage</h2><p>Current workload for {{ scopedOrganization?.name || 'all authorized companies' }}.</p></div></div><div v-if="totals" class="status-chart"><button v-for="bar in reportBars" :key="bar.status" @click="filterQueue(bar.status)"><span>{{ bar.label }}</span><span class="bar-track"><i :style="{ width: `${bar.value ? Math.max(2, bar.value / maxBar * 100) : 0}%` }"></i></span><strong>{{ bar.value }}</strong></button></div><p class="panel-note">ERA payment totals and patient balance reviews are available in Payments. Payment-speed analysis requires matched submission and adjudication history.</p></section>
          <MedicalBillingReportsPanel v-if="scopedOrganization" :key="`reports-${scopeId}`" :agency-id="scopedOrganization.id" />
          <section v-else class="panel empty-state"><h2>Detailed company reports</h2><p>Select a company to run and export claims, service-line, clinical, and billing reports.</p></section>
          <section class="panel"><h2>Saved views</h2><p class="subtle">Save this scope and claim filter in this browser. Saved views contain no claim or patient data.</p><form class="panel-toolbar" @submit.prevent="saveView"><input v-model="savedViewName" maxlength="60" placeholder="View name" aria-label="Saved view name" required /><button class="secondary">Save current view</button></form><div v-for="view in savedViews" :key="view.id" class="saved-view"><button class="text-button" @click="restoreView(view)">{{ view.name }}</button><button class="icon-button" :aria-label="`Remove ${view.name}`" @click="removeView(view.id)">×</button></div><p class="panel-note">Scheduled report delivery is not enabled. Company reports can be exported on demand.</p></section>
        </template>

        <template v-if="section === 'settings'"><section class="panel"><h2>Service rates</h2><p>Practice defaults, payer rates and provider overrides are managed in Fee schedules.</p><button class="secondary" @click="setSection('fee-schedules')">Open fee schedules</button></section><ProviderBillingSettings v-if="scopedOrganization && ['admin','super_admin'].includes(authStore.user?.role)" :key="`self-pay-settings-${scopeId}`" :agency-id="scopedOrganization.id" /><AuricwellCostPlanner /><AuricwellPracticePricing v-if="scopedOrganization" :key="`auric-pricing-${scopeId}`" :agency-id="scopedOrganization.id" /><BillingCostPlanner /><MedicalServiceFeesPanel v-if="scopedOrganization" :key="`fees-${scopeId}`" :agency-id="scopedOrganization.id" /><EligibilityAutomationPanel v-if="scopedOrganization" :key="`eligibility-${scopeId}`" :agency-id="scopedOrganization.id" /><section v-if="hasMultipleOrganizations" class="panel"><h2>Company billing settings</h2><p>Choose a company to manage service codes, billing locations, fees, and clearinghouse configuration.</p><select v-model="scopeId"><option value="all">Select a company</option><option v-for="org in organizations" :key="org.id" :value="String(org.id)">{{ org.name }}</option></select></section><SupervisedPayerPolicies v-if="scopedOrganization" :key="`policies-${scopeId}`" :agency-id="scopedOrganization.id" /><MedicalBillingView v-if="scopedOrganization" :key="`settings-${scopeId}`" :billing-agency-id="scopedOrganization.id" :billing-agency-slug="scopedOrganization.slug" /></template>
      </template>
    </main>

    <div v-if="selectedClaim" class="claim-overlay" @click.self="closeClaim"><aside class="claim-drawer" role="dialog" aria-modal="true" aria-labelledby="claim-dialog-title" tabindex="-1" ref="claimDialog" @keydown="trapClaimFocus">
      <div class="panel-heading"><div><span class="eyebrow">{{ companyName(selectedClaim.agency_id) }} · {{ workItemTitle(selectedClaim) }}</span><h2 id="claim-dialog-title">{{ selectedClaim.client_name || `Client #${selectedClaim.client_id}` }}</h2></div><button class="icon-button" aria-label="Close claim" @click="closeClaim">×</button></div>
      <p>{{ date(selectedClaim.date_of_service) }} · {{ selectedClaim.service_code || 'Service not recorded' }} · {{ selectedClaim.provider_name || 'Clinician not recorded' }}</p>
      <span class="badge" :class="claimStatusTone(workStage(selectedClaim))">{{ claimStatusLabel(workStage(selectedClaim)) }}</span>
      <p v-if="selectedClaim.attempt_count > 1" class="subtle">{{ selectedClaim.attempt_count }} submission attempts · one claim history</p>
      <dl class="claim-facts"><div><dt>Billed as provider</dt><dd>{{ selectedClaim.billing_provider_name || selectedClaim.provider_name || 'Not recorded' }}</dd></div><div><dt>Supervisor</dt><dd>{{ selectedClaim.supervisor_name || '—' }}</dd></div><div><dt>Charge</dt><dd>{{ selectedClaim.amount_cents == null ? 'Not set' : money(selectedClaim.amount_cents, selectedClaim.currency_code) }}</dd></div><div><dt>Units</dt><dd>{{ selectedClaim.units ?? 'Not recorded' }}</dd></div><div><dt>Place of service</dt><dd>{{ selectedClaim.place_of_service || 'Not recorded' }}</dd></div><div><dt>Diagnoses</dt><dd>{{ diagnosisList(selectedClaim.diagnosis_codes) || 'Not recorded' }}</dd></div></dl>
      <div class="panel-toolbar"><a class="secondary" :href="clientBillingLink(selectedClaim)">Client billing profile</a><button class="secondary" :aria-expanded="showClientHistory" @click="showClientHistory = !showClientHistory">{{ showClientHistory ? 'Hide' : 'View' }} client service history</button></div>
      <PlannedBillingServices v-if="showClientHistory" :agency-id="Number(selectedClaim.agency_id)" :client-id="Number(selectedClaim.client_id)" :client-name="selectedClaim.client_name || ''" @open-work-item="openClaim" />
      <p v-if="clinicalDraft" class="panel-note" role="status">{{ draftProgressMessage }}</p>
      <p v-if="claimActionError" class="error-banner" role="alert">{{ claimActionError }}</p>
      <div v-if="!clinicalDraft" class="panel-toolbar"><button v-if="selectedClaimId" class="secondary" @click="claimTools?.showHistory(selectedClaimId)">Claim history</button><button v-if="editableClaim" class="secondary" @click="claimTools?.editClaim(selectedClaimId)">Edit billing fields</button><button v-if="editableClaim" class="primary" @click="claimTools?.reviewClaim(selectedClaimId)">Review for submission</button><button v-else-if="selectedClaim.canPrepareClaim && workStage(selectedClaim) === 'ready_to_submit'" class="primary" :disabled="preparingClaim" @click="prepareReadyClaim">{{ preparingClaim ? 'Opening claim…' : 'Run final checks' }}</button></div>
      <p v-if="selectedClaim.claim_lifecycle === 'queued'" class="panel-note">Submission is unresolved. Sync and reconcile before attempting another upload.</p><p v-if="selectedClaim.claim_lifecycle === 'denied'" class="panel-note">Review the payer’s adjudication before choosing a replacement claim or appeal.</p>
      <ClaimResubmissionPanel v-if="selectedClaimId && !clinicalDraft" :agency-id="Number(selectedClaim.agency_id)" :claim-id="selectedClaimId" :revision="selectedClaim.billing_revision == null ? null : Number(selectedClaim.billing_revision)" :lifecycle="selectedClaim.claim_lifecycle" :claim-reference="selectedClaim.claim_reference" @created="openResubmission" />
      <SecondaryClaimPanel v-if="selectedClaimId && !clinicalDraft && ['paid','denied','adjusted'].includes(selectedClaim.claim_lifecycle)" :agency-id="Number(selectedClaim.agency_id)" :claim-id="selectedClaimId" @created="claimUpdated" />
      <ClaimMdWorkspace v-if="selectedClaimId" ref="claimTools" :key="`${selectedClaim.agency_id}-${selectedClaimId}`" :agency-id="Number(selectedClaim.agency_id)" :connection="claimOrganization?.connection || {}" :read-only="clinicalDraft" section="detail" @updated="claimUpdated" />
    </aside></div>
  </div>
</template>

<script setup>
import InsuranceVerificationQueue from '../../components/billing/InsuranceVerificationQueue.vue';
import BillingTransactionHistory from '../../components/billing/BillingTransactionHistory.vue';
import ClaimResubmissionPanel from '../../components/billing/ClaimResubmissionPanel.vue';
import ClaimWorkTable from '../../components/billing/ClaimWorkTable.vue';
import BillingRuleSuggestions from '../../components/billing/BillingRuleSuggestions.vue';
import ClientPendingTasks from '../../components/billing/ClientPendingTasks.vue';
import InsuranceCardTasks from '../../components/billing/InsuranceCardTasks.vue';
import CallBillingQueue from '../../components/admin/CallBillingQueue.vue';
import PlannedBillingServices from '../../components/admin/PlannedBillingServices.vue';
import RemittanceWorkspace from '../../components/billing/RemittanceWorkspace.vue';
import BankFeedPanel from '../../components/billing/BankFeedPanel.vue';
import PayerEftPanel from '../../components/billing/PayerEftPanel.vue';
import BillingCostPlanner from '../../components/billing/BillingCostPlanner.vue';
import AuricWellBrand from '../../components/auricwell/AuricWellBrand.vue';
import AuricwellCostPlanner from '../../components/billing/AuricwellCostPlanner.vue';
import AuricwellPracticePricing from '../../components/billing/AuricwellPracticePricing.vue';
import EligibilityAutomationPanel from '../../components/billing/EligibilityAutomationPanel.vue';
import MedicalServiceFeesPanel from '../../components/billing/MedicalServiceFeesPanel.vue';
import BillingFeeSchedule from '../../components/billing/BillingFeeSchedule.vue';
import ProviderBillingSettings from '../../components/admin/ProviderBillingSettings.vue';
import SecondaryClaimPanel from '../../components/admin/SecondaryClaimPanel.vue';
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { billingTotals, billingBrand, claimQueueFilters, billingStages, billingDate, diagnosisList, workStage, workClaimId, workItemKey, workItemTitle, claimStatusLabel, claimStatusTone } from '../../utils/billingWorkspace';
import ClaimMdWorkspace from '../../components/admin/ClaimMdWorkspace.vue';
import MedicalBillingReportsPanel from '../../components/admin/MedicalBillingReportsPanel.vue';
import MedicalBillingView from './MedicalBillingView.vue';
import SupervisedPayerPolicies from '../../components/admin/SupervisedPayerPolicies.vue';

const agencyStore = useAgencyStore(), authStore = useAuthStore(), route = useRoute(), router = useRouter();
function openBillingIdentity() {
  const slug = scopedOrganization.value?.slug || route.params.organizationSlug;
  router.push({path: slug ? `/${slug}/admin/settings` : '/admin/settings', query: {agencyId: String(scopedOrganization.value.id), category: 'general', item: 'business-details', agencyTab: 'contact'}});
}
const navigation = [
  { id: 'workspace', label: 'Billing Workspace', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  { id: 'claims', label: 'Claims', icon: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7' },
  { id: 'payers', label: 'Payers & ERA', icon: 'M9 8H7a4 4 0 000 8h3 M15 8h2a4 4 0 010 8h-3 M8 12h8' },
  { id: 'fee-schedules', label: 'Fee schedules', icon: 'M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5' },
  { id: 'payments', label: 'Payments', icon: 'M3 5h18v15H3z M3 10h18 M7 15h4' },
  { id: 'insurance', label: 'Insurance verification', icon: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5' },
  { id: 'transactions', label: 'Transactions', icon: 'M4 5h16 M4 12h16 M4 19h16 M8 3v4 M16 10v4 M10 17v4' },
  { id: 'reports', label: 'Reports', icon: 'M4 3v18h17 M8 17v-6 M13 17V7 M18 17V4' },
  { id: 'settings', label: 'Settings', icon: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6' }
];
const descriptions = { 'fee-schedules': 'Manage practice, payer and provider rates, with a separate self-pay schedule.', workspace: 'Manage payer connections, claims, and follow-ups across your organizations.', claims: 'Work the queue, approve claims, and follow clearinghouse and payer responses.', payers: 'Track claims, ERA, eligibility, and EFT direct deposits for every billing company.', payments: 'Review remittances and prepare for verified payment reconciliation.', insurance: 'Verify primary and secondary coverage and resolve billing readiness tasks.', transactions: 'Search recorded payments, adjustments and responsibility across your billing scope.', reports: 'Explore claim performance and export company billing reports.', settings: 'Manage the billing setup for each organization.' };
const validQueueStatus=value=>['all','attention',...billingStages.map(stage=>stage.id),...claimQueueFilters.map(filter=>filter.id)].includes(value)?value:'all';
const section = ref(navigation.some(n => n.id === route.query.billingSection) ? route.query.billingSection : 'workspace');
const scopeId = ref(String((route.meta?.auricwellPreview ? agencyStore.currentAgency?.id : null) || route.query.billingScope || route.query.agencyId || (route.query.claimId ? agencyStore.currentAgency?.id : '') || 'all')), status = ref(validQueueStatus(route.query.billingStatus)), page = ref(1), searchInput = ref(String(route.query.claimId || '')), search = ref(String(route.query.claimId || '')), companySearch = ref('');
const organizations = ref([]), claims = ref([]), total = ref(0), capabilities = ref({}), updatedAt = ref(null), loading = ref(false), error = ref('');
const queueMode = ref('claims'), sortBy = ref('date_of_service'), sortDirection = ref('desc');
const showClientHistory = ref(false), preparingClaim = ref(false), claimActionError = ref(''), submittingSet = ref(false), submitSetResult = ref('');
const selectedCompanyId = ref(null), selectedClaim = ref(null), claimTools = ref(null), claimDialog = ref(null);
let loadSequence = 0, active = true, priorFocus = null, initialClaimId = Number(route.query.claimId || 0);
onBeforeUnmount(() => { active = false; loadSequence++; });
const hasMultipleOrganizations = computed(() => !route.meta?.auricwellPreview && organizations.value.length > 1);
const scopedOrganization = computed(() => organizations.value.find(o => o.id === Number(scopeId.value)));
const serviceCodeSettingsPath = computed(() => {
  const org = scopedOrganization.value;
  return `${org?.slug ? `/${org.slug}` : ''}/admin/settings?agencyId=${org?.id || ''}&category=general&item=service-codes`;
});
function saveFeeContext(context) {
  router.replace({ query: { ...route.query, billingSection: 'fee-schedules', billingScope: scopeId.value,
    feeMode: context.mode, feeScope: context.scope, feeProviderId: context.providerUserId || undefined,
    feePayerId: context.payerId || undefined, feeCategory: context.categoryKey || undefined } });
}
const selectedOrganization = computed(() => organizations.value.find(o => o.id === selectedCompanyId.value));
const claimOrganization = computed(() => organizations.value.find(o => o.id === Number(selectedClaim.value?.agency_id)));
const scopedOrganizations = computed(() => scopedOrganization.value ? [scopedOrganization.value] : organizations.value);
const visibleOrganizations = computed(() => scopedOrganizations.value.filter(o => o.name.toLowerCase().includes(companySearch.value.toLowerCase())));
const totals = computed(() => billingTotals(scopedOrganizations.value));
const signedInName = computed(() => [authStore.user?.first_name, authStore.user?.last_name].filter(Boolean).join(' ') || 'Billing staff');
const pageTitle = computed(() => navigation.find(n => n.id === section.value)?.label);
const pageDescription = computed(() => {
  if (organizations.value.length === 1 || route.meta?.auricwellPreview) {
    return ({ workspace: 'Manage your practice’s payer connections, claims, and follow-ups.', payers: 'Track your practice’s claims, ERA, eligibility, and EFT direct deposits.', settings: 'Manage your practice’s billing setup.' })[section.value] || descriptions[section.value];
  }
  return descriptions[section.value];
});
const selectedClaimId = computed(() => workClaimId(selectedClaim.value));
const clinicalDraft = computed(() => !!selectedClaim.value && ['note_needed','draft','pending_review','revisions_needed'].includes(workStage(selectedClaim.value)));
const editableClaim = computed(() => !!selectedClaimId.value && !clinicalDraft.value && selectedClaim.value?.readOnly !== true && selectedClaim.value?.canReviewClaim !== false && ['draft', 'ready', 'rejected'].includes(selectedClaim.value?.claim_lifecycle));
const draftProgressMessage = computed(() => ({note_needed:'The session has passed and a note has not been started.',draft:'The clinician’s note is in progress. Billing review becomes available after the required clinical signatures.',pending_review:'The author signed this note. Supervisor review is pending.',revisions_needed:'The supervisor requested changes. The clinician must complete the requested revision before billing review.'}[workStage(selectedClaim.value || {})] || 'This work item is available for review only.'));
const queueTabs = [{ id: 'all', label: 'All claims' }, { id: 'attention', label: 'Needs attention' }, ...claimQueueFilters, ...billingStages];
const payerRows = computed(() => scopedOrganizations.value.flatMap(organization => {
  const grouped = new Map();
  for (const e of organization.enrollments || []) {
    const key = `${organization.id}:${e.officeId}:${e.providerNpi}:${e.payerId}`;
    const row = grouped.get(key) || { key, organization, officeId: e.officeId, providerNpi: e.providerNpi, payerId: e.payerId, claims: 'Not recorded', era: 'Not recorded', eligibility: 'Not recorded' };
    const field = { '1500': 'claims', era: 'era', elig: 'eligibility' }[e.type];
    if (field) row[field] = enrollmentLabel(e.status); grouped.set(key, row);
  }
  for(const e of organization.eft || []) {
    const matches=[...grouped.values()].filter(r=>r.payerId===e.payerId&&r.providerNpi===e.providerNpi);
    if(matches.length)for(const row of matches)row.eft=eftLabel(e);
    else {const key=`eft:${organization.id}:${e.id}`;grouped.set(key,{key,organization,officeId:e.officeId,providerNpi:e.providerNpi,payerId:e.payerId,claims:'Not recorded',era:'Not recorded',eligibility:'Not recorded',eft:eftLabel(e)});}
  }
  return [...grouped.values()];
}));
const connectionQueue = computed(() => scopedOrganizations.value.flatMap(organization => {
  const rows = (organization.enrollments || []).map((e, i) => ({ key: `${organization.id}:${i}`, organization, label: ({ '1500': 'Claims enrollment', era: 'ERA enrollment', elig: 'Eligibility enrollment' })[e.type] || 'Enrollment', payer: `${e.payerId} · Office #${e.officeId}`, status: enrollmentLabel(e.status), at: e.lastEventAt, section: 'payers' }));
  rows.push(...(organization.eft||[]).filter(e=>!e.identityCurrent||e.status!=='active_verified').map(e=>({key:`eft:${organization.id}:${e.id}`,organization,label:'EFT / direct deposit',payer:`${e.payerId} · NPI ${e.providerNpi}`,status:eftLabel(e),at:e.updatedAt,section:'payers'})));
  if (!organization.connection?.configured) rows.unshift({ key: `setup:${organization.id}`, organization, label: 'Clearinghouse setup', status: 'Credentials not configured', section: 'settings' });
  return rows;
}));
const reportBars = computed(() => [{ status: 'draft', label: 'Drafts', value: totals.value?.drafts || 0 }, { status: 'ready', label: 'Final checks required', value: totals.value?.ready || 0 }, { status: 'in_progress', label: 'In progress', value: totals.value?.progress || 0 }, { status: 'attention', label: 'Needs attention', value: totals.value?.attention || 0 }, { status: 'paid', label: 'Marked paid', value: totals.value?.paid || 0 }]);
const maxBar = computed(() => Math.max(1, ...reportBars.value.map(b => b.value)));
const initials = value => String(value || '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const logoUrl = value => value ? (/^\/assets\//.test(value) ? value : toUploadsUrl(value)) : null;
const companyName = id => organizations.value.find(o => o.id === Number(id))?.name || 'Organization';
const date = billingDate;
const clockTime = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const money = (cents, currency = 'USD') => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(cents || 0) / 100); } catch { return '—'; } };
const attentionCount = org => org.counts ? Number(org.counts.rejected || 0) + Number(org.counts.denied || 0) : '—';
const enrollmentLabel = value => ({ requested: 'Requested', started: 'Form issued', era_receiver_conflict: 'Action needed: transfer ERA receiver' })[value] || value || 'Unknown';
const eftLabel = e => !e.identityCurrent?'Billing identity needs review':({unverified:'Not verified',not_started:'Not enrolled',pending:'Pending',action_required:'Action needed',active_reported:'Deposits reported',active_verified:'Deposit verified by staff',suspended:'Suspended'}[e.status]||'Review required');
const eftSummary = org => !org.eft?'Awaiting setup':!org.eft.length?'Not recorded':`${org.eft.filter(e=>e.identityCurrent&&e.status==='active_verified').length} verified / ${org.eft.length}${org.eftHasMore?'+':''} recorded`;
const eraSummary = org => !capabilities.value.enrollments ? 'Awaiting setup' : (org.enrollments || []).some(e => e.type === 'era') ? 'View payer status' : 'Not recorded';
function setSection(value) { section.value = value; router.replace({ query: { ...route.query, billingSection: value, billingScope: scopeId.value } }); }
function changeStatus(value) { status.value = value; page.value = 1; }
function filterQueue(value) { queueMode.value = 'claims'; changeStatus(value); setSection('claims'); }
function applySearch() { search.value = searchInput.value; page.value = 1; }
function sortClaims(column) { sortDirection.value = sortBy.value === column && sortDirection.value === 'asc' ? 'desc' : 'asc'; sortBy.value = column; page.value = 1; }
function clientBillingLink(item) { const org = organizations.value.find(o => Number(o.id) === Number(item.agency_id)); return `${org?.slug ? `/${encodeURIComponent(org.slug)}` : ''}/admin/clients/${Number(item.client_id)}?tab=billing&agencyId=${Number(item.agency_id)}`; }
function selectCompany(org) { selectedCompanyId.value = org.id; }
function drillInto(org, area) { scopeId.value = String(org.id); selectedCompanyId.value = null; setSection(area); }
function openCompanyQueue(org, filter) { queueMode.value = 'claims'; changeStatus(filter); drillInto(org, 'claims'); }
async function reload() {
  const seq = ++loadSequence; loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/medical-billing/workspace', { params: { ...(scopeId.value !== 'all' ? { agencyId: scopeId.value } : {}), clientId: route.query.clientId || undefined, status: status.value, search: search.value, page: page.value, sortBy: sortBy.value, direction: sortDirection.value } });
    if (!active || seq !== loadSequence) return;
    organizations.value = data.organizations; claims.value = data.claims; total.value = data.total; capabilities.value = data.capabilities; updatedAt.value = data.updatedAt;
    // The server returns every authorized billing organization, even for a scoped query.
    // Resolve an all-company entry to the sole practice before opening its billing tools.
    if (scopeId.value === 'all' && data.organizations.length === 1) {
      scopeId.value = String(data.organizations[0].id);
      return;
    }
    if (initialClaimId) { const match = data.claims.find(c => Number(c.id) === initialClaimId || c.attempt_ids?.includes(initialClaimId)); initialClaimId = 0; if (match) await openClaim(match); }
  } catch (e) { if (active && seq === loadSequence) { error.value = e.response?.data?.error?.message || 'Billing data could not be loaded. Refresh to try again.'; organizations.value = []; claims.value = []; total.value = 0; } }
  finally { if (active && seq === loadSequence) loading.value = false; }
}
watch([scopeId, status, page, search, sortBy, sortDirection, () => route.query.clientId], () => { claims.value = []; closeClaim(); reload(); }, { immediate: true });
watch(scopeId, () => { page.value = 1; selectedCompanyId.value = null; router.replace({ query: { ...route.query, billingScope: scopeId.value, billingSection: section.value } }); });
watch(() => route.query.agencyId, id => { if (id && String(id) !== scopeId.value) scopeId.value = String(id); });
watch(() => route.query.billingScope, id => { if (id && String(id) !== scopeId.value) scopeId.value = String(id); });
watch(() => route.query.billingSection, value => { if (navigation.some(item => item.id === value)) section.value = value; });
watch(() => route.query.billingStatus, value => { status.value=validQueueStatus(value);page.value=1; });
watch(() => agencyStore.currentAgency?.id, () => { organizations.value = []; claims.value = []; scopeId.value = 'all'; reload(); });
async function openClaim(claim) { priorFocus = document.activeElement; selectedClaim.value = claim; showClientHistory.value = false; claimActionError.value = ''; await nextTick(); claimDialog.value?.focus(); if (workClaimId(claim)) await claimTools.value?.showHistory(workClaimId(claim)); }
async function submitReadySet() {
  const ids = claims.value.filter(item => workStage(item) === 'ready_to_submit' && workClaimId(item)).map(item => workClaimId(item));
  if (!ids.length || !scopedOrganization.value || submittingSet.value) return;
  if (!window.confirm(`Submit ${ids.length} ready claim${ids.length === 1 ? '' : 's'} for ${scopedOrganization.value.name}? A claim that fails a billing check stays in the queue.`)) return;
  submittingSet.value = true;
  submitSetResult.value = '';
  try {
    const { data } = await api.post('/medical-billing/claims/bulk-submit', { agencyId: scopedOrganization.value.id, claimIds: ids }, { skipGlobalLoading: true });
    submitSetResult.value = `${data.submitted?.length || 0} submitted. ${data.held?.length || 0} held.`;
    await reload();
  } catch (error) {
    submitSetResult.value = error.response?.data?.error?.message || 'The set could not be submitted.';
  } finally { submittingSet.value = false; }
}
async function prepareReadyClaim() {
  const item = selectedClaim.value;
  if (preparingClaim.value || !item?.canPrepareClaim || workStage(item) !== 'ready_to_submit') return;
  preparingClaim.value = true; claimActionError.value = '';
  try {
    const { data } = await api.post('/medical-billing/claims', { agencyId: Number(item.agency_id), clientId: Number(item.client_id), clinicalSessionId: Number(item.clinical_session_id), clinicalNoteId: Number(item.clinical_note_id) }, { skipGlobalLoading: true });
    if (!active || selectedClaim.value !== item) return;
    if (!data.claim?.id) throw new Error('The claim could not be opened. Refresh the queue before trying again.');
    selectedClaim.value = { ...item, ...data.claim, id: data.claim.id, claimId: data.claim.id, key: `claim:${data.claim.id}`, source: 'claim', stage: 'ready_to_submit', readOnly: false, canReviewClaim: true, canPrepareClaim: false };
    await nextTick(); await claimTools.value?.reviewClaim(Number(data.claim.id));
    await reload();
  } catch (error) { if (active && selectedClaim.value) claimActionError.value = error.response?.data?.error?.message || error.message || 'The claim could not be opened.'; }
  finally { preparingClaim.value = false; }
}
async function openResubmission(result) {
  if (!result?.claimId || !selectedClaim.value) return;
  const source = selectedClaim.value;
  selectedClaim.value = { ...source, id: Number(result.claimId), claimId: Number(result.claimId), key: `claim:${result.claimId}`, source: 'claim', claim_number: null, claim_reference: result.claimReference || result.claim_reference || source.claim_reference, claim_lifecycle: 'draft', stage: 'ready_to_submit', readOnly: false, canReviewClaim: true, canPrepareClaim: false, attempt_count: result.attemptNumber || Number(source.attempt_count || 1)+1, attempt_ids: [...new Set([...(source.attempt_ids || [workClaimId(source)]),Number(result.claimId)])], resubmission_type: result.kind, claim_frequency_code: result.frequencyCode, billing_revision: null };
  await nextTick(); await claimTools.value?.reviewClaim(Number(result.claimId)); await reload();
}
function trapClaimFocus(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeClaim(); return; }
  if (event.key !== 'Tab') return;
  const elements = [...claimDialog.value.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
  if (!elements.length) { event.preventDefault(); return; }
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === claimDialog.value)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function closeClaim() { selectedClaim.value = null; if (priorFocus?.isConnected) priorFocus.focus(); priorFocus = null; }
async function claimUpdated() { await reload(); if (selectedClaim.value) { const updated = claims.value.find(c => workItemKey(c) === workItemKey(selectedClaim.value)); if (updated) selectedClaim.value = updated; else closeClaim(); } }

const savedViewName = ref(''), savedViews = ref([]), savedKey = `billing-views:${authStore.user?.id || 'session'}`;
try { const saved = JSON.parse(localStorage.getItem(savedKey) || '[]'); if (Array.isArray(saved)) savedViews.value = saved.slice(0, 20); } catch { /* browser storage is optional */ }
function persistViews() { try { localStorage.setItem(savedKey, JSON.stringify(savedViews.value)); } catch { error.value = 'This browser could not save the view.'; } }
function saveView() { if (!savedViewName.value.trim()) return; savedViews.value = [...savedViews.value, { id: Date.now(), name: savedViewName.value.trim(), scope: scopeId.value, status: status.value }].slice(-20); savedViewName.value = ''; persistViews(); }
function removeView(id) { savedViews.value = savedViews.value.filter(v => v.id !== id); persistViews(); }
function restoreView(view) { if (view.scope !== 'all' && !organizations.value.some(o => String(o.id) === view.scope)) { error.value = 'You no longer have billing access to this saved scope.'; return; } scopeId.value = view.scope === 'all' && organizations.value.length === 1 ? String(organizations.value[0].id) : view.scope; filterQueue(queueTabs.some(t => t.id === view.status) || view.status === 'attention' ? view.status : 'all'); }
</script>

<style scoped>
.billing-shell{--bw-brand:var(--agency-primary-color,#285caa);--bw-on-brand:#fff;--bw-ink:var(--app-ink, #17263d);--bw-muted:var(--app-muted, #63718a);display:grid;grid-template-columns:210px minmax(0,1fr);min-height:calc(100vh - 100px);background:var(--app-surface-muted, #f4f7fb);color:var(--bw-ink);border:1px solid var(--app-line, #dfe6ef);border-radius:16px;overflow:hidden;font-size:14px}.billing-nav{background:#142233;color:#e7edf6;display:flex;flex-direction:column;padding:25px 14px;gap:34px}.brand-lockup{display:flex;align-items:center;gap:10px;overflow-wrap:anywhere}.brand-lockup img{width:40px;height:40px;object-fit:contain;background:var(--app-surface, #fff);border-radius:9px;padding:4px}.brand-lockup strong{font-size:15px}.brand-lockup small,.nav-footer small{display:block;color:#afc0d4;font-size:11px;margin-top:5px}.brand-monogram,.company-avatar{display:grid;place-items:center;background:var(--app-surface-muted, #e6eef9);color:var(--app-text-blue, #244e7b);width:35px;height:35px;border-radius:9px;flex-shrink:0;font-weight:700}.billing-nav nav{display:grid;gap:7px}.billing-nav nav button{display:flex;align-items:center;gap:12px;border:0;color:#c8d4e4;background:transparent;padding:13px 10px;text-align:left;border-radius:8px;font-weight:500}.billing-nav nav button.active{background:var(--bw-brand);color:var(--bw-on-brand)}nav svg{width:20px;height:20px;flex-shrink:0}.nav-footer{margin-top:auto;border-top:1px solid #33445a;padding-top:18px;font-size:12px}.access-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#80c9ad;margin-right:5px}.billing-main{padding:28px;min-width:0}.workspace-header,.panel-heading{display:flex;justify-content:space-between;align-items:center;gap:15px}.workspace-header{margin-bottom:24px}.eyebrow{font-size:10px;letter-spacing:.14em;font-weight:700;color:var(--bw-muted)}h1{font-size:29px;letter-spacing:-.025em;margin:5px 0 8px}h2{font-size:17px;margin:0 0 5px;letter-spacing:-.015em}h3{font-size:14px}p{line-height:1.5}.workspace-header p,.panel-heading p{margin:0;color:var(--bw-muted);font-size:13px}button,a,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.48;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--bw-brand);outline-offset:3px}input,select{border:1px solid var(--app-line, #d4deeb);border-radius:7px;padding:9px 11px;background:var(--app-surface, #fff);color:var(--bw-ink);max-width:100%}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;padding:9px 13px;border-radius:7px;font-weight:600;text-decoration:none;white-space:nowrap}.primary{background:var(--bw-brand);border:1px solid var(--bw-brand);color:var(--bw-on-brand)}.secondary{background:var(--app-surface, #fff);border:1px solid var(--app-line, #d4deeb);color:var(--bw-ink)}.wide{width:100%}.scope-bar{display:flex;align-items:center;gap:25px;background:var(--app-surface, #fff);border:1px solid var(--app-line, #dfe6ef);padding:15px 18px;border-radius:11px}.scope-bar label>span{display:block;font-size:11px;font-weight:600;margin-bottom:5px}.scope-bar select{min-width:230px}.scope-context{display:grid;gap:5px}.scope-context span,.timestamp{font-size:11px;color:var(--bw-muted)}.timestamp{margin-left:auto}.lifecycle{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:22px 0 13px}.lifecycle button{display:flex;align-items:center;text-align:left;gap:11px;background:transparent;border:0;color:var(--bw-ink)}.lifecycle b{background:var(--bw-brand);color:var(--bw-on-brand);width:33px;height:33px;border-radius:50%;display:grid;place-items:center}.lifecycle small{display:block;font-size:11px;color:var(--bw-muted);margin-top:4px}.lifecycle>span{color:var(--app-muted, #a3b0c1)}.acceptance-note{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--app-text-red, #795713);background:var(--app-surface-muted, #fff9e9);border:1px solid var(--app-line, #efe1bd);padding:10px 13px;border-radius:7px;margin-bottom:20px;flex-wrap:wrap}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:22px}.metric{display:flex;gap:13px;align-items:center;padding:17px 14px;text-align:left;border:1px solid var(--app-line, #dfe6ef);border-radius:10px;background:var(--app-surface, #fff);color:var(--bw-ink)}.metric small,.metric strong,.metric em{display:block}.metric small{font-size:11px;font-weight:600}.metric strong{font-size:29px;letter-spacing:-.03em;margin:3px 0}.metric em{font-size:10px;color:var(--bw-muted);font-style:normal}.metric-symbol{display:grid;place-items:center;width:40px;height:40px;flex-shrink:0;border-radius:12px;background:var(--app-surface-muted, #edf3ff);color:var(--app-text-blue, #315c9f);font-size:24px}.green{background:var(--app-surface-muted, #e5f5ee);color:var(--app-text-green, #227356)}.amber{background:var(--app-tint-amber, #fff4df);color:var(--app-text-red, #a26c1f)}.red{background:var(--app-surface-muted, #fcebed);color:var(--app-text-red, #b13b4d)}.panel{background:var(--app-surface, #fff);border:1px solid var(--app-line, #dfe6ef);border-radius:11px;padding:20px;margin-bottom:20px;min-width:0;box-shadow:0 2px 5px #22364b03}.panel-heading{margin-bottom:17px}.overview-layout.with-drawer{display:grid;grid-template-columns:minmax(0,1fr) 295px;gap:16px}.table-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px;text-align:left}th{background:var(--app-surface-muted, #f3f6fb);font-size:10px;color:var(--app-muted, #63718a);letter-spacing:.025em;font-weight:600;padding:12px 10px;white-space:nowrap}td{padding:14px 10px;border-bottom:1px solid var(--app-line, #edf0f5);vertical-align:middle}tbody tr:last-child td{border-bottom:0}tr.selected{background:var(--app-surface-muted, #f0f5fb)}.company-link{display:flex;gap:9px;align-items:center;text-align:left;background:none;border:0;color:var(--bw-ink);padding:0;font-size:12px}.company-link img{width:29px;height:29px;object-fit:contain}.company-avatar{width:29px;height:29px;font-size:10px}.count-link,.text-button{border:0;background:none;color:var(--bw-brand);padding:3px 0;font-weight:600;text-align:left}.danger-text{color:var(--app-text-red, #a93749)}.badge{display:inline-block;border-radius:5px;padding:5px 7px;font-size:10px;white-space:nowrap;font-weight:600}.neutral{background:var(--app-surface-muted, #eff2f6);color:var(--app-muted, #627189)}.danger{background:var(--app-surface-muted, #fcecee);color:var(--app-text-red, #a32c43)}.warning{background:var(--app-tint-amber, #fff3dc);color:var(--app-text-red, #875a0d)}.success{background:var(--app-surface-muted, #e4f6eb);color:var(--app-text-green, #226940)}.info{background:var(--app-surface-muted, #eaf1fd);color:var(--app-text-blue, #315898)}.subtle,.panel-note{color:var(--bw-muted);font-size:12px;line-height:1.6}.panel-note{background:var(--app-surface-muted, #f7f9fc);border-radius:7px;padding:11px;margin:15px 0 0}.drawer-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}.drawer-stats>div{border:1px solid var(--app-line, #e3e9f2);border-radius:8px;padding:15px}.drawer-stats strong{display:block;font-size:24px}.drawer-stats span{font-size:10px;color:var(--bw-muted)}.icon-button{border:0;background:transparent;color:var(--app-muted, #66778f);font-size:23px;padding:4px 8px}.action-row{width:100%;background:transparent;border:0;border-bottom:1px solid var(--app-line, #eef1f5);text-align:left;padding:13px 0;display:flex;justify-content:space-between;color:var(--bw-ink);font-size:12px}.search{display:flex;gap:7px}.search input{min-width:140px;width:220px;font-size:12px}.queue-tabs{display:flex;gap:18px;border-bottom:1px solid var(--app-line, #e2e8f1);overflow-x:auto;margin-bottom:5px}.queue-tabs button{border:0;background:none;border-bottom:2px solid transparent;white-space:nowrap;padding:11px 0;font-size:12px;color:var(--bw-muted)}.queue-tabs button.active{color:var(--bw-brand);border-color:var(--bw-brand);font-weight:600}.cell-detail{display:block;color:var(--bw-muted);font-size:10px;margin-top:4px}.empty-state{text-align:center;padding:35px 20px;color:var(--bw-muted);font-size:13px;line-height:1.7}.empty-state p{max-width:620px;margin:10px auto}.pagination{display:flex;justify-content:space-between;align-items:center;padding-top:15px;color:var(--bw-muted);font-size:11px}.pagination>div{display:flex;gap:7px}.panel-toolbar{display:flex;gap:12px;align-items:center;margin:15px 0;flex-wrap:wrap}.panel-toolbar label,.inline-scope{font-size:12px}.reconciliation-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}.reconciliation-steps>div{border:1px solid var(--app-line, #e1e8f0);padding:17px;border-radius:8px}.reconciliation-steps b{display:grid;place-items:center;border-radius:50%;width:30px;height:30px;background:var(--app-surface-muted, #eaf1f8);color:var(--app-muted, #546983)}.status-chart{display:grid;gap:14px;max-width:800px;margin:25px 0}.status-chart button{display:grid;grid-template-columns:140px 1fr 40px;align-items:center;gap:20px;font-size:12px;text-align:left;background:none;border:0;color:var(--bw-ink)}.bar-track{height:16px;background:var(--app-surface-muted, #f0f3f8);border-radius:4px;overflow:hidden}.bar-track i{display:block;height:100%;background:var(--bw-brand);border-radius:4px}.saved-view{display:flex;justify-content:space-between;border-bottom:1px solid var(--app-line, #e5eaf2);padding:6px}.error-banner{background:var(--app-surface-muted, #fff0f0);border:1px solid var(--app-line, #f1cccc);color:var(--app-text-red, #9c2d3a);padding:12px;border-radius:8px}.claim-overlay{position:fixed;inset:0;background:#13223870;z-index:1200;display:flex;justify-content:flex-end}.claim-drawer{width:min(1000px,100%);background:var(--app-surface, #fff);padding:24px;overflow:auto;box-shadow:-15px 0 45px #13223820}.claim-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:16px;background:var(--app-surface-muted,#f4f7fb);border-radius:10px}.claim-facts dt{font-size:11px;color:var(--bw-muted)}.claim-facts dd{margin:5px 0 0;font-weight:600}.claim-drawer>.panel-heading{position:sticky;top:-24px;background:var(--app-surface,#fff);padding:16px 0;z-index:2}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(min-width:1500px){.billing-main{padding:30px 32px}}@media(max-width:1200px){.billing-shell{grid-template-columns:175px minmax(0,1fr)}.billing-main{padding:20px}.overview-layout.with-drawer{grid-template-columns:1fr}.company-drawer{order:-1}.metric-grid{grid-template-columns:repeat(2,1fr)}.scope-context{display:none}.single-agency .scope-context{display:grid}.timestamp{display:none}.reconciliation-steps{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.billing-shell{display:block}.billing-nav{padding:12px;gap:12px}.brand-lockup,.nav-footer{display:none}.billing-nav nav{display:flex;overflow-x:auto}.billing-nav nav button{white-space:nowrap;font-size:12px;padding:10px}.billing-nav nav svg{display:none}.billing-main{padding:15px}.workspace-header{align-items:flex-start}h1{font-size:24px}.scope-bar select{min-width:0;width:100%}.scope-bar label{width:100%}.lifecycle{gap:5px}.lifecycle button{display:block;font-size:11px}.lifecycle b{margin-bottom:5px}.lifecycle small{display:none}.panel-heading{align-items:flex-start;flex-direction:column}.search{width:100%}.search input{width:100%}.metric{padding:12px;gap:8px}.metric-symbol{display:none}.metric strong{font-size:24px}.panel{padding:15px}.reconciliation-steps{grid-template-columns:1fr 1fr}.status-chart button{grid-template-columns:95px 1fr 25px;gap:10px}.pagination{gap:10px}.claim-drawer{padding:15px}.claim-facts{grid-template-columns:1fr 1fr}}
</style>
