<template>
  <section class="claimmd-workspace">
    <template v-if="section !== 'detail'">
    <h2>Claim.MD connection</h2>
    <p><strong>{{ connection.configured ? 'Connected configuration' : 'Not configured' }}</strong>
      · {{ connection.mode === 'live' ? 'LIVE ACCOUNT' : connection.mode === 'test' ? 'TEST ACCOUNT' : 'Transmission disabled' }}</p>
    <p v-if="connection.configured && connection.mode === 'disabled'">Payer enrollment setup is available. Claim transmission stays disabled until launch checks are complete.</p>
    <p>Claims require your review here. Keep “Transmit Approval Required” enabled in Claim.MD during initial submissions; portal approval may also be required.</p>
    <div class="actions">
      <button :disabled="busy || !connection.configured" @click="sync">Sync claim responses</button>
      <button :disabled="busy || !connection.configured" @click="loadEnrollments">Refresh enrollment progress</button>
      <a href="https://www.claim.md/" target="_blank" rel="noopener noreferrer">Open Claim.MD</a>
    </div>
    </template>
    <ProviderBillingRollout v-if="section !== 'detail'" :key="agencyId" :fetch-policy="fetchRollout" :save-entry="saveRollout" />
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }} <button v-if="activeClaimId && /billing office/i.test(error) && !draft" type="button" :disabled="busy || readOnly" @click="editClaim(activeClaimId)">Select billing office</button></p>
    <ClaimServiceChangesPanel v-if="!readOnly && (historyClaimId || review?.claimId || draft?.claim?.id)" :agency-id="agencyId" :claim-id="Number(historyClaimId || review?.claimId || draft?.claim?.id)" @updated="review=null; approved=false; emit('updated')" />

    <template v-if="['all', 'claims'].includes(section)">
    <h3>Signed notes awaiting a claim</h3>
    <button :disabled="busy" @click="loadUndrafted">Check for missing claim drafts</button>
    <ul><li v-for="note in undrafted" :key="note.id">Note #{{ note.id }} · Client #{{ note.client_id }} · {{ note.service_code || 'Review service code' }} <button :disabled="busy" @click="createDraft(note)">Prepare claim from note</button></li></ul>

    </template>
    <template v-if="['all', 'payers'].includes(section)">
    <h3>Payer enrollment</h3>
    <section aria-label="Requested payer setup">
      <h4>Agency payer setup list</h4>
      <p>Confirm the exact plan and electronic payer ID from the member card and payer directory. Claims, ERA and eligibility are enrolled separately for the selected billing group.</p>
      <label>Search agency payers <input v-model="setupSearch" placeholder="Payer name, alias, or ID" /></label>
      <p>{{ filteredPayerRequests.length }} of {{ payerRequests.length }} payer setup records. Directory availability is not enrollment, network participation, or verified member coverage.</p>
      <div class="payer-catalog"><table v-if="payerRequests.length"><thead><tr><th>Payer / aliases</th><th>Electronic route</th><th>Claims</th><th>ERA</th><th>Eligibility</th><th>Next step</th></tr></thead><tbody>
        <tr v-for="request in filteredPayerRequests" :key="request.id">
          <td><strong>{{ request.payer_name }}</strong><small v-if="sourceAliases(request).length">Also listed as {{ sourceAliases(request).join(', ') }}</small></td>
          <td>{{ request.claimmd_payer_id || 'Needs review' }}<small v-if="request.directory_name">{{ request.directory_name }}</small><small v-if="request.source_payer_id && request.source_payer_id !== request.claimmd_payer_id">Previous EHR ID: {{ request.source_payer_id }}</small><small>{{ directoryStatusLabel(request.directory_status) }}</small></td>
          <td>{{ capabilityLabel(request,'1500_claims') }}</td><td>{{ capabilityLabel(request,'era') }}</td><td>{{ capabilityLabel(request,'eligibility') }}</td>
          <td><button :disabled="busy || !connection.configured" @click="reviewPayerRequest(request)">Review route</button><small>{{ request.review_note || 'Select the correct plan and billing office.' }}</small><small v-if="request.directory_checked_at">Directory checked {{ String(request.directory_checked_at).slice(0,10) }}</small></td>
        </tr>
      </tbody></table></div>
      <details><summary>Payer not in the directory? Request manual setup</summary><form class="actions" @submit.prevent="addPayerRequest"><label>Payer name <input v-model="requestedPayer" required minlength="2" maxlength="120" /></label><button :disabled="busy">Request manual setup</button></form></details>
      <p>Being on this list does not establish contracting, electronic enrollment or active coverage. Enrollment progress appears below.</p>
    </section>
    <h4>Add a payer from Claim.MD’s directory</h4>
    <p>Find the exact plan, add its electronic route to this agency, then open enrollment for the selected billing group. Claims, ERA and eligibility have separate requirements.</p>
    <form class="actions" data-testid="payer-directory-search" @submit.prevent="searchPayers">
      <label>Search by <select v-model="searchBy"><option value="name">Payer name</option><option value="id">Electronic payer ID</option></select></label>
      <label>{{ searchBy === 'id' ? 'Payer ID' : 'Payer name' }} <input v-model="search" :minlength="searchBy === 'id' ? 1 : 2" maxlength="64" required /></label>
      <button :disabled="busy || !connection.configured">Find payers</button>
    </form>
    <label>Billing office / group
      <select v-model="billingOfficeId" data-testid="billing-office">
        <option value="">Select a billing office</option>
        <optgroup v-for="group in billingGroups" :key="group.npi" :label="`Group NPI ${group.npi || 'missing'}`"><option v-for="office in group.offices" :key="office.id" :value="office.id">{{ office.name }} · {{ office.practice_name }}</option></optgroup>
      </select>
    </label>
    <section v-if="selectedOffice" class="review" aria-label="Enrollment prefill">
      <strong>{{ selectedOffice.practice_name }} · NPI {{ selectedOffice.practice_npi }}</strong>
      <p>{{ selectedOffice.street_address }}, {{ selectedOffice.city }}, {{ selectedOffice.state }} {{ selectedOffice.postal_code }}</p>
      <p>The form uses this billing address, the agency’s saved tax ID, and your contact details. Review the completed fields in Claim.MD. Provider validation or an authorized signature may still be required.</p>
      <p v-if="sameGroupOfficeCount > 1">{{ sameGroupOfficeCount }} offices share this group NPI. Review existing enrollment before starting another request; only enroll locations separately when the payer requires it.</p>
    </section>
    <p>Enrollment applies to this agency’s Tax ID and selected group NPI. Complete payer contracting separately; an electronic enrollment update does not establish network participation.</p>
    <label>Transaction
      <select v-model="enrollmentType"><option value="1500">Professional claims</option><option value="era">ERA / remittance</option><option value="elig">Eligibility</option></select>
    </label>
    <label v-if="enrollmentType === 'era'"><input v-model="acknowledgeEraRouting" type="checkbox" /> I understand ERA enrollment can redirect remittances from an existing clearinghouse.</label>
    <ul>
      <li v-for="payer in payers" :key="payer.payerid">
        <strong>{{ payer.payer_name }}</strong> · {{ payer.payerid }}
        <span> · Claims: {{ payer['1500_claims'] }} · ERA: {{ payer.era }} · Eligibility: {{ payer.eligibility }}</span>
        <button :disabled="busy" @click="addDirectoryPayer(payer)">{{ isAgencyPayer(payer) ? 'Refresh directory details' : 'Add to agency' }}</button>
        <button :disabled="busy || !canEnroll || transactionUnavailable(payer)" @click="openPayerEnrollment(payer)">{{ existingEnrollment(payer) ? 'Continue enrollment' : 'Open enrollment' }}</button>
        <small v-if="existingEnrollment(payer)">Existing form uses {{ billingOffices.find(o=>Number(o.id)===Number(existingEnrollment(payer).billing_office_location_id))?.name || 'its saved billing office' }}. Continue opens that billing identity.</small>
        <small v-if="transactionUnavailable(payer)">The directory does not support this transaction. Use the payer’s manual process.</small>
        <small v-else-if="transactionAvailable(payer)">The directory lists this transaction as available. The form shows any remaining provider requirements.</small>
      </li>
    </ul>
    <table v-if="enrollments.length">
      <thead><tr><th>Payer ID</th><th>Billing office / NPI</th><th>Transaction</th><th>Progress</th><th>Last update</th><th></th></tr></thead>
      <tbody><tr v-for="item in enrollments" :key="item.id"><td>{{ item.payer_id }}</td><td>{{ billingOffices.find(o => o.id === item.billing_office_location_id)?.name || 'Office unavailable' }} · {{ item.provider_npi }}</td><td>{{ item.enrollment_type }}</td><td>{{ enrollmentStatus(item.status) }}</td><td>{{ item.last_event_at || 'Awaiting Claim.MD update' }}</td><td><button :disabled="busy" @click="reopenEnrollment(item)">View / continue</button></td></tr></tbody>
    </table>
    <p v-else>No enrollments started from this app yet.</p>

    </template>
    <section v-if="draft" class="review" aria-label="Edit existing claim draft">
      <h3>Edit billing fields · {{ draft.claim.claim_reference || `Claim #${draft.claim.id}` }}</h3>
      <p v-for="warning in draft.feeWarnings || []" :key="warning" class="error" role="status">{{ warning }}</p>
      <section v-if="draft.approvedClinicalVersion || draft.approvedClinicalVersionError" class="clinical-reconciliation" aria-label="Approved clinical version for this claim">
        <template v-if="draft.approvedClinicalVersion">
          <h4>Approved clinical version {{ draft.approvedClinicalVersion.revisionNumber }}</h4>
          <p>Date of service: {{ String(draft.approvedClinicalVersion.dateOfService || '').slice(0, 10) }} · Place of service: {{ draft.approvedClinicalVersion.placeOfService }}</p>
          <ol aria-label="Approved diagnosis positions"><li v-for="(code, index) in draft.approvedClinicalVersion.diagnosisCodes" :key="`${index}-${code}`">{{ code }}</li></ol>
          <ul aria-label="Approved service lines"><li v-for="(line, index) in draft.approvedClinicalVersion.lines" :key="index">{{ line.procedureCode }} · {{ line.units }} unit(s)</li></ul>
          <p v-if="draft.clinicalVersionChanged">This claim differs from the approved clinical version. Review every approved service, charge, modifier and diagnosis pointer to update this same unsent draft.</p>
          <p v-else>The draft matches the approved clinical service context.</p>
          <p v-if="reconciliationBlocked" class="error" role="status">{{ reconciliationBlocked }}</p>
          <button v-if="draft.clinicalVersionChanged && !reconciling" type="button" data-testid="review-approved-version" :disabled="busy || !canReconcile" @click="startReconciliation">Review approved version for this draft</button>
        </template>
        <p v-else class="error" role="status">{{ draft.approvedClinicalVersionError }}</p>
        <form v-if="reconciling" data-testid="clinical-reconciliation-form" @submit.prevent="saveClinicalReconciliation">
          <p>Applying version {{ reconciliationPlan.revisionNumber }} keeps {{ draft.claim.claim_reference || `Claim #${draft.claim.id}` }} as a draft. A fresh claim review is required before any later submission.</p>
          <fieldset :disabled="busy"><legend>Explicit billing review for every approved service</legend>
            <article v-for="(line, index) in reconciliationLines" :key="index">
              <strong>{{ line.procedureCode }} · {{ line.units }} unit(s)</strong>
              <label>Total line charge in dollars<input v-model="line.dollars" :data-testid="`reconcile-charge-${index}`" type="number" min="0.01" max="1000000" step="0.01" required /></label>
              <label>Modifiers (comma separated; leave blank when none apply)<input v-model="line.modifiers" :data-testid="`reconcile-modifiers-${index}`" maxlength="40" /></label>
              <label>Diagnosis pointers (positions in the approved diagnosis list above)<input v-model="line.diagnosisPointers" :data-testid="`reconcile-pointers-${index}`" placeholder="1 or 1,2" required pattern="(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2])){0,3}" /></label>
            </article>
            <label>Reason for applying the approved version<textarea v-model="reconciliationReason" data-testid="reconcile-reason" minlength="10" maxlength="2000" required /></label>
            <label><input v-model="reconciliationAttested" data-testid="reconcile-attestation" type="checkbox" :disabled="reconciliationStale" /> I reviewed this approved clinical version, every listed service, charge, modifier and diagnosis pointer. I authorize updating this existing unsent draft for a fresh billing review.</label>
          </fieldset>
          <p v-if="reconciliationStale" class="error" role="status">Reload the draft and review its current clinical version before saving again.</p>
          <div class="actions"><button type="submit" data-testid="apply-approved-version" :disabled="busy || !validReconciliation">Apply approved version to this draft</button><button type="button" :disabled="busy" @click="cancelReconciliation">Cancel version review</button><button v-if="reconciliationStale" type="button" :disabled="busy" @click="editClaim(draft.claim.id)">Reload draft</button></div>
        </form>
      </section>
      <p v-if="!canEditDraft && !reconciliationBlocked" class="error">This claim cannot be edited in its current clearinghouse state. Use the payer correction and follow-up workflow.</p>
      <form v-if="!reconciling && canEditDraft" @submit.prevent="saveCorrection">
      <p>Service codes and units come from the clinical record. Billing edits leave the signed note unchanged.</p>
      <label class="claim-office-label">Billing office / group
        <select v-model.number="draft.billingOfficeId" data-testid="claim-billing-office" required @change="selectClaimOffice">
          <option :value="null">Select a billing office</option>
          <option v-for="office in draft.billingOffices || []" :key="office.id" :value="office.id" :disabled="!!office.configuration_error">{{ office.name }} · {{ office.practice_name || 'Practice' }} · {{ office.configuration_error ? 'Group NPI mapping needs review' : `NPI ${office.practice_npi || 'Not configured'}` }}</option>
        </select>
      </label>
      <p v-if="!(draft.billingOffices || []).length" class="error" role="status">No billing office is configured for this practice. Add an agency-owned billing office in Billing settings.</p>
      <p v-else-if="draft.billingOfficeError && !draft.billingOfficeId" class="error" role="status">{{ draft.billingOfficeError }} Select the correct office for this claim.</p>
      <p class="billing-office-help">The selected office supplies the claim's billing identity and address. A school, home, or telehealth site is the place of service only. It is not the billing address. Your correction reason is recorded with this claim.</p>
      <label>Place of service <input v-model="draft.claim.place_of_service" required pattern="[0-9]{2}" maxlength="2" /></label>
      <label>Billing NPI <input v-model="draft.claim.billing_npi" required pattern="[0-9]{10}" maxlength="10" /></label>
      <label>Rendering NPI <input v-model="draft.claim.rendering_npi" required pattern="[0-9]{10}" maxlength="10" /></label>
      <label>Taxonomy <input v-model="draft.claim.taxonomy_code" maxlength="10" /></label>
      <div v-for="line in draft.lines" :key="line.id">
        <strong>{{ line.procedure_code }} · {{ line.units }} units</strong>
        <label>Total line charge in dollars <input v-model="line.dollars" type="number" min="0.01" max="1000000" step="0.01" required /></label>
        <label>Modifiers (comma separated) <input v-model="line.modifiers" /></label>
      </div>
      <label>Reason for correction <textarea v-model="correctionReason" required maxlength="1000"></textarea></label>
      <button :disabled="busy">Save for review</button> <button type="button" @click="draft = null">Cancel</button>
      </form>
      <button v-if="!reconciling && !canEditDraft" type="button" :disabled="busy" @click="draft = null">Close draft</button>
    </section>

    <section v-if="review" class="review" aria-label="Claim review">
      <h3>Review {{ review.claimReference || `claim #${review.claimId}` }}</h3>
      <p class="review-status" role="status">{{ review.readiness.ready ? 'All submission checks complete. Review and approve below.' : `${review.readiness.blockers.length} requirement${review.readiness.blockers.length === 1 ? '' : 's'} remain before submission.` }} <span v-if="review.aiReview?.status === 'passed'">AI consistency review completed.</span></p>
      <button type="button" :disabled="busy" @click="run(reloadReview)">Refresh claim requirements</button>
      <p>Session #{{ review.clinicalSessionId }} · Signed note #{{ review.clinicalNoteId }} · {{ review.lifecycle }}</p>
      <p v-if="review.payload"><strong>{{ review.payload.pat_name_f }} {{ review.payload.pat_name_l }}</strong> · {{ review.payload.payer_name }} · Member {{ review.payload.ins_number }}</p>
      <p v-if="review.payload">Billing NPI {{ review.payload.bill_npi }} · Rendering NPI {{ review.payload.prov_npi }}</p>
      <div v-if="review.payload?.facility_npi" class="facility-identity" aria-label="Service facility on claim">
        <strong>Service facility: {{ review.payload.facility_name }}</strong>
        <div>{{ review.payload.facility_addr_1 }}<template v-if="review.payload.facility_addr_2"> · {{ review.payload.facility_addr_2 }}</template></div>
        <div>{{ review.payload.facility_city }}, {{ review.payload.facility_state }} {{ review.payload.facility_zip }}</div>
        <div>NPI {{ review.payload.facility_npi }} (matches billing NPI for CCHA)</div>
      </div>
      <section v-if="review.supervision" class="review">
        <h4>Who delivered and oversaw the service</h4>
        <p>Treating clinician: {{ providerLabel(review.supervision.serviceProvider) }}</p>
        <p v-if="review.supervision.supervisingProvider">Overseeing clinician: {{ providerLabel(review.supervision.supervisingProvider) }}</p>
        <p>Claim rendering provider: {{ providerLabel(review.supervision.renderingProvider) }}</p>
        <p v-if="review.supervision.cosignPending">Supervisor cosign is still outstanding. Submission follows the applicable supervision and payer policy.</p>
        <p v-if="review.supervision.npi2027">January 2027 individual service-provider NPI requirement applies.</p>
        <p v-if="review.supervision.rule">Policy basis: {{ review.supervision.rule.reference }} · {{ review.supervision.rule.effectiveFrom }}–{{ review.supervision.rule.effectiveThrough }}</p>
      </section>
      <section v-if="review.clientId" class="review-tasks" aria-label="Complete claim requirements" @input="approved=false" @change="approved=false">
        <h4>Complete review for service date {{ formatBillingDate(review.dateOfService) }}</h4>
        <p>Saved insurance details, dated coverage verification and screening documents are separate checks. Each save rechecks this claim.</p>
        <p v-if="review.readiness.payloadIssue" class="error" role="status">{{ claimIssueText(review.readiness.payloadIssue) }}</p>
        <div class="actions">
          <button type="button" :disabled="busy" :aria-expanded="reviewTask==='insurance'" @click="toggleReviewTask('insurance')">Insurance &amp; identity · {{ review.readiness.insuranceIdentityVerified ? 'Reviewed' : 'Needs review' }}</button>
          <button type="button" :disabled="busy" :aria-expanded="reviewTask==='coverage'" @click="toggleReviewTask('coverage')">Coverage for {{ formatBillingDate(review.dateOfService) }} · {{ review.readiness.coverageVerified ? 'Verified' : 'Needs review' }}</button>
          <button v-if="review.readiness.clientDocumentation" type="button" :disabled="busy" :aria-expanded="reviewTask==='documents'" @click="toggleReviewTask('documents')">{{ review.readiness.clientDocumentation.scope==='screening' ? 'Screening' : 'Treatment' }} documents · {{ review.readiness.clientDocumentation.ready ? 'Verified' : 'Needs review' }}</button>
          <button v-if="review.supervision?.supervisingProvider" type="button" :disabled="busy" :aria-expanded="reviewTask==='policy'" @click="toggleReviewTask('policy')">Payer / product provider mapping · {{ review.readiness.payerPolicyVerified ? 'Verified' : 'Needs setup' }}</button>
          <button type="button" :disabled="busy" @click="editClaim(review.claimId)">Edit claim billing fields</button>
        </div>
        <div v-if="reviewTask" ref="reviewTaskPanel" class="requirement-editor" tabindex="-1" :aria-label="reviewTaskLabels[reviewTask]">
        <h4>{{ reviewTaskLabels[reviewTask] }}</h4>
        <ClientInsuranceEditor v-if="reviewTask==='insurance'" :key="`${agencyId}:${review.clientId}`" :client-id="review.clientId" :agency-id="agencyId" start-open :show-related-reviews="false" @saved="run(reloadReview)" />
        <ClientCoverageVerification v-if="reviewTask==='coverage'" :client-id="review.clientId" :agency-id="agencyId" :service-date="String(review.dateOfService).slice(0,10)" :billing-office-id="review.billingOffice?.id" @saved="run(reloadReview)" />
        <ClientDocumentationReadiness v-if="reviewTask==='documents' && review.readiness.clientDocumentation" :agency-id="agencyId" :client-id="review.clientId" :scope="review.readiness.clientDocumentation.scope" :service-date="String(review.dateOfService).slice(0,10)" @saved="run(reloadReview)" />
        <template v-if="reviewTask==='policy'">
          <p>Match the policy to this client’s saved payer ID and plan type: {{ review.readiness.payer?.payerId || 'Payer ID missing' }} · {{ review.readiness.payer?.planType || 'Plan type missing — enter the verified plan type in Insurance & identity first.' }}. Confirm the applicable rule for {{ formatBillingDate(review.dateOfService) }}.</p>
          <SupervisedPayerPolicies :agency-id="agencyId" :payer-id="review.readiness.payer?.payerId" :plan-type="review.readiness.payer?.planType" @saved="run(reloadReview)" />
        </template>
        </div>
      </section>
      <section v-if="review.aiReview" ref="aiReviewPanel" tabindex="-1" class="review" aria-label="AI content review">
        <h4>AI content &amp; claim consistency</h4>
        <p>{{ { required: 'Review required for the current note and claim', needs_review: 'Findings need resolution', passed: 'Current review completed' }[review.aiReview.status] }}</p>
        <p>Checks clinical content against billing fields. Identity and insurance verification remain separate. Any relevant edit requires a fresh review.</p>
        <p v-if="!review.payload">Complete the claim fields above before running AI review.</p>
        <button :disabled="busy || !review.payload" @click="runAiReview">{{ busy ? 'Working…' : 'Run AI consistency review' }}</button>
        <article v-for="finding in review.aiReview.findings" :key="finding.id">
          <strong>{{ finding.severity }} · {{ finding.category.replaceAll('_', ' ') }}</strong><p>{{ finding.message }}</p>
          <p v-if="finding.resolution">Exception recorded: {{ finding.resolution.reason }} · {{ finding.resolution.policyReference }}</p>
          <button v-else-if="['place_of_service','modifiers'].includes(finding.category)" :disabled="busy" @click="exceptionFinding = finding; exceptionReason = ''; exceptionReference = ''">Document payer exception</button>
          <p v-else-if="finding.severity === 'blocker'">Correct the clinical record through an amendment/addendum, then rerun review.</p>
        </article>
        <form v-if="exceptionFinding" @submit.prevent="saveAiException">
          <label>Why this claim follows the payer rule<textarea v-model="exceptionReason" required minlength="10" maxlength="1000" /></label>
          <label>Payer policy / support reference<input v-model="exceptionReference" required minlength="5" maxlength="1000" /></label>
          <button :disabled="busy">Record exception</button><button type="button" @click="exceptionFinding = null">Cancel</button>
        </form>
      </section>
      <details v-if="review.appliedOverrides?.length"><summary>Applied billing overrides</summary><p v-for="override in review.appliedOverrides" :key="override.overrideId">{{ override.field }}: {{ override.from }} → {{ override.to }} · {{ override.reason }} · {{ override.policyReference }}</p></details>
      <form v-if="review.lifecycle === 'rejected'" class="clinical-reconciliation" @submit.prevent="savePosOverride">
        <h4>Set a place-of-service override</h4>
        <p>This changes the claim sent to the payer. The note keeps the location the provider recorded.</p>
        <label>Send this POS instead<input v-model="posOverride.to" required pattern="[0-9]{2}" maxlength="2" /></label>
        <label>Plan type<input v-model="posOverride.planType" maxlength="100" placeholder="Any plan" /></label>
        <label>Why<textarea v-model="posOverride.reason" required minlength="10" maxlength="1000" /></label>
        <label>Policy reference<input v-model="posOverride.reference" required minlength="5" maxlength="1000" /></label>
        <button :disabled="busy">Save payer override</button>
      </form>
      <p v-if="review.serviceSite?.name || review.serviceSite?.placeOfService">Service site: {{ review.serviceSite.name || 'Place of service' }}<template v-if="review.serviceSite.placeOfService"> · POS {{ review.serviceSite.placeOfService }}</template><template v-if="review.serviceSite.serviceAddress"> · {{ review.serviceSite.serviceAddress }}</template>. This is where the visit happened. The claim is billed from the office below.</p>
      <template v-if="review.payload">
      <p v-if="review.billingOffice">Billing office: {{ review.billingOffice.name }} · {{ review.payload.bill_name }} · {{ review.payload.bill_addr_1 }}, {{ review.payload.bill_city }}, {{ review.payload.bill_state }} {{ review.payload.bill_zip }}</p>
      <div class="claim-charge-table" tabindex="0" role="region" aria-label="Claim service lines"><table><thead><tr><th>Service date</th><th>Code</th><th>Modifiers</th><th>Units</th><th>POS</th><th>Charge</th></tr></thead>
        <tbody><tr v-for="(line, index) in review.payload.charge" :key="index"><td>{{ line.from_date }}</td><td>{{ line.proc_code }}</td><td>{{ [line.mod1,line.mod2,line.mod3,line.mod4].filter(Boolean).join(', ') }}</td><td>{{ line.units }}</td><td>{{ line.place_of_service }}</td><td>${{ line.charge }}</td></tr></tbody>
      </table></div>
      <p><strong>Total: ${{ review.payload.total_charge }}</strong></p>
      <details><summary>Full claim details</summary><pre>{{ JSON.stringify(review.payload, null, 2) }}</pre></details>
      </template>
      <section v-if="review.readiness.blockers.length" class="requirement-checklist" aria-label="Remaining claim requirements">
        <h4>Complete these requirements before submitting</h4>
        <p>Work through these in order. Each button opens the relevant review above; saving refreshes this list.</p>
        <ul>
          <li v-for="item in claimRequirements" :key="item.message" class="requirement-item">
            <div><strong>{{ item.message }}</strong><p v-if="item.action">{{ item.action.detail }}</p></div>
            <button v-if="item.action && review.clientId" type="button" :disabled="busy" @click="openRequirement(item.action.task)">{{ item.action.label }}</button>
          </li>
        </ul>
      </section>
      <aside v-if="review.readiness.warnings.length" class="claim-warnings" aria-label="Claim advisories">
        <h4>Advisories — these do not block submission</h4>
        <ul><li v-for="warning in review.readiness.warnings" :key="warning">{{ warning }}</li></ul>
      </aside>
      <p v-if="connection.practiceSubmission">Practice submit records this claim in the app. Nothing is sent to Claim.MD or a payer.</p>
      <label><input v-model="approved" type="checkbox" /> {{ connection.practiceSubmission ? 'I reviewed the patient, coverage, providers, service lines and charges. This practice submit stays in the app.' : `I reviewed the patient, coverage, providers, service lines and charges for this ${connection.mode} account.` }}</label>
      <div class="actions"><button :disabled="busy || !approved || !review.readiness.ready || !['draft','ready','rejected'].includes(review.lifecycle) || !(connection.practiceSubmission || ['test','live'].includes(connection.mode))" @click="submit">{{ connection.practiceSubmission ? 'Approve practice submit' : `Approve and submit ${connection.mode === 'live' ? 'LIVE claim' : 'test claim'}` }}</button><button :disabled="busy" @click="review = null">Close review</button></div>
    </section>

    <section v-if="historyClaimId" class="review claim-timeline" aria-label="Claim history">
      <h3>{{ historyMeta.claimReference || `Claim #${historyClaimId}` }} · Claim history</h3>
      <p>One claim, listed in chronological order. Submission attempts and their responses remain on record.</p>
      <p v-if="historyMeta.patientControlNumber && historyMeta.claimReference !== historyMeta.patientControlNumber">Earlier payer reference: {{ historyMeta.patientControlNumber }}. Retained for matching previously submitted claims.</p>
      <details v-if="historyMeta.attempts?.length > 1"><summary>Submission attempts and earlier references ({{ historyMeta.attempts.length }})</summary><ul><li v-for="attempt in historyMeta.attempts" :key="attempt.id">Attempt {{ attempt.number }} · {{ claimStatusLabel(attempt.lifecycle) }}<template v-if="attempt.submittedAt"> · {{ formatBillingTimestamp(attempt.submittedAt) }}</template><template v-if="attempt.payerReference"> · Sent reference {{ attempt.payerReference }}</template></li></ul></details>
      <button v-if="historyMeta.nextBefore" type="button" :disabled="busy" @click="loadEarlierHistory">Load earlier history</button>
      <p v-if="!history.length">No clearinghouse activity yet.</p>
      <article v-for="event in history" :key="event.id">
        <small v-if="event.attemptNumber">Attempt {{ event.attemptNumber }} · </small>
        <strong>{{ claimHistoryLabel(event.type) }}</strong> · {{ clearinghouseStatusLabel(event.status) || event.status || 'Recorded' }} · {{ formatBillingTimestamp(event.createdAt) }} · {{ event.actorName || (event.actorUserId ? `User #${event.actorUserId}` : 'System / clearinghouse') }}
        <p v-if="event.authorization" class="authorization-line">Based on rule {{ event.authorization.ruleNumber }} v{{ event.authorization.ruleRevision }} and authorization by {{ event.authorization.authorizedByName }}, performed by {{ event.authorization.performedByName }}. Batch {{ event.authorization.batchRef }}.</p>
        <p v-for="(message, i) in event.messages || []" :key="i">{{ message.message }} <small>{{ message.fields }}</small></p>
        <ul><li v-for="suggestion in event.suggestions || []" :key="suggestion">{{ suggestion }}</li></ul>
        <p v-if="event.reason">{{ event.reason }}</p>
        <p v-if="event.type==='remittance_posted'">{{ event.denied ? 'Denied' : 'Payer adjudication' }} · Paid {{ claimHistoryMoney(event.paidCents) }} · Adjustments {{ claimHistoryMoney(event.adjustmentCents) }} · Patient responsibility {{ claimHistoryMoney(event.responsibilityCents) }}<template v-if="event.payerControlNumber"> · Payer control number {{ event.payerControlNumber }}</template></p>
        <ul v-if="claimHistoryChanges(event).length"><li v-for="change in claimHistoryChanges(event)" :key="change.label">{{ change.label }}: {{ change.before }} → {{ change.after }}</li></ul>
      </article>
      <section v-if="adjustments.length" aria-label="Payment and adjustments">
        <h4>Payment and adjustments</h4>
        <table><thead><tr><th>Line</th><th>Code</th><th>Adjustment</th><th>Amount</th><th>Allowed</th></tr></thead>
          <tbody><tr v-for="(row, index) in adjustments" :key="index"><td>{{ row.line_number || 'Claim' }}</td><td>{{ row.procedure_code || '—' }}</td><td>{{ row.group_code }}-{{ row.reason_code }}<small>{{ row.description }}</small></td><td>{{ money(row.amount_cents) }}</td><td>{{ row.allowed_cents == null ? '—' : money(row.allowed_cents) }}</td></tr></tbody>
        </table>
      </section>
      <section v-if="suggestions.length" aria-label="Suggested billing changes">
        <h4>Suggested billing changes</h4>
        <article v-for="item in suggestions" :key="item.id">
          <p>{{ item.prompt }}</p>
          <label v-if="item.kind === 'modifier'">Modifier<input v-model="suggestionModifiers[item.id]" maxlength="2" /></label>
          <button :disabled="busy" @click="decideSuggestion(item, 'accepted')">Accept</button>
          <button :disabled="busy" @click="decideSuggestion(item, 'dismissed')">Dismiss</button>
        </article>
      </section>
    </section>
  </section>
</template>

<script setup>
import ClientInsuranceEditor from '../billing/ClientInsuranceEditor.vue';
import ClientCoverageVerification from '../billing/ClientCoverageVerification.vue';
import SupervisedPayerPolicies from './SupervisedPayerPolicies.vue';
import { formatBillingDate,formatBillingTimestamp,claimIssueText } from '../../utils/billingReviewDisplay.js';
import ClaimServiceChangesPanel from './ClaimServiceChangesPanel.vue';
import ClientDocumentationReadiness from '../billing/ClientDocumentationReadiness.vue';
import ProviderBillingRollout from '../billing/ProviderBillingRollout.vue';
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { claimRequirementAction } from '../../utils/claimReviewRequirements.js';
import api from '../../services/api';
import { claimHistoryLabel, clearinghouseStatusLabel, claimStatusLabel, claimHistoryChanges, claimHistoryMoney } from '../../utils/billingWorkspace.js';
const props = defineProps({ agencyId: { type: Number, required: true }, connection: { type: Object, required: true }, section: { type: String, default: 'all' }, readOnly: Boolean });
const emit = defineEmits(['updated']);
const fetchRollout = async () => (await api.get('/medical-billing/provider-rollout', { params: { agencyId: props.agencyId } })).data;
const saveRollout = async input => (await api.put('/medical-billing/provider-rollout', { ...input, agencyId: props.agencyId })).data;
const reviewTask = ref('');
const reviewTaskPanel = ref(null), aiReviewPanel = ref(null);
const reviewTaskLabels = { insurance: 'Insurance & identity', coverage: 'Coverage for this service date', documents: 'Documents for this service', policy: 'Payer / product provider mapping' };
const requirementOrder = { insurance: 0, policy: 1, coverage: 2, documents: 3, ai: 4 };
const claimRequirements = computed(() => (review.value?.readiness.blockers || [])
  .map(message => ({ message, action: claimRequirementAction(message, review.value) }))
  .sort((a, b) => (requirementOrder[a.action?.task] ?? 5) - (requirementOrder[b.action?.task] ?? 5)));
async function openRequirement(task) {
  approved.value = false;
  if (task !== 'ai') reviewTask.value = task;
  await nextTick();
  const panel = task === 'ai' ? aiReviewPanel.value : reviewTaskPanel.value;
  panel?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  panel?.focus?.({ preventScroll: true });
}
const toggleReviewTask = task => { approved.value=false;reviewTask.value=reviewTask.value===task?'':task; };
const busy = ref(false), error = ref(''), notice = ref(''), activeClaimId = ref(null);
const payerRequests=ref([]), requestedPayer=ref(''), setupSearch=ref('');
const decoded = (value, fallback) => { if (typeof value !== 'string') return value || fallback; try { return JSON.parse(value) || fallback; } catch { return fallback; } };
const sourceAliases = request => decoded(request.source_names_json, []).filter(name => name !== request.payer_name);
const filteredPayerRequests = computed(() => payerRequests.value.filter(request => [request.payer_name,request.directory_name,request.source_payer_id,request.claimmd_payer_id,...sourceAliases(request)].join(' ').toLowerCase().includes(setupSearch.value.trim().toLowerCase())));
const capabilityLabel = (request, type) => ({yes:'Available',enrollment:'Enrollment required',no:'Not available'})[decoded(request.directory_snapshot_json, {})[type]] || 'Needs review';
const directoryStatusLabel = value => ({id_match:'ID found in directory',alias_review:'Legacy ID — review required',not_found:'Route not found',manual_review:'Manual setup review'})[value] || 'Not checked';
function reviewPayerRequest(request) {
  search.value = request.directory_name || request.payer_name;
  searchPayers(request.claimmd_payer_id || undefined);
}
const loadPayerRequests=async()=>{const {data}=await api.get('/medical-billing/payer-setup-requests',{params:{agencyId:props.agencyId}});if(active)payerRequests.value=data.items || [];};
const addPayerRequest=()=>run(async()=>{const {data}=await api.post('/medical-billing/payer-setup-requests',{agencyId:props.agencyId,payerName:requestedPayer.value});if(active){payerRequests.value=data.items || [];requestedPayer.value='';}});
const isAgencyPayer = payer => payerRequests.value.some(r => r.claimmd_payer_id === payer.payerid && r.directory_status === 'id_match');
const addDirectoryPayer = payer => run(async () => {
  const {data} = await api.post('/medical-billing/payer-setup-requests',{agencyId:props.agencyId,payerId:payer.payerid});
  if (active) { payerRequests.value=data.items || []; notice.value='Payer route saved for this agency. Open enrollment to complete any provider requirements.'; }
});
const search = ref(''), searchBy = ref('name'), billingOfficeId = ref(''), billingOffices = ref([]), enrollmentType = ref('1500'), acknowledgeEraRouting = ref(false);
const selectedOffice = computed(() => billingOffices.value.find(o => Number(o.id) === Number(billingOfficeId.value)));
const billingGroups = computed(() => [...new Set(billingOffices.value.map(o=>o.practice_npi))].map(npi=>({npi,offices:billingOffices.value.filter(o=>o.practice_npi===npi)})));
const sameGroupOfficeCount = computed(() => billingOffices.value.filter(o=>o.practice_npi===selectedOffice.value?.practice_npi).length);
const enrollmentStatus = status => ({ requested: 'Requested — open enrollment to continue', started: 'Form issued — complete steps in Claim.MD', provider_validation_required: 'Action needed — NPPES phone validation', era_receiver_conflict: 'Action needed — release or transfer ERA enrollment from the current receiving account' })[status] || status;
const payers = ref([]), enrollments = ref([]), review = ref(null), approved = ref(false), history = ref([]), historyClaimId = ref(null), adjustments = ref([]), suggestions = ref([]), suggestionModifiers = ref({});
const historyMeta=ref({});let historySequence=0;
const posOverride = ref({ to: '11', planType: '', reason: '', reference: '' });
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
const transactionCapability = payer => payer[{'1500':'1500_claims',era:'era',elig:'eligibility'}[enrollmentType.value]];
const transactionUnavailable = payer => transactionCapability(payer) === 'no';
const transactionAvailable = payer => transactionCapability(payer) === 'yes';
const existingEnrollment = payer => enrollments.value.find(e=>e.payer_id===payer.payerid && e.provider_npi===selectedOffice.value?.practice_npi && e.enrollment_type===enrollmentType.value);
function openPayerEnrollment(payer) {
  if (transactionUnavailable(payer)) return;
  const existing = existingEnrollment(payer);
  if (existing) reopenEnrollment(existing);
  else enroll(payer.payerid);
}
const draft = ref(null), correctionReason = ref('');
const reconciling = ref(false), reconciliationPlan = ref(null), reconciliationLines = ref([]), reconciliationReason = ref(''), reconciliationAttested = ref(false), reconciliationStale = ref(false);
const canEditDraft = computed(() => !!draft.value && ['draft','ready','rejected'].includes(draft.value.claim?.claim_lifecycle) && !draft.value.previouslyTransmitted);
const reconciliationBlocked = computed(() => draft.value?.previouslyTransmitted ? 'This claim has submission history. Preserve the submitted original and use the payer correction and follow-up workflow.' : draft.value?.approvedClinicalVersion?.pendingClinicalApproval ? 'A clinical amendment is awaiting approval. Complete its required signatures before applying a clinical version to billing.' : draft.value && !['draft','ready','rejected'].includes(draft.value.claim?.claim_lifecycle) ? 'This claim is queued or no longer editable. Reconcile its clearinghouse status through the payer correction and follow-up workflow.' : '');
const canReconcile = computed(() => !!draft.value?.clinicalVersionChanged && !reconciliationBlocked.value && !!draft.value?.approvedClinicalVersion?.revisionId && !!draft.value?.approvedClinicalVersion?.contentHash && !!draft.value?.approvedClinicalVersion?.lines?.length);
const parsedModifiers = value => String(value || '').split(/[,\s]+/).filter(Boolean).map(value => value.toUpperCase());
function validReconciliationLine(line) {
  const amount = Number(line.dollars), modifiers = parsedModifiers(line.modifiers), pointers = String(line.diagnosisPointers || '');
  return /^\d+(?:\.\d{1,2})?$/.test(String(line.dollars)) && Number.isFinite(amount) && amount >= 0.01 && amount <= 1000000 && modifiers.length <= 4 && modifiers.every(value => /^[A-Z0-9]{2}$/.test(value)) && /^(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2])){0,3}$/.test(pointers) && pointers.split(',').every(value => Number(value) <= (reconciliationPlan.value?.diagnosisCodes?.length || 0));
}
const validReconciliation = computed(() => canReconcile.value && !reconciliationStale.value && reconciliationAttested.value && reconciliationReason.value.trim().length >= 10 && reconciliationReason.value.trim().length <= 2000 && reconciliationLines.value.length === reconciliationPlan.value?.lines?.length && reconciliationLines.value.every(validReconciliationLine));
watch([reconciliationLines, reconciliationReason], () => { reconciliationAttested.value = false; }, { deep: true });
function cancelReconciliation() { reconciling.value = false; reconciliationPlan.value = null; reconciliationLines.value = []; reconciliationReason.value = ''; reconciliationAttested.value = false; reconciliationStale.value = false; }
function startReconciliation() { if (busy.value || !canReconcile.value) return; reconciliationPlan.value = JSON.parse(JSON.stringify(draft.value.approvedClinicalVersion)); reconciliationLines.value = reconciliationPlan.value.lines.map(line => ({ procedureCode: line.procedureCode, units: line.units, dollars: '', modifiers: '', diagnosisPointers: '' })); reconciliationReason.value = ''; reconciliationAttested.value = false; reconciliationStale.value = false; reconciling.value = true; approved.value = false; review.value = null; }
const saveClinicalReconciliation = () => { if (!validReconciliation.value || busy.value) return; return run(async () => {
  const claim = draft.value.claim, plan = reconciliationPlan.value;
  try {
    const { data } = await api.patch(`/medical-billing/claimmd/claims/${claim.id}`, { agencyId: props.agencyId, action: 'reconcile_approved_version', revision: claim.billing_revision, expectedClinicalRevisionId: plan.revisionId, expectedClinicalContentHash: plan.contentHash, reason: reconciliationReason.value.trim(), attested: true, lines: reconciliationLines.value.map(line => ({ procedureCode: line.procedureCode, units: Number(line.units), chargeCents: Math.round(Number(line.dollars) * 100), modifiers: parsedModifiers(line.modifiers), diagnosisPointers: String(line.diagnosisPointers) })) }, { skipGlobalLoading: true });
    if (!active) return;
    if (data?.ok !== true || Number(data.clinicalVersion?.revisionId) !== Number(plan.revisionId) || data.clinicalVersion?.contentHash !== plan.contentHash) throw new Error('The server did not confirm the clinical version update. Reload this draft before continuing.');
    draft.value = null; cancelReconciliation(); review.value = null; approved.value = false; notice.value = data.message; emit('updated'); await fetchHistory(claim.id);
  } catch (e) { if (active) { reconciliationAttested.value = false; if (e.response?.status === 409 || !e.response) reconciliationStale.value = true; } throw e; }
}); };
const undrafted = ref([]);
const exceptionFinding = ref(null), exceptionReason = ref(''), exceptionReference = ref('');
const providerLabel = p => p ? `${p.firstName || ''} ${p.lastName || ''} · NPI ${p.npi || 'missing'}` : 'Not configured';
let active = true;
onBeforeUnmount(() => { active = false; });
const canEnroll = computed(() => /^\d{10}$/.test(selectedOffice.value?.practice_npi || '') && props.connection.configured && (enrollmentType.value !== 'era' || acknowledgeEraRouting.value));
async function run(task) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await task(); } catch (e) { if (active) error.value = e.response?.data?.error?.message || e.message || 'The request could not be completed.'; }
  finally { if (active) busy.value = false; }
}
async function fetchEnrollments() {
  const { data } = await api.get('/medical-billing/claimmd/enrollments', { params: { agencyId: props.agencyId } });
  if (active) enrollments.value = data.items || [];
}
const loadEnrollments = () => run(fetchEnrollments);
async function fetchBillingOffices() {
  const { data } = await api.get('/medical-billing/claimmd/billing-offices', { params: { agencyId: props.agencyId } });
  if (active) billingOffices.value = data.items || [];
}
async function fetchUndrafted() {
  const { data } = await api.get('/medical-billing/claims/undrafted-notes', { params: { agencyId: props.agencyId } });
  if (active) undrafted.value = data.notes || [];
}
const loadUndrafted = () => run(fetchUndrafted);
const createDraft = note => run(async () => {
  await api.post('/medical-billing/claims', { agencyId: props.agencyId, clientId: note.client_id, clinicalSessionId: note.clinical_session_id, clinicalNoteId: note.id });
  if (active) { emit('updated'); notice.value = 'Claim prepared for billing review.'; await fetchUndrafted(); }
});
const searchPayers = payerId => run(async () => {
  const params = { agencyId: props.agencyId, ...(typeof payerId === 'string' && payerId ? {payerId} : searchBy.value === 'id' ? {payerId:search.value.trim()} : {search: search.value}) };
  const { data } = await api.get('/medical-billing/claimmd/payers', { params });
  if (active) { payers.value = data.payers || []; if (!payers.value.length) notice.value = 'No matching payers.'; }
});
function enroll(payerId) {
  if (!canEnroll.value || busy.value) return;
  // Open synchronously to avoid popup blockers; consume the one-use URL immediately.
  const popup = window.open('about:blank', '_blank');
  if (!popup) { error.value = 'Allow popups to open the secure enrollment form.'; return; }
  popup.opener = null;
  run(async () => {
    try {
      const { data } = await api.post('/medical-billing/claimmd/enrollments', { agencyId: props.agencyId, payerId, billingOfficeLocationId: Number(billingOfficeId.value), enrollmentType: enrollmentType.value, acknowledgeEraRouting: acknowledgeEraRouting.value });
      if (!active) { popup.close(); return; }
      popup.location.replace(data.url);
      notice.value = 'Complete the enrollment steps in the Claim.MD window. Progress updates arrive after Claim.MD processes them.';
      await fetchEnrollments();
    } catch (e) { popup.close(); throw e; }
  });
}
function reopenEnrollment(item) {
  const office = billingOffices.value.find(o => Number(o.id) === Number(item.billing_office_location_id));
  if (!office || office.practice_npi !== item.provider_npi) { error.value = 'This enrollment’s billing office or NPI has changed. Review the office profile and start a new enrollment.'; return; }
  billingOfficeId.value = office.id; enrollmentType.value = item.enrollment_type;
  if (item.enrollment_type === 'era' && !acknowledgeEraRouting.value) { error.value = 'Confirm ERA routing above, then click View / continue again.'; return; }
  enroll(item.payer_id);
}
const sync = () => run(async () => {
  const { data } = await api.post('/medical-billing/claimmd/responses/sync', { agencyId: props.agencyId });
  if (active) { notice.value = `${data.updated} claim updates saved.${data.moreAvailable ? ' More updates are available; sync again.' : ''}`; emit('updated'); if (historyClaimId.value) await fetchHistory(historyClaimId.value); }
});
async function fetchHistory(claimId,before=null) {
  const seq=++historySequence;
  const { data } = await api.get(`/medical-billing/claimmd/claims/${claimId}/history`, { params: { agencyId: props.agencyId,...(before?{before}:{}) }, skipGlobalLoading: true });
  const [adjustmentResult, suggestionResult] = await Promise.all([
    api.get(`/medical-billing/claims/${claimId}/adjustments`, { params: { agencyId: props.agencyId }, skipGlobalLoading: true }),
    api.get('/medical-billing/billing-suggestions', { params: { agencyId: props.agencyId }, skipGlobalLoading: true })
  ]);
  if (active && seq===historySequence) {
    historyClaimId.value = claimId;
    historyMeta.value=data;
    history.value = before?[...(data.history||[]),...history.value]:(data.history || []);
    adjustments.value = adjustmentResult.data.items || [];
    suggestions.value = suggestionResult.data.items || [];
  }
}
const loadEarlierHistory=()=>run(()=>fetchHistory(historyClaimId.value,historyMeta.value.nextBefore));
const savePosOverride = () => run(async () => {
  if (!review.value) return;
  await api.post('/medical-billing/claim-overrides', { agencyId: props.agencyId, scope: 'payer', payerId: review.value.readiness?.payer?.payerId, planType: posOverride.value.planType, fieldKey: 'place_of_service', fromValue: review.value.payload?.charge?.[0]?.place_of_service || null, toValue: posOverride.value.to, notes: posOverride.value.reason, policyReference: posOverride.value.reference, effectiveFrom: String(review.value.dateOfService).slice(0, 10), effectiveThrough: '2099-12-31' });
  if (active) { notice.value = 'Place-of-service override saved. Review the claim again before submitting.'; await reloadReview(); }
});
const decideSuggestion = (item, decision) => run(async () => {
  await api.post(`/medical-billing/billing-suggestions/${item.id}/decide`, { agencyId: props.agencyId, decision, modifier: suggestionModifiers.value[item.id] || item.payload?.modifier, planType: review.value?.readiness?.payer?.planType || null, reason: item.prompt, policyReference: 'Accepted from the billing suggestion' });
  if (active && historyClaimId.value) await fetchHistory(historyClaimId.value);
});
const showHistory = claimId => run(() => fetchHistory(claimId));
const editClaim = claimId => run(async () => {
  if (props.readOnly) return;
  activeClaimId.value=claimId;
  review.value = null; approved.value = false; draft.value = null; cancelReconciliation();
  const { data } = await api.get(`/medical-billing/claimmd/claims/${claimId}/draft`, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
  if (!active) return;
  draft.value = { ...data, lines: data.lines.map(line => ({ ...line, dollars: (line.charge_cents / 100).toFixed(2), modifiers: (typeof line.modifiers_json === 'string' ? JSON.parse(line.modifiers_json || '[]') : line.modifiers_json || []).join(', ') })) };
  correctionReason.value = '';
});
function selectClaimOffice() {
  const office=(draft.value?.billingOffices || []).find(item=>Number(item.id)===Number(draft.value?.billingOfficeId));
  if(office)draft.value.claim.billing_npi=office.practice_npi || '';
}
const saveCorrection = () => run(async () => {
  const { claim, lines } = draft.value;
  const { data } = await api.patch(`/medical-billing/claimmd/claims/${claim.id}`, {
    agencyId: props.agencyId, revision: claim.billing_revision, reason: correctionReason.value,
    ...(draft.value.billingOfficeId?{billingOfficeId:Number(draft.value.billingOfficeId)}:{}),
    placeOfService: claim.place_of_service, billingNpi: claim.billing_npi, renderingNpi: claim.rendering_npi, taxonomyCode: claim.taxonomy_code,
    lines: lines.map(line => ({ id: Number(line.id), chargeCents: Math.round(Number(line.dollars) * 100), modifiers: line.modifiers.split(/[,\s]+/).filter(Boolean).map(m => m.toUpperCase()) }))
  });
  if (active) { draft.value = null; notice.value = data.message; emit('updated'); await fetchHistory(claim.id); }
});
const reviewClaim = claimId => run(async () => {
  reviewTask.value='';
  if (props.readOnly) return;
  activeClaimId.value=claimId;
  review.value = null; approved.value = false;
  const { data } = await api.get(`/medical-billing/claimmd/claims/${claimId}/review`, { params: { agencyId: props.agencyId } });
  if (active) { historySequence++;review.value = data; historyClaimId.value = claimId; historyMeta.value=data;history.value = data.history || []; }
});
async function reloadReview() {
  const {data}=await api.get(`/medical-billing/claimmd/claims/${review.value.claimId}/review`,{params:{agencyId:props.agencyId}});
  if(active){historySequence++;review.value=data;historyClaimId.value=data.claimId;historyMeta.value=data;history.value=data.history||[];approved.value=false;exceptionFinding.value=null;}
}
const runAiReview=()=>run(async()=>{
  await api.post(`/medical-billing/claimmd/claims/${review.value.claimId}/ai-review`,{agencyId:props.agencyId});
  if(active)await reloadReview();
});
const saveAiException=()=>run(async()=>{
  await api.post(`/medical-billing/claimmd/claims/${review.value.claimId}/ai-findings/resolve`,{agencyId:props.agencyId,reviewId:review.value.aiReview.id,findingId:exceptionFinding.value.id,reason:exceptionReason.value,policyReference:exceptionReference.value});
  if(active)await reloadReview();
});
const submit = () => run(async () => {
  if (!approved.value || !review.value) return;
  const claimId = review.value.claimId;
  const { data } = await api.post(`/medical-billing/claimmd/claims/${claimId}/submit`, { agencyId: props.agencyId, approved: true, reviewHash: review.value.reviewHash, accountMode: props.connection.mode });
  if (active) { review.value = null; approved.value = false; notice.value = data.message; emit('updated'); await fetchHistory(claimId); }
});
onMounted(() => { if (['all', 'payers'].includes(props.section)) run(async () => { await loadPayerRequests(); if(props.connection.configured){ await fetchBillingOffices(); await fetchEnrollments(); } }); });
defineExpose({ reviewClaim, showHistory, editClaim });
</script>

<style scoped>
.claimmd-workspace { border: 1px solid #d6dfeb; padding: 1.25rem; border-radius: 12px; background: white; margin: 1rem 0; }
.actions { display:flex; flex-wrap:wrap; align-items:center; gap:.75rem; margin:.75rem 0; }
label { display:block; margin:.75rem 0; } input, select, button { padding:.5rem; } button { cursor:pointer; } button:disabled { cursor:default; opacity:.55; }
input, select { max-width:100%; box-sizing:border-box; } .actions > label { min-width:0; max-width:100%; }
table { width:100%; border-collapse:collapse; margin:1rem 0; } th, td { padding:.6rem; border-bottom:1px solid #e2e8f0; text-align:left; }
.review { margin-top:1.5rem; padding:1rem; border:1px solid #d6dfeb; border-radius:8px; } .error { color:#a32121; } pre { white-space:pre-wrap; overflow-wrap:anywhere; } article { padding:.75rem 0; border-bottom:1px solid #e2e8f0; }
.clinical-reconciliation{display:block;clear:both;box-sizing:border-box;width:100%;min-width:0;text-align:left;margin:1rem 0;padding:1rem;background:#f5fafb;border:1px solid #bdd3dd;border-radius:8px}.clinical-reconciliation h4{display:block;margin:0 0 .75rem;line-height:1.4}.clinical-reconciliation p{margin:.5rem 0;line-height:1.5}.clinical-reconciliation ol,.clinical-reconciliation ul{margin:.5rem 0;padding-left:1.5rem}.claim-office-label select{display:block;width:100%;margin-top:.4rem}.billing-office-help{font-size:.9rem;color:#53657a}.clinical-reconciliation fieldset{min-width:0;border:1px solid #c8dce5;border-radius:6px}.clinical-reconciliation input:not([type=checkbox]),.clinical-reconciliation textarea{display:block;width:100%;max-width:500px;padding:.5rem;box-sizing:border-box}.clinical-reconciliation .actions button{max-width:100%}@media(max-width:600px){.clinical-reconciliation{padding:.65rem}.clinical-reconciliation .actions{align-items:stretch;flex-direction:column}.clinical-reconciliation .actions button{width:100%;min-height:42px}}
.payer-catalog{overflow:auto;max-height:480px}.payer-catalog table{min-width:860px}.payer-catalog small{display:block;max-width:300px;margin-top:6px;color:var(--text-secondary,#536579);font-size:.8rem;line-height:1.4}.payer-catalog th{position:sticky;top:0;background:var(--bg-secondary,#eff4fa)}
.review-tasks .actions button{border:1px solid #abc1d4;border-radius:7px;background:#f6faff;color:#234f70;min-height:42px;text-align:left}.review-tasks .actions button[aria-expanded=true]{background:#e8f3ff;border-color:#3478b6}.review-tasks{min-width:0}.review-tasks h4{margin:1rem 0 .5rem}@media(max-width:600px){.review-tasks .actions{align-items:stretch;flex-direction:column}.review-tasks .actions button{width:100%}.claimmd-workspace,.review{padding:.7rem}}
.claim-charge-table{max-width:100%;overflow-x:auto}.claim-charge-table table{min-width:540px}
.requirement-editor{scroll-margin-top:5rem;min-width:0}.requirement-editor:focus,.review[tabindex]:focus{outline:2px solid #3478b6;outline-offset:3px}.requirement-checklist{margin:1rem 0}.requirement-checklist ul{list-style:none;padding:0;margin:0}.requirement-item{display:flex;align-items:center;gap:1rem;margin:.65rem 0;padding:1rem;border:1px solid #e4c99c;border-left:4px solid #b47719;border-radius:8px;background:#fff9ef;color:#344354;overflow-wrap:anywhere}.requirement-item>div{flex:1;min-width:0}.requirement-item p{margin:.35rem 0 0;line-height:1.5}.requirement-item button{flex:0 0 auto;max-width:100%;min-height:44px;border:1px solid #9eb5c9;border-radius:6px;background:white;color:#234f70;white-space:normal}.claim-warnings{padding:.75rem 1rem;margin:1rem 0;background:#f5f7fa;border-radius:8px}.claim-warnings h4{margin:0}.review-status{font-weight:600}@media(max-width:600px){.requirement-item{align-items:stretch;flex-direction:column;padding:.75rem}.requirement-item button{width:100%}}
</style>
