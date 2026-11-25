<template>
  <div ref="workspaceRoot" class="sph">
    <ContractHandbookModal v-if="handbookReference" :open="true" v-bind="handbookReference" @close="handbookReference=null" />
    <header class="sph-head">
      <div class="sph-brandbar"><button type="button" class="sph-back" @click="goBack">← Applicants</button><PlotlineSignature context="Hiring workspace" product="PO" /></div>
      <div class="sph-heading-row"><div><p class="sph-eyebrow">{{ agencyStore.currentAgency?.name || 'People operations' }} / Hiring</p><h1>Start pre-hire</h1><p class="muted">Prepare {{ candidateName === 'Candidate' ? 'their' : candidateName + '’s' }} next chapter, one step at a time.</p></div><div class="sph-save-state"><span class="sph-save-dot" :class="{ pending: draftDirty || draftSaving, failed: draftSaveError }" /><p role="status">{{ draftMessage }}</p><button v-if="draftSaveError" type="button" @click="flushDraft">Retry saving progress</button></div></div>
    </header>

    <div v-if="loading" class="sph-initial-loading" role="status"><div class="sph-skeleton" /><p>Opening candidate and job details…</p></div>
    <div v-else-if="error" class="error" role="alert">{{ error }} <button type="button" @click="load">Retry loading setup</button></div>
    <template v-else>
      <div class="sph-context-strip"><span class="sph-avatar">{{ initials }}</span><div><strong>{{ candidateName }}</strong><span>{{ candidateEmail }}</span></div><div class="sph-context-job"><strong>{{ jobTitle || 'Job not linked' }}</strong><span>{{ locationLabel || 'Location not provided' }}</span></div><span class="sph-stage-badge">{{ stageLabel }}</span></div>
      <nav class="sph-steps" aria-label="Pre-hire setup"><button v-for="(label, i) in setupSteps" :key="label" type="button" :aria-current="setupStep === i ? 'step' : undefined" @click="setupStep = i"><span>{{ i + 1 }}</span>{{ label }}</button></nav>
      <p class="muted">Step {{ setupStep + 1 }} of {{ setupSteps.length }} · {{ setupSteps[setupStep] }}</p>
      <section v-show="setupStep === 0" class="sph-card">
        <h2>Confirm the person and job</h2>
        <div class="sph-person-job-grid">
          <article class="sph-summary-panel"><p class="sph-eyebrow">The person</p><h3>{{ candidateName }}</h3><dl class="sph-facts"><div v-for="fact in personFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value || 'Not provided' }}</dd></div></dl><a :href="candidateRecordPath" target="_blank" rel="noopener">Open candidate record, resume and interviews ↗</a></article>
          <article class="sph-summary-panel"><p class="sph-eyebrow">The opportunity</p><h3>{{ jobTitle || 'No job posting linked' }}</h3><dl class="sph-facts"><div v-for="fact in jobFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value || 'Not provided' }}</dd></div></dl><a :href="careersEditPath" target="_blank" rel="noopener">Review the job and hiring defaults ↗</a></article>
        </div>
        <div class="sph-application-context"><article><h3>Application history</h3><p v-if="!detail?.applications?.length" class="muted">No submitted application history is available for this candidate.</p><ul v-else><li v-for="app in detail.applications" :key="app.submissionId"><strong>{{ app.jobTitle || 'Job application' }}</strong><span>{{ formatDate(app.submittedAt) }}</span><p v-if="app.coverLetterPreview">{{ app.coverLetterPreview }}</p></li></ul></article><article><h3>Candidate’s introduction</h3><p class="sph-description">{{ detail?.profile?.cover_letter_text || 'No cover letter text has been provided. Review the candidate record for any attached application materials.' }}</p></article></div>
        <h3 class="sph-section-heading">Job description they will review</h3>
        <JobDescriptionSections v-if="detail?.jobDescription?.descriptionSections" :sections="detail.jobDescription.descriptionSections" :title="jobTitle" show-header compact />
        <p v-else class="sph-description">{{ detail?.jobDescription?.description_text || detail?.jobDescription?.descriptionText }}</p>
        <p v-if="currentPortalLink"><a :href="currentPortalLink" target="_blank" rel="noopener">Open {{ candidateName }}’s current portal ↗</a></p>
      </section>

      <section v-show="setupStep === 1" class="sph-card">
        <h2>Confirm role and supervision</h2>
        <p class="muted">Choose whether this person will supervise other employees. This determines their agreement duties and the acknowledgment they sign.</p>
        <fieldset class="sph-role-options"><legend>Will this hire perform supervisory duties?</legend>
          <label :class="{ chosen: !portalWorkflow.supervisorRole }"><input v-model="portalWorkflow.supervisorRole" type="radio" :value="false" name="supervisory-role" /><span><strong>No supervisory duties</strong><small>Use the standard duties for this job.</small></span></label>
          <label :class="{ chosen: portalWorkflow.supervisorRole }"><input v-model="portalWorkflow.supervisorRole" type="radio" :value="true" name="supervisory-role" /><span><strong>Yes, this hire will supervise others</strong><small>Include approved supervisory duties in the agreement and a separate supervisor acknowledgment to sign.</small></span></label>
        </fieldset>
        <p v-if="portalWorkflow.supervisorRole && (!portalWorkflow.supervisorTemplateId || !portalWorkflow.supervisorClause)" role="alert" class="sph-warn">Configure the approved supervisory clause and acknowledgment in hiring settings before sending.</p>
        <label>Who will supervise this hire?<select v-model="portalWorkflow.supervisorUserId"><option :value="null">Not assigned yet</option><option v-for="u in staffUsers.filter(u => Number(u.id) !== Number(userId) && isSupervisor(u))" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option></select></label>
        <label v-if="contractTenant === 'itsco'">Will this provider deliver services in Spanish?
          <select v-model="portalWorkflow.spanishProvider"><option :value="undefined">Choose when confirmed</option><option :value="true">Yes, approved to provide services in Spanish</option><option :value="false">No Spanish-language assignment</option></select>
        </label>
      </section>

      <section v-show="setupStep === 2" id="prehire-workflow" class="sph-card" tabindex="-1">
        <h2>Select this person’s materials</h2>
        <p class="muted">Start with the saved agency and job selections, then choose any extra documents or resources. Next, review one combined sequence in the order the candidate will see it.</p>
        <label>Saved pre-hire setup<select v-model="packetTemplateId" @change="applyPacketTemplate"><option value="">Agency and job defaults</option><option v-for="p in settings.hire_packet_templates || []" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label>Saved document collection (optional)<select v-model="prehirePackageId"><option :value="null">Individual steps only</option><option v-for="p in packetPackages.filter(p => p.package_type === 'pre_hire')" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <p v-if="prehirePackageId" class="muted">{{ collectionDocuments.length }} additional document(s) included. Forms already provided by the portal appear once in the review.</p>
        <p v-if="collectionError" role="alert" class="error">{{ collectionError }} <button type="button" @click="loadCollection">Retry collection</button></p>
        <p><a :href="settingsPath" target="_blank" rel="noopener">Manage saved hiring setups ↗</a></p>
        <p class="sph-handbook-note">The internal workplace handbook is available as a reference in pre-hire. Its review and signature belong to onboarding. <a :href="handbookPath" target="_blank" rel="noopener">Open internal handbook ↗</a></p>
      </section>

      <section v-show="setupStep === 3" id="prehire-agreement" tabindex="-1" class="sph-card">
        <h2>Agreement and cosigners</h2>
        <p class="muted">Review the person’s information and compensation, then generate the agreement they will receive.</p>
        <p><a :href="contractsPath" target="_blank" rel="noopener">Manage standard agreement terms and pay settings ↗</a> <button type="button" @click="refreshContractLibrary">Refresh contract settings</button></p>
        <div v-if="!contractConfigs.length" class="sph-warn">
          Create a contract configuration in the Contract Generator, then refresh the settings here to prepare and preview this person’s agreement.
        </div>
        <template v-if="agreementBuilder">
          <label class="sph-config">Agreement role<select v-model="agreementVariant" @change="applyAgreementVariant"><option v-for="option in agreementBuilder.options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <p v-if="agreementBuilder.description" class="muted">{{ agreementBuilder.description }}</p>
          <p v-else class="muted">One ongoing agreement uses the standard terms, selected service focuses, role duties, and category/level compensation. Practicum and internship use the student training agreement with the same category/level pay system. Changes to compensation do not automatically require a replacement agreement.</p>
          <p v-if="!contractConfigId" class="sph-warn">The standard terms for this agreement role are not configured. Refresh or update the agreement library.</p>
        </template>
        <label v-else-if="contractConfigs.length" class="sph-config">
          Contract config
          <select v-model.number="contractConfigId" class="input">
            <option :value="null">Choose a contract configuration</option>
            <option v-for="c in contractConfigs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <p v-if="requiresActivation" class="sph-warn" role="status">This standard agreement is saved as a draft. Prepare and read the preview, then <a href="#standard-agreement-review">review and approve its standard terms below</a> to enable sending.</p>
        <div class="sph-grid">
          <label>Start date <input v-model="contract.startDate" type="date" /></label>
          <label>Execution date <input v-model="contract.executionDate" type="date" /></label>
          <label>Expiration date <input v-model="contract.expirationDate" type="date" /></label>
          <label v-if="contractTenant!=='nlu'" class="sph-check">
            <input v-model="includeSupervisor" type="checkbox" />
            Include supervisor on the employment agreement
          </label>
          <label v-if="contractTenant!=='nlu' && effectiveIncludeSupervisor">Assigned clinical supervisor
            <select v-model="portalWorkflow.supervisorUserId"><option :value="null">Choose a supervisor</option><option v-for="u in eligibleSupervisors" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option></select>
          </label>
          <label v-if="!agreementBuilder || agreementVariant === 'provider'">License required by <input v-model="contract.licenseBy" type="date" /></label>
          <label>Minimum direct service hours per week <input v-model="contract.minHours" type="number" min="0" step="any" /><span v-if="contract.minHours !== '' && Number.isFinite(Number(contract.minHours)) && Number(contract.minHours) >= 0" class="muted small">Required available-to-book time: {{ Math.ceil(Number(contract.minHours) * 1.25) }} hours / week. Expected to schedule: {{ Math.ceil(Number(contract.minHours) * 1.25) }} hours / week (25% more, rounded up, to account for no-shows and rescheduling).</span></label>
          <label v-if="!usesIndividualAgreement">Pay category
            <select id="prehire-category" v-model="contract.compensationCategory">
              <option value="">Choose a category</option>
              <option v-for="(category, id) in compensationCategories" :key="id" :value="String(id)">{{ id }} — {{ category.label }}</option>
            </select>
          </label>
        </div>
        <div class="sph-grid">
          <label v-if="!usesIndividualAgreement">Pay level<select id="prehire-level" v-model="contract.compensationLevel"><option value="">Choose a level</option><option v-for="level in 5" :key="level" :value="String(level)">Level {{ level }} — {{PROVIDER_DESIGNATION_LABELS[level-1]}}{{ levelLabel(level) }}</option></select></label>
          <label v-if="usesIndividualAgreement">Provider designation — optional<select v-model="contract.providerDesignationLevel"><option value="">Not assigned</option><option v-for="level in 5" :key="level" :value="String(level)">Level {{level}} — {{PROVIDER_DESIGNATION_LABELS[level-1]}}</option></select></label>
          <label>Assigned office<select id="prehire-office" v-model="officeLocationId" @change="applyOffice"><option :value="null">Select an office</option><optgroup v-for="group in officeGroups" :key="group.city" :label="group.city"><option v-for="office in group.offices" :key="office.id" :value="office.id">{{ office.name }} — {{ office.address }}</option></optgroup></select></label>
        </div>
        <p v-if="officeSource" class="muted">{{ officeSource }}</p>
        <ContractProbationChoice id="prehire-probation" tabindex="-1" v-if="probationRequired" v-model="contract.probationChoice" v-model:terms="contract.probationTerms" :individual="contractTenant==='isi'" />
        <template v-if="!usesIndividualAgreement">
          <template v-if="selectedCompensation && categoryServicePay">
            <p>Category {{ contract.compensationCategory }}, Level {{ contract.compensationLevel }} · Compensation follows the service performed and its approved schedule.</p>
            <p v-if="selectedCompensation.paySystem" class="muted">Clinical session base: {{ money(selectedCompensation.paySystem.creditRate) }} · H-code direct-care base: {{ money(selectedCompensation.paySystem.hcodeRate) }} / hour · Indirect: {{ money(selectedCompensation.paySystem.indirectRate) }} / hour.</p>
            <p v-if="selectedCompensation.paySystem" class="muted">Eligible H-code direct care adds {{ selectedCompensation.paySystem.autoIndirectMinutesPerHour }} indirect minutes per direct-care hour on top of the service pay. Review service eligibility and the applicable base or reduced rate; tutoring, childcare and testing follow their own approved terms below.</p>
          </template>
          <p v-else-if="selectedCompensation">Category {{ contract.compensationCategory }}, Level {{ contract.compensationLevel }} · Direct: {{ money(selectedCompensation.direct_rate) }} / hour · Indirect: {{ money(selectedCompensation.indirect_rate) }} / hour · FFS base: {{ money(selectedCompensation.ffs_rate) }}</p>
          <p v-else class="sph-warn">Choose a category and level to review compensation. Configure missing rates in contract/pay settings.</p>
        </template>
        <template v-if="contractTenant !== 'nlu' && !usesIndividualAgreement && (agreementBuilder || contractConfigs.find(c => Number(c.id) === Number(contractConfigId))?.pay_mode === 'ffs')">
          <p v-if="selectedCompensation?.serviceRatesError" class="sph-warn">{{ selectedCompensation.serviceRatesError }}</p>
          <table v-else-if="selectedCompensation?.serviceRates?.length">
            <thead><tr><th>Service code</th><th>Base compensation</th><th v-if="selectedCompensation.serviceRates.some(rate => rate.reduced)">{{ contract.probationChoice==='no'?'Probation not applied':'Configured probationary rate (only if Yes)' }}</th><th>Unit</th></tr></thead>
            <tbody><tr v-for="rate in selectedCompensation.serviceRates" :key="rate.code"><td>{{ rate.code }}</td><td>{{ rate.rate }}<template v-if="rate.additionalIndirect"><br />{{ rate.additionalIndirect }}</template></td><td v-if="selectedCompensation.serviceRates.some(rate => rate.reduced)">{{ contract.probationChoice==='no'?rate.rate:rate.reduced || rate.rate }}</td><td>{{ rate.unit }}</td></tr></tbody>
          </table>
        </template>
        <p v-if="inferredPayLabel" class="muted small">Inferred: {{ inferredPayLabel }}</p>
        <div v-if="contractTenant==='nlu' && nluProgramRates.length" class="sph-program-rates"><table><caption>Separate program compensation — when assigned and authorized</caption><thead><tr><th>Service</th><th>Regular rate / hour-equivalent</th><th>Rate with selected probation choice</th><th>Automatic indirect time</th></tr></thead><tbody><tr v-for="row in nluProgramRates" :key="row.service"><th>{{row.service==='h2014'?'H2014 — Therapy + Tutoring':'Homework Help'}}</th><td>{{money(row.rate)}}</td><td>{{money(row.selectedRate)}}</td><td>{{row.indirectMinutesPerHour}} minutes per direct hour</td></tr></tbody></table></div>
        <ContractExpectationsEditor id="prehire-services" tabindex="-1" v-if="contractTenant" :category-placement="contractTenant==='nlu'" :compensation-level="contract.compensationLevel" :pay-profile="selectedCompensation?.paySystem" :supervisor-options="eligibleSupervisors" v-model:supervisor-user-id="portalWorkflow.supervisorUserId" :show-core-fields="false" :guided-setup="contractTenant === 'itsco'" v-model="individualExpectations" :individual-agreement-mode="contractTenant==='isi'" :service-role-options="contractServiceRoleOptions" :service-role-source="wizardTokens.CONTRACT_SERVICE_ROLE_SOURCE" :compensation-category="contract.compensationCategory" :service-compensation="serviceCompensation" title="Assigned services and compensation" description="Review the job-based role selections and each service’s approved pay and authorization terms before preparing the agreement." />
        <details v-if="contractTenant==='nlu' && (Number(contract.compensationCategory)>=3 || contractOverrides.NLU_CATEGORY_PLACEMENT_EXCEPTION_REFERENCE)"><summary>Existing individual placement notes — optional</summary><label>Existing placement reference<input v-model="contractOverrides.NLU_CATEGORY_PLACEMENT_EXCEPTION_REFERENCE" placeholder="Preserve any recorded individual placement notes" /></label><p class="muted">The selected pay category and level determine compensation. Credential suggestions do not replace that selection or grant clinical authority.</p></details>
        <h3>Contract details</h3>
        <p class="muted">Check the employment title, credentials and assigned location before previewing.</p>
        <div class="sph-grid">
          <template v-for="field in visibleContractFields" :key="field.key">
            <ContractServiceFocusSelect v-if="field.key === 'SERVICE_FOCUS'" v-model="contractOverrides.SERVICE_FOCUS" :options="serviceFocusOptions" />
            <div v-else-if="field.key === 'LICENSE_TYPE'" id="prehire-credentials" tabindex="-1"><span>{{ field.label }}</span><CredentialPicker v-model="contractCredential" /><span class="muted">{{ wizardTokens.CREDENTIAL_SOURCE === 'resume' ? "Suggested from the résumé. Confirm the degree and any license or candidate registration." : "Confirm the recorded degree and any license or candidate registration." }}</span></div>
            <label v-else>{{ field.label }}<input v-model="contractOverrides[field.key]" :readonly="['COMPANY_ADDRESS', 'ASSIGNED_OFFICE_NAME', 'ASSIGNED_OFFICE_ADDRESS'].includes(field.key) || (agreementBuilder && field.key === 'ROLE_LABEL')" /></label>
          </template>
          <label v-if="showSchoolDays">Expected school days / week <input id="prehire-school-days" v-model="contract.minDays" type="number" min="1" max="7" step="1" /><span class="muted small">Enter the agreed number of school days for this hire.</span></label>
          <label v-if="agreementBuilder && agreementVariant === 'student'">University / training institution<input v-model="contractOverrides.UNIVERSITY_NAME" /></label>
          <label v-if="agreementBuilder && agreementVariant === 'student'">Starting training phase<select v-model="contractOverrides.TRAINING_START_PHASE"><option value="practicum">Practicum → internship</option><option value="internship">Direct-entry internship</option></select><span class="muted">One agreement covers both phases. Practicum continues into internship unless either party gives written notice of non-continuation, subject to academic requirements and the practicum review.</span></label>
        </div>
        <p v-if="!contractOverrides.COMPANY_ADDRESS" class="sph-warn">The agency’s place-of-business address is missing. Set it in agency settings, then refresh contract settings.</p>
        <p class="muted">Confirm these values against the candidate and your agency records.</p>
        <button id="prehire-preview-button" type="button" class="btn btn-primary" :disabled="previewBusy || (contractTenant!=='nlu' && (!contractConfigId || !probationChosen))" @click="previewContract">{{ previewBusy ? 'Preparing preview…' : 'Update contract preview' }}</button>
        <div v-if="previewError" id="prehire-preview-error" role="alert" class="error"><p>{{ previewError }}</p><button v-if="contractTenant==='nlu'" type="button" @click="resolveSetupIssue(previewError)">{{ prehireIssueDestination(previewError).label }}</button></div>
        <div v-if="contractPreview?.unresolvedTokens?.length" role="alert" class="error">Complete these fields:<ul><li v-for="key in contractPreview.unresolvedTokens" :key="key">{{ CONTRACT_SERVICE_ROLE_FIELD_LABELS[key] || key.replaceAll('_', ' ') }} <button v-if="contractTenant==='nlu'" type="button" @click="resolveSetupIssue(CONTRACT_SERVICE_ROLE_FIELD_LABELS[key] || key,key)">Go to field</button></li></ul></div>
        <div v-if="contractPreview?.unresolvedTokens?.length" class="sph-grid"><label v-for="key in additionalContractFields" :id="`prehire-field-${key}`" :key="key">{{ key.replaceAll('_', ' ') }}<input :value="contractOverrides[key]" @input="setAdditionalContractField(key, $event.target.value)" /></label></div>
        <p v-if="contractPreview && !previewMatches" class="sph-warn">Values changed. Update the preview before reviewing it.</p>
        <iframe v-if="contractPreview" ref="contractPreviewFrame" class="sph-preview" :srcdoc="contractHandbookSrcdoc(contractPreview.html)" sandbox="allow-scripts" title="Candidate employment agreement preview" />
        <StandardAgreementApproval v-if="requiresActivation" :agency-id="agencyId" :config-id="Number(contractConfigId)" :agency-name="contractOverrides.COMPANY_NAME || wizardTokens.COMPANY_NAME || 'this organization'" :preview-ready="!!contractPreview?.html?.trim() && previewMatches && !contractPreview.unresolvedTokens?.length" :library-url="contractsPath" @approved="refreshContractLibrary" />
        <label v-if="contractPreview && previewMatches && !contractPreview.unresolvedTokens?.length" class="sph-check"><input v-model="contractReviewed" type="checkbox" />I reviewed this agreement and its values.</label>
      </section>

      <section v-show="setupStep === 2" class="sph-card">
        <h2>Documents selected for this job</h2>
        <p class="muted">
          Pulled from this candidate’s job posting (Careers → edit posting → Pre-hire documents),
          plus agency defaults. Titles come from those settings — you don’t re-enter them here.
        </p>
        <div v-if="!jobDocs.length" class="sph-empty-docs">
          <p class="muted">No job-level documents yet.</p>
          <p class="muted small">
            Add them on the job posting under <strong>Pre-hire documents for this job</strong>
            (or set agency defaults in Hiring &amp; Pre-Hire settings). Refresh this page after editing the defaults, or add a document step above for this person.
          </p>
          <a :href="careersEditPath" target="_blank" rel="noopener">Edit job documents ↗</a>
        </div>
        <article v-for="(doc, idx) in availableJobDocs" :key="doc.id || idx" class="sph-doc sph-document-card">
          <label class="sph-check"><input v-model="doc.selected" type="checkbox" /><strong>{{ doc.title }}</strong></label>
          <p class="sph-kind">{{ docSource(doc) }} · {{ doc.templateId ? `Library template #${doc.templateId}` : 'Saved in this setup' }} · {{ jobDocumentActionLabel(doc) }}</p>
          <p>{{ documentAction(doc) }}</p>
          <p v-if="doc.instructions" class="muted small">{{ doc.instructions }}</p>
          <HireSetupDocumentPreview v-if="doc.templateId || doc.bodyHtml || doc.filePath" :title="doc.title" :agency-id="agencyId" :job-id="jobId" :document-id="String(doc.id)" />
          <a v-if="safeUrl(doc.url)" :href="safeUrl(doc.url)" target="_blank" rel="noopener">Open resource ↗</a>
          <p v-if="!doc.templateId && !doc.bodyHtml && !doc.filePath && !safeUrl(doc.url)" class="sph-warn">No saved content is attached to this item. Open the job settings to add it.</p>
          <a :href="docSource(doc) === 'Agency default' ? settingsPath : careersEditPath" target="_blank" rel="noopener">View or edit source settings ↗</a>
        </article>
        <p class="muted small">Documents written or uploaded in job settings are saved with that setup. They appear in the Documents Library only when they use a library template. Reusable templates can also be assigned during onboarding and other document workflows.</p>
        <HireWorkflowEditor v-model="portalWorkflow" :templates="packetDocumentTemplates.filter(availableHiringTemplate)" :agency-id="agencyId" phase="pre_hire" heading="Add a step for this person" description="Add only what this hire needs before onboarding. Each item below explains what the candidate does and what the app saves." />
        <div class="sph-upload">
          <label>Upload additional files (stored on the employee file)
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*" @change="onExtraFiles" />
          </label>
          <p class="muted small">
            You can select multiple files. Titles default from each filename (editable below).
          </p>
          <ul v-if="extraFiles.length" class="sph-extra-list">
            <li v-for="(f, idx) in extraFiles" :key="`${f.name}-${idx}`" class="sph-extra-item">
              <label>Title
                <input v-model="f.title" type="text" class="input" :placeholder="f.name" />
              </label>
              <div class="sph-extra-meta">
                <span class="muted small">{{ f.name }}</span>
                <button type="button" class="sph-extra-remove" @click="removeExtraFile(idx)">Remove</button>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section v-show="setupStep === 3" class="sph-card">
        <h2>Contract cosigners</h2>
        <p class="muted">Each selected employee countersigns this employment contract after the candidate signs.</p>
        <div v-if="!signerAssignments.length" class="muted small" style="margin-bottom:10px;">
          No signer roles configured yet.
          <router-link :to="settingsPath">Add roles in Hiring &amp; Pre-Hire settings</router-link>,
          or add an ad-hoc signer below.
        </div>
        <label v-for="role in signerAssignments" :key="role.id" class="sph-doc">
          <span class="sph-kind">{{ role.roleLabel }}</span>
          <select v-model.number="role.userId" class="input">
            <option :value="null">Skip</option>
            <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
          </select>
        </label>
        <label class="sph-doc">
          <span class="sph-kind">+ Add signer</span>
          <select v-model.number="adhocSignerUserId" class="input">
            <option :value="null">None</option>
            <option v-for="u in staffUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
          </select>
        </label>
      </section>

      <section v-show="setupStep === 4" class="sph-card">
        <h2>Review each candidate step</h2>
        <p class="muted">Walk through each item, open its document, and review how the candidate completes it. These reviews confirm your setup; the candidate completes and signs their own work after receiving the invitation.</p>
        <HireStepReview :steps="candidateSteps" :agency-id="agencyId" :job-id="jobId" @reviewed="stepsReviewed = $event" @agreement="openAgreementPreview">
          <template #job-description><JobDescriptionSections v-if="detail?.jobDescription?.descriptionSections" :sections="detail.jobDescription.descriptionSections" :title="jobTitle" compact /><p v-else class="sph-description">{{ detail?.jobDescription?.description_text || detail?.jobDescription?.descriptionText }}</p></template>
        </HireStepReview>
      </section>

      <section v-show="setupStep === 5" class="sph-card">
        <h2>Review {{ candidateName }}’s pre-hire experience</h2>
        <p>The invitation goes to <strong>{{ candidateEmail }}</strong>. Their portal includes:</p>
        <ol class="sph-final-sequence"><li v-for="item in candidateSteps" :key="item.key"><strong>{{ item.title }}</strong> · {{ item.action }}<span class="muted small">{{ item.source }}</span></li></ol>
        <p>Workplace handbook: internal reference available during pre-hire; review and signed acknowledgment during onboarding.</p>
        <p v-if="!stepsReviewed" class="error">Review each candidate step before sending.</p>
        <p>Agreement: {{ agreementBuilder?.options.find(option => option.value === agreementVariant)?.label || contractConfigs.find(c => c.id === contractConfigId)?.name || 'Choose an agreement' }} · {{ contractReviewed ? 'Preview reviewed' : 'Preview must be reviewed' }}</p>
        <p>Compensation: Category {{ contract.compensationCategory || 'not selected' }}, Level {{ contract.compensationLevel || 'not selected' }}</p>
        <p v-if="!contractReviewed || !previewMatches" class="error">Return to Contract &amp; cosigners, update the preview, and confirm you reviewed it.</p>
        <p>Cosigners: {{ chosenSignerNames || 'None selected' }}</p>
        <p v-if="extraFiles.length">Additional employee files: {{ extraFiles.map(f => f.title || f.name).join(', ') }}</p>
        <p v-if="missingResources.length" class="error">Attach the missing resources in Select materials: {{ missingResources.map(r => r.title || 'Untitled step').join(', ') }}.</p>
        <p v-if="currentPortalLink"><a :href="currentPortalLink" target="_blank" rel="noopener">View the current candidate portal ↗</a></p>
        <p class="muted">The final action prepares their documents and sends their agency portal invitation. Onboarding is prepared separately after pre-hire review.</p>
      </section>
      <div v-if="sendError" role="alert" class="error">{{ sendError }} <button v-if="contractTenant==='nlu'" type="button" @click="resolveSetupIssue(sendError)">{{ prehireIssueDestination(sendError).label }}</button></div>
      <p v-if="contractWarning" class="sph-warn">{{ contractWarning }}</p>
      <div class="sph-actions">
        <button type="button" class="btn btn-secondary" @click="setupStep ? setupStep-- : goBack()">{{ setupStep ? 'Back' : 'Cancel' }}</button>
        <button v-if="setupStep < setupSteps.length - 1" type="button" class="btn btn-primary"  :disabled="(setupStep === 3 && (!contractReviewed || !previewMatches || !probationChosen)) || (setupStep === 4 && !stepsReviewed)" @click="setupStep++">Continue →</button>
        <button type="button" v-if="setupStep === 5" class="btn btn-primary" :disabled="sending || (!tokenLink && !readyToSend)" @click="tokenLink ? resendInvitation() : initiate()">
          {{ sending ? 'Sending invitation…' : tokenLink ? 'Email portal link again' : 'Prepare and send pre-hire invitation' }}
        </button>
      </div>
      <p v-if="tokenLink" role="status" :class="emailDelivery?.status === 'sent' ? 'sph-ok' : 'sph-warn'">{{ prehireInviteDeliveryMessage(emailDelivery) }}</p>
      <p v-if="tokenLink" class="sph-ok">
        Portal link created:
        <a :href="tokenLink" target="_blank" rel="noopener">{{ tokenLink }}</a>
      </p>
      <p v-if="tokenLink && contractTaskId" class="sph-ok">Employment contract task #{{ contractTaskId }} assigned to the candidate.</p>
    </template>
  </div>
</template>

<script setup>
import { prehireIssueDestination } from '../../utils/nluPrehireForm.js';
import CredentialPicker from '../../components/CredentialPicker.vue';
import { isSupervisor } from '../../utils/helpers.js';
import HireSetupDocumentPreview from '../../components/hiring/HireSetupDocumentPreview.vue';
import HireStepReview from '../../components/hiring/HireStepReview.vue';
import { availableHiringTemplate, builtInHireDocument, hireResourceHelp, standardPrehireSteps } from '../../navigation/hireDocuments.js';
import ContractServiceFocusSelect from '../../components/hiring/ContractServiceFocusSelect.vue';
import ContractProbationChoice from '../../components/hiring/ContractProbationChoice.vue';
import {PROVIDER_DESIGNATION_LABELS} from '../../constants/providerDesignationLevels.js';
import ContractHandbookModal from '../../components/documents/ContractHandbookModal.vue';
import {contractHandbookSrcdoc,referenceFromContractMessage} from '../../utils/contractHandbookReferences.js';
import JobDescriptionSections from '../../components/careers/JobDescriptionSections.vue';
import HireWorkflowEditor from '../../components/admin/HireWorkflowEditor.vue';
import ContractExpectationsEditor from '../../components/careers/ContractExpectationsEditor.vue';
import StandardAgreementApproval from '../../components/hiring/StandardAgreementApproval.vue';
import { CONTRACT_SERVICE_ROLE_FIELD_LABELS } from '../../constants/contractServiceRoles.js';
import { computed, onMounted, onBeforeUnmount, nextTick, reactive, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import apiClient from '../../services/api';
import PlotlineSignature from '../../components/plotline/PlotlineSignature.vue';
// This workspace owns its loading states. Autosave and previews keep the page usable.
const api = {
  get: (url, config = {}) => apiClient.get(url, { ...config, skipGlobalLoading: true }),
  post: (url, body, config = {}) => apiClient.post(url, body, { ...config, skipGlobalLoading: true }),
  put: (url, body, config = {}) => apiClient.put(url, body, { ...config, skipGlobalLoading: true }),
  patch: (url, body, config = {}) => apiClient.patch(url, body, { ...config, skipGlobalLoading: true })
};
import { prehireInviteDeliveryMessage } from '../../utils/prehireInviteDelivery.js';
import { useAgencyStore } from '../../store/agency';
import { mapSignerRolesWithDefaults } from '../../utils/hiringSignerDefaults.js';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(true);
const workspaceRoot = ref(null);
const sending = ref(false);
const error = ref('');
const sendError = ref('');
const contractWarning = ref('');
const handbookReference=ref(null),contractPreviewFrame=ref(null);
function onContractHandbookMessage(event){const reference=referenceFromContractMessage(event,contractPreviewFrame.value,{expectedAgencyId:agencyId.value});if(reference)handbookReference.value=reference;}
onMounted(()=>window.addEventListener('message',onContractHandbookMessage));
onBeforeUnmount(()=>window.removeEventListener('message',onContractHandbookMessage));
const detail = ref(null);
const settings = ref({});
const extraFiles = ref([]);
const tokenLink = ref('');
const emailDelivery = ref(null);
const jobDocs = ref([]);
const inferredPayLabel = ref('');
const inferredCategory = ref(null);
const compensationLevels = ref([]), offices = ref([]), officeLocationId = ref(null), officeSource = ref('');
const officeGroups = computed(() => {
  const groups = new Map();
  for (const office of offices.value) {
    const city = [office.city, office.state].filter(Boolean).join(', ') || 'Agency offices';
    if (!groups.has(city)) groups.set(city, []);
    groups.get(city).push(office);
  }
  return [...groups].map(([city, offices]) => ({ city, offices }));
});
const serviceFocusOptions = ref([]), schoolDaysEnabled = ref(false);
const compensationCategories = ref({1:{label:'Unlicensed'},2:{label:'Pre-licensed'},3:{label:'Licensed'}});
const contractTenant = ref(''), contractServiceRoleOptions = ref([]), serviceCompensation = ref(null), individualExpectations = ref({});
const usesIndividualAgreement = computed(() => contractTenant.value === 'isi' && individualExpectations.value.individualCompensationBasis === 'approved_individual_agreement');
const categoryServicePay = computed(() => agreementBuilder.value?.compensationBasis === 'category_service');
const requiresActivation = computed(() => { const config = contractConfigs.value.find(c => Number(c.id) === Number(contractConfigId.value)); return !!config && config.is_active != null && Number(config.is_active) !== 1; });
const compensationChosen = computed(() => usesIndividualAgreement.value || Boolean(contract.compensationCategory && contract.compensationLevel));
const agreementBuilder = ref(null), agreementVariant = ref('');
function applyAgreementVariant() {
  if (agreementBuilder.value && !agreementBuilder.value.options.some(option => option.value === agreementVariant.value)) agreementVariant.value = agreementBuilder.value.suggestedVariant;
  const option = agreementBuilder.value?.options.find(option => option.value === agreementVariant.value);
  contractConfigId.value = option?.configId || null;
  if (option?.roleLabel && (!['nlu', 'isi'].includes(contractTenant.value) || !contractOverrides.ROLE_LABEL)) contractOverrides.ROLE_LABEL = option.roleLabel;
}
const selectedCompensation = computed(() => compensationLevels.value.find(r => Number(r.category) === Number(contract.compensationCategory) && Number(r.level) === Number(contract.compensationLevel)));
const nluProgramRates = computed(() => {
  if(contractTenant.value!=='nlu' || !contract.compensationLevel)return [];
  return Object.entries(serviceCompensation.value?.programs || {}).flatMap(([service,definition])=>{
    const rate=definition.rates?.[contract.compensationCategory]?.[Number(contract.compensationLevel)-1];
    if(!(Number(rate)>0))return [];
    return [{service,rate:Number(rate),selectedRate:contract.probationChoice==='yes' && Number(contract.compensationCategory)>=3?Math.round(Number(rate)*85)/100:Number(rate),indirectMinutesPerHour:definition.indirectMinutesPerHour}];
  });
});
const money = value => value == null ? 'Not configured' : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value);
function levelLabel(level) { const row = compensationLevels.value.find(r => Number(r.category) === Number(contract.compensationCategory) && Number(r.level) === level); return row ? ` — ${row.label || money(row.ffs_rate ?? row.direct_rate)}` : ' — not configured'; }
function applyOffice() { contractOverrides.ASSIGNED_OFFICE_ID = officeLocationId.value || ''; const office = offices.value.find(o => Number(o.id) === Number(officeLocationId.value)); contractOverrides.ASSIGNED_OFFICE_NAME = office?.name || ''; contractOverrides.ASSIGNED_OFFICE_ADDRESS = office?.address || ''; officeSource.value = office ? 'Selected office' : ''; }

const signerAssignments = ref([]);
const staffUsers = ref([]);
const adhocSignerUserId = ref(null);
const wizardTokens = ref({});
const contractConfigId = ref(null);
const libraryContractTemplateId = ref(null);
const contractConfigs = ref([]);
const contractTaskId = ref(null);
const portalWorkflow = ref({});
const packetTemplateId = ref('');
const prehirePackageId = ref(null);
const packageDetails = ref(null);
const packetPackages = ref([]);
const packetDocumentTemplates = ref([]);
const meaningfulWorkflow = (value) => Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== '' && v != null));
let baseWorkflow = {};
let jobPrehirePackageId = null;
function applyPacketTemplate() {
  const personSupervision = Object.fromEntries(['supervisorRole', 'supervisorUserId', 'spanishProvider'].filter(key => Object.hasOwn(portalWorkflow.value, key)).map(key => [key, portalWorkflow.value[key]]));
  const preset = (settings.value.hire_packet_templates || []).find(p => p.id === packetTemplateId.value);
  const resources = new Map((baseWorkflow.resources || []).map(r => [r.id, r]));
  for (const r of preset?.workflow?.resources || []) resources.set(r.id, r);
  portalWorkflow.value = JSON.parse(JSON.stringify({ supervisorRole: false, supervisorUserId: null, ...baseWorkflow, ...meaningfulWorkflow(preset?.workflow), ...personSupervision, resources: [...resources.values()] }));
  prehirePackageId.value = preset?.prehirePackageId || jobPrehirePackageId || settings.value.default_prehire_package_id || null;
  const excluded = new Set([...(baseWorkflow.excludedResourceIds || []), ...(preset?.workflow?.excludedResourceIds || [])]);
  portalWorkflow.value.resources = (portalWorkflow.value.resources || []).filter(r => !builtInHireDocument(r) && r.phase !== 'onboarding' && !excluded.has(r.id)).map(r => ({ ...r, phase: 'pre_hire' }));
  delete portalWorkflow.value.handbookUrl;
}
const includeSupervisor = ref(false);

function localDateToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
const contract = reactive({
  probationChoice:'',probationTerms:'',providerDesignationLevel:'',
  startDate: '',
  executionDate: localDateToday(),
  expirationDate: '',
  licenseBy: '',
  minDays: '',
  minHours: '',
  compensationCategory: '',
  compensationLevel: ''
});

const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}${path}` : path;
};

const agencyId = computed(() => Number(route.query.agencyId || agencyStore.currentAgency?.id || 0));
const userId = computed(() => Number(route.params.userId || 0));
const candidateName = computed(() => {
  const u = detail.value?.user || {};
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Candidate';
});
const candidateEmail = computed(() => detail.value?.user?.personal_email || detail.value?.user?.email || '—');
const initials = computed(() => candidateName.value.split(/\s+/).map(part => part[0]).slice(0, 2).join(''));
const candidateRecordPath = computed(() => orgPath(`/admin/hiring/applicants?agencyId=${agencyId.value}&candidateId=${userId.value}`));
const stageLabel = computed(() => detail.value?.profile?.stage_label || String(detail.value?.user?.status || 'Preparing pre-hire').replaceAll('_', ' '));
const formatDate = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date) : 'Date not provided'; };
const languageList = computed(() => { try { const raw = detail.value?.profile?.fluent_languages_json; const values = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(values) ? values.join(', ') : ''; } catch { return ''; } });
const personFacts = computed(() => [
  { label: 'Personal email', value: candidateEmail.value === '—' ? '' : candidateEmail.value },
  { label: 'Phone', value: detail.value?.user?.personal_phone || detail.value?.user?.phone_number },
  { label: 'Credentials / license', value: credentialLabel.value },
  { label: 'Languages', value: languageList.value },
  { label: 'Hiring stage', value: stageLabel.value },
  { label: 'Application source', value: detail.value?.profile?.source },
  { label: 'Best time to contact', value: detail.value?.profile?.best_time_to_contact },
  { label: 'Work username', value: detail.value?.user?.work_email || 'Chosen by candidate during pre-hire' }
]);
const jobFacts = computed(() => [
  { label: 'Location', value: locationLabel.value },
  { label: 'Role type', value: detail.value?.jobDescription?.roleType },
  { label: 'Education / qualifications', value: detail.value?.jobDescription?.educationLevel },
  { label: 'Schedule', value: detail.value?.jobDescription?.scheduleText },
  { label: 'Assigned office', value: offices.value.find(o => Number(o.id) === Number(officeLocationId.value))?.name || 'Choose in Contract & cosigners' },
  { label: 'Linked posting', value: detail.value?.jobDescription?.id ? `Posting #${detail.value.jobDescription.id}` : 'No posting linked' }
]);
const jobTitle = computed(() =>
  detail.value?.jobDescription?.title
  || detail.value?.profile?.applied_role
  || ''
);
const credentialLabel = computed(() => {
  const p = detail.value?.profile || {};
  const cred = String(p.credential || wizardTokens.value.CREDENTIAL || '').trim();
  const lic = String(p.license_number || '').trim();
  if (cred && lic) return `${cred} · ${lic}`;
  return cred || lic || '';
});
const locationLabel = computed(() => {
  const jd = detail.value?.jobDescription || {};
  const city = jd.city || '';
  const state = jd.state || '';
  return [city, state].filter(Boolean).join(', ');
});

const careersEditPath = computed(() => {
  const q = `?agencyId=${agencyId.value}&editJobId=${detail.value?.jobDescription?.id || detail.value?.profile?.job_description_id || ''}`;
  return orgPath(`/admin/careers${q}`);
});

const settingsPath = computed(() => {
  const q = agencyId.value ? `?agencyId=${agencyId.value}&category=workflow&item=hiring-prehire` : '?category=workflow&item=hiring-prehire';
  return orgPath(`/admin/settings${q}`);
});

const docKindLabel = (kind) => {
  switch (String(kind || '').toLowerCase()) {
    case 'receipt': return 'View, download & acknowledge receipt';
    case 'company_document': return 'Fill and sign in the app';
    case 'upload': return 'candidate upload';
    case 'print_only': return 'printable';
    case 'reference': return 'external link';
    case 'acknowledgement': return 'job description sign';
    default: return kind || 'document';
  }
};

const goBack = () => router.push(orgPath('/admin/hiring/applicants'));

const titleFromFilename = (name) =>
  String(name || 'Document').replace(/\.[^.]+$/, '').trim() || 'Document';

const uploadingFiles = ref(false);
const onExtraFiles = async (e) => {
  const picked = Array.from(e?.target?.files || []);
  if (!picked.length) return;
  uploadingFiles.value = true;
  try {
    for (const file of picked) {
      const title = titleFromFilename(file.name);
      const form = new FormData(); form.append('file', file); form.append('title', title); form.append('docType', 'prehire_upload');
      const { data } = await api.post(`/users/${userId.value}/admin-docs/upload`, form);
      extraFiles.value.push({ id: data?.id || data?.document?.id, name: file.name, title });
    }
    await flushDraft();
  } catch (e) { draftSaveError.value = e.response?.data?.error?.message || 'Could not save the attached file. Select it again to retry.'; }
  finally { uploadingFiles.value = false; }
  if (e?.target) e.target.value = '';
};

const removeExtraFile = (idx) => {
  extraFiles.value = extraFiles.value.filter((_, i) => i !== idx);
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [cand, setRes, rolesRes, usersRes, wizardRes, packagesRes, documentsRes] = await Promise.all([
      api.get(`/hiring/candidates/${userId.value}`, { params: { agencyId: agencyId.value }, skipGlobalLoading: true }),
      api.get('/hiring/settings', { params: { agencyId: agencyId.value }, skipGlobalLoading: true }).catch(() => ({ data: {} })),
      api.get('/hiring/signer-roles', { params: { agencyId: agencyId.value }, skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get('/users', { params: { agencyId: agencyId.value, staffOnly: true }, skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get(`/contracts/candidates/${userId.value}/wizard-context`, { params: { agencyId: agencyId.value }, skipGlobalLoading: true }),
      api.get('/onboarding-packages', { params: { agencyId: agencyId.value }, skipGlobalLoading: true }),
      api.get('/document-templates', { params: { agencyId: agencyId.value, limit: 1000 }, skipGlobalLoading: true })
    ]);
    detail.value = cand.data;
    settings.value = setRes.data?.settings || setRes.data || {};
    staffUsers.value = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    signerAssignments.value = mapSignerRolesWithDefaults(roles, staffUsers.value);
    wizardTokens.value = wizardRes.data?.tokens || {};
    compensationLevels.value = wizardRes.data?.compensationLevels || [];
    compensationCategories.value = wizardRes.data?.compensationCategories || compensationCategories.value;
    contractTenant.value = wizardRes.data?.contractTenant || '';
    contractServiceRoleOptions.value = wizardRes.data?.contractServiceRoleOptions || [];
    serviceCompensation.value = wizardRes.data?.serviceCompensation || null;
    individualExpectations.value = { ...wizardTokens.value.CONTRACT_POSTING_DEFAULTS,
      serviceRoles: wizardTokens.value.CONTRACT_SERVICE_ROLES || [],
      serviceRoleDetails: wizardTokens.value.CONTRACT_SERVICE_ROLE_DETAILS || wizardTokens.value.CONTRACT_POSTING_DEFAULTS?.serviceRoleDetails || {},
      individualCompensationBasis: wizardTokens.value.INDIVIDUAL_COMPENSATION_BASIS || (contractTenant.value === 'isi' ? 'approved_individual_agreement' : ''),
      priorAgreementReference: wizardTokens.value.PRIOR_COMPENSATION_AGREEMENT_REFERENCE || '' };
    serviceFocusOptions.value = wizardRes.data?.serviceFocusOptions || [];
    schoolDaysEnabled.value = wizardRes.data?.schoolDaysEnabled === true;
    offices.value = wizardRes.data?.offices || [];
    officeLocationId.value = wizardRes.data?.suggested?.officeLocationId || null;
    officeSource.value = wizardTokens.value.ASSIGNED_OFFICE_SOURCE || '';
    contract.compensationCategory = String(wizardRes.data?.suggested?.compensationCategory || '');
    // Require a deliberate level choice; do not silently accept level 1.
    contract.compensationLevel = '';
    for (const field of contractFields) contractOverrides[field.key] = wizardTokens.value[field.key] || '';
    contractOverrides.COMPANY_ADDRESS = wizardRes.data?.agency?.address || wizardTokens.value.COMPANY_ADDRESS || '';
    contractOverrides.UNIVERSITY_NAME = wizardTokens.value.UNIVERSITY_NAME || wizardTokens.value.UNIVERSITY || '';
    const defaultOfficeSource = officeSource.value;
    applyOffice();
    officeSource.value = defaultOfficeSource;
    contractOverrides.JOB_TITLE = wizardTokens.value.JOB_TITLE || jobTitle.value;
    currentPortalLink.value = (await api.get(`/hiring/candidates/${userId.value}/prehire-link`, { params: { agencyId: agencyId.value }, skipGlobalLoading: true }).catch(() => ({ data: {} }))).data?.portalLink || '';
    contractConfigs.value = Array.isArray(wizardRes.data?.configs) ? wizardRes.data.configs : [];
    contractConfigId.value = wizardRes.data?.suggested?.configId
      || settings.value.default_contract_config_id
      || null;
    agreementBuilder.value = wizardRes.data?.agreementBuilder || null;
    if (agreementBuilder.value) { agreementVariant.value = agreementBuilder.value.suggestedVariant; contractOverrides.TRAINING_START_PHASE = agreementBuilder.value.suggestedTrainingStartPhase || 'internship'; applyAgreementVariant(); }
    libraryContractTemplateId.value = settings.value.default_contract_template_id || null;
    if (wizardTokens.value.START_DATE) contract.startDate = String(wizardTokens.value.START_DATE).slice(0, 10);
    if (wizardTokens.value.MIN_HOURS) contract.minHours = wizardTokens.value.MIN_HOURS;
    if (wizardTokens.value.MIN_DAYS_PER_WEEK) contract.minDays = wizardTokens.value.MIN_DAYS_PER_WEEK;
    const jd = cand.data?.jobDescription || {};
    const jobConfig = jd.prehireConfig || { documents: [] };
    jobPrehirePackageId = jobConfig.prehirePackageId || null;
    packetPackages.value = Array.isArray(packagesRes.data) ? packagesRes.data : [];
    packetDocumentTemplates.value = Array.isArray(documentsRes.data) ? documentsRes.data : documentsRes.data?.templates || documentsRes.data?.data || [];
    const resourceDefaults = new Map((settings.value.portal_workflow?.resources || []).map(r => [r.id, r]));
    for (const r of jobConfig.workflow?.resources || []) resourceDefaults.set(r.id, r);
    baseWorkflow = { ...settings.value.portal_workflow, ...meaningfulWorkflow(jobConfig.workflow), resources: [...resourceDefaults.values()] };
    applyPacketTemplate();
    const defaults = Array.isArray(settings.value.default_prehire_docs) ? settings.value.default_prehire_docs : [];
    const seen = new Set();
    const merged = [];
    for (const d of [...(jobConfig.documents || []), ...defaults.filter(d => !(jobConfig.excludedDocumentIds || []).includes(d.id))]) {
      const id = String(d.id || d.title || '');
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push({
        ...d,
        id: d.id || `doc-${merged.length}`,
        title: d.title || d.name || 'Document',
        kind: d.kind || d.type || 'acknowledgement',
        instructions: d.instructions || '',
        templateId: d.templateId || d.documentTemplateId || null,
        selected: d.selected !== false
      });
    }
    jobDocs.value = merged;
    const cred = String(cand.data?.profile?.credential || wizardTokens.value.CREDENTIAL || '').trim();
    if (cred) {
      try {
        const { data } = await api.get('/contracts/infer-compensation', {
          params: { agencyId: agencyId.value, credential: cred, jobTitle: jobTitle.value },
          skipGlobalLoading: true
        });
        inferredCategory.value = data.compensationCategory || null;
        inferredPayLabel.value = data.payCategoryLabel
          ? `Cat ${data.compensationCategory} — ${data.payCategoryLabel}`
          : '';
        if (data.compensationCategory) {
          contract.compensationCategory = String(data.compensationCategory);
        }
      } catch { /* ignore */ }
    }
    await restoreDraft();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load candidate';
  } finally {
    loading.value = false;
  }
};

const initiate = async () => {
  if (!readyToSend.value) return;
  sendError.value = '';
  contractWarning.value = '';
  contractTaskId.value = null;
  sending.value = true;
  try {
    await flushDraft();
    if (draftSaveError.value) throw new Error(draftSaveError.value);
    for (const item of extraFiles.value.filter(item => item.file)) {
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('title', String(item.title || '').trim() || titleFromFilename(item.name));
      fd.append('docType', 'prehire_upload');
      await api.post(`/users/${userId.value}/admin-docs/upload`, fd);
    }
    const templateIds = availableJobDocs.value
      .filter((d) => d.selected && d.templateId)
      .map((d) => Number(d.templateId))
      .filter(Boolean);
    const tokens = contractTokens.value;
    const signers = [
      ...signerAssignments.value
        .filter((s) => s.userId)
        .map((s) => ({ userId: s.userId, roleLabel: s.roleLabel, fieldKey: s.fieldKey })),
      ...(adhocSignerUserId.value
        ? [{ userId: adhocSignerUserId.value, roleLabel: 'Cosigner', fieldKey: null }]
        : [])
    ];
    const { data } = await api.post(
      `/hiring/candidates/${userId.value}/send-prehire`,
      {
        packetTemplateId: packetTemplateId.value,
        packageId: prehirePackageId.value,
        portalWorkflow: portalWorkflow.value,
        documentTemplateIds: templateIds,
        selectedJobDocs: availableJobDocs.value.filter((d) => d.selected),
        signerAssignments: signers,
        contractTokens: tokens,
        compensationLevel: contract.compensationLevel,
        officeLocationId: officeLocationId.value,
        compensationCategory: contract.compensationCategory || inferredCategory.value || null,
        credential: contractCredential.value || null,
        contractConfigId: contractConfigId.value,
        contractPreviewHash: contractPreview.value?.previewHash,
        contractBuilderTemplateId: null,
        libraryContractTemplateId: libraryContractTemplateId.value,
        includeSupervisor: effectiveIncludeSupervisor.value,
        msgSubject: settings.value.invite_email_subject || null,
        msgBody: settings.value.invite_email_body || null
      },
      { params: { agencyId: agencyId.value }, skipGlobalLoading: true }
    );
    emailDelivery.value = data?.email || null;
    tokenLink.value = data?.passwordlessTokenLink || '';
    contractTaskId.value = data?.contractTaskId || null;
    contractWarning.value = data?.contractWarning || '';
    extraFiles.value = [];
  } catch (e) {
    sendError.value = e.response?.data?.error?.message || 'Failed to initiate pre-hire';
  } finally {
    sending.value = false;
  }
};

const resendInvitation = async () => {
  sending.value = true;
  sendError.value = '';
  try {
    const { data } = await api.post(`/hiring/candidates/${userId.value}/email-prehire-link`, {}, { params: { agencyId: agencyId.value }, skipGlobalLoading: true });
    emailDelivery.value = data?.email || null;
    tokenLink.value = data?.passwordlessTokenLink || tokenLink.value;
  } catch (e) {
    sendError.value = e.response?.data?.error?.message || 'Failed to resend invitation.';
  } finally { sending.value = false; }
};

const setupSteps = ['Person & job', 'Role & supervision', 'Select materials', 'Contract & cosigners', 'Review each step', 'Review & invite'];
const setupStep = ref(0), currentPortalLink = ref('');
let explicitSetupFocus = false;
watch(setupStep, async () => {
  if (loading.value || explicitSetupFocus) return;
  await nextTick();
  if (explicitSetupFocus) return;
  const section = [...(workspaceRoot.value?.querySelectorAll('.sph-card') || [])].find(card => card.style.display !== 'none');
  const heading = section?.querySelector('h2');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); heading.scrollIntoView?.({ block: 'start', behavior: 'instant' }); }
});
const contractFields = [{ key: 'COMPANY_NAME', label: 'Employer name' }, { key: 'COMPANY_ADDRESS', label: 'Employer address' }, { key: 'JOB_TITLE', label: 'Employment title' }, { key: 'ROLE_LABEL', label: 'Role label' }, { key: 'SERVICE_FOCUS', label: 'Service focus' }, { key: 'LICENSE_TYPE', label: 'License / credential' }, { key: 'ASSIGNED_OFFICE_NAME', label: 'Assigned office' }, { key: 'ASSIGNED_OFFICE_ADDRESS', label: 'Office address' }];
const visibleContractFields = computed(()=>contractFields.filter(field=>contractTenant.value!=='isi'||field.key!=='SERVICE_FOCUS'));
const contractOverrides = reactive({}), contractPreview = ref(null), contractReviewed = ref(false), previewBusy = ref(false), previewError = ref('');
const showSchoolDays = computed(() => schoolDaysEnabled.value && /\bschools?\b/i.test(contractOverrides.SERVICE_FOCUS || ''));
watch(showSchoolDays, visible => { if (!visible) contract.minDays = ''; });
const contractsPath = computed(() => orgPath(`/admin/contracts?agencyId=${agencyId.value}&candidateUserId=${userId.value}&tab=library`));
const eligibleSupervisors = computed(() => staffUsers.value.filter(u => Number(u.id) !== Number(userId.value) && isSupervisor(u)));
const effectiveIncludeSupervisor = computed(() => individualExpectations.value.includeSupervision ?? (includeSupervisor.value || !!portalWorkflow.value.supervisorUserId));
const handbookPath = computed(() => orgPath(`/workplace-handbook?agencyId=${agencyId.value}`));
const jobId = computed(() => detail.value?.jobDescription?.id || detail.value?.profile?.job_description_id || null);
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const availableJobDocs = computed(() => jobDocs.value.filter(d => d.kind !== 'acknowledgement' && !builtInHireDocument(d)));
const missingJobDocuments = computed(() => availableJobDocs.value.filter(d => d.selected && d.kind === 'company_document' && !d.templateId && !d.bodyHtml && !d.filePath));
function docSource(doc) {
  const config = detail.value?.jobDescription?.prehireConfig;
  return (config?.documents || []).some(d => String(d.id) === String(doc.id)) ? 'Job posting' : 'Agency default';
}
function documentAction(doc) {
  if (doc.templateId) return packetDocumentTemplates.value.find(t => Number(t.id) === Number(doc.templateId))?.document_action_type === 'review' ? 'The candidate opens this review-only template in the portal and confirms they have read it. No signature is requested.' : hireResourceHelp.document;
  return ({ company_document: 'The candidate opens this document in the portal, fills in information or places text and a signature on the PDF, then submits the signed copy.', receipt: 'The candidate views or downloads the file and confirms receipt. No signature is requested.', upload: 'The candidate downloads the blank form if provided, completes it, and uploads their completed file.', reference: 'The candidate opens the website as an optional reference. No signature is requested.', print_only: 'The candidate reads or prints these instructions. No signature is requested.' })[doc.kind] || 'Review the document and follow its instructions.';
}
function jobDocumentActionLabel(doc) { return doc.templateId ? (packetDocumentTemplates.value.find(t => Number(t.id) === Number(doc.templateId))?.document_action_type === 'review' ? 'Read and acknowledge' : 'Fill and sign in the app') : docKindLabel(doc.kind); }
const collectionError = ref('');
let collectionRequest = 0;
async function loadCollection() {
  const current = ++collectionRequest; packageDetails.value = null; collectionError.value = '';
  if (!prehirePackageId.value) return;
  try {
    const { data } = await api.get(`/onboarding-packages/${prehirePackageId.value}`, { skipGlobalLoading: true });
    if (current === collectionRequest) packageDetails.value = data;
  } catch (e) { if (current === collectionRequest) collectionError.value = e.response?.data?.error?.message || 'Could not load the selected collection.'; }
}
watch(prehirePackageId, loadCollection);
const collectionDocuments = computed(() => (packageDetails.value?.documents || []).filter(d => !builtInHireDocument(d)));
const stepsReviewed = ref(false);
const candidateSteps = computed(() => {
  const result = standardPrehireSteps.map(item => item.key === 'agreement'
    ? {...item, agreementReady: contractReviewed.value && previewMatches.value}
    : item);
  for (const doc of availableJobDocs.value.filter(d => d.selected && !d.templateId)) {
    result.push({ key: `doc-${doc.id}`, documentId: doc.bodyHtml || doc.filePath ? String(doc.id) : null, title: doc.title, source: docSource(doc),
      required: !['reference', 'print_only'].includes(doc.kind), action: jobDocumentActionLabel(doc), instructions: documentAction(doc), url: safeUrl(doc.url),
      unavailable: missingJobDocuments.value.includes(doc) });
  }
  const templates = new Set();
  const addTemplate = (id, title, source, required = true) => {
    id = Number(id);
    if (id && templates.has(id)) return;
    if (id) templates.add(id);
    const template = packetDocumentTemplates.value.find(t => Number(t.id) === id);
    if (builtInHireDocument({ title }) || builtInHireDocument(template)) return;
    const reviewOnly = template?.document_action_type === 'review';
    result.push({ key: `template-${id || title}`, title, source, required, templateId: id || null, action: reviewOnly ? 'Read and acknowledge' : 'Fill and sign in the portal', instructions: reviewOnly ? 'The candidate opens the document and confirms they reviewed it. No signature is requested.' : hireResourceHelp.document, unavailable: !id });
  };
  // Match the portal: authored job documents, then assigned document tasks,
  // then custom resources, and finally submission.
  for (const doc of availableJobDocs.value.filter(d => d.selected && !d.templateId)) result.push({ key: `doc-${doc.id}`, title: doc.title, source: docSource(doc), required: !['reference', 'print_only'].includes(doc.kind), action: docKindLabel(doc.kind), instructions: [documentAction(doc), doc.instructions].filter(Boolean).join(' '), documentId: doc.bodyHtml || doc.filePath ? String(doc.id) : null, url: safeUrl(doc.url), unavailable: missingJobDocuments.value.includes(doc) });
  for (const doc of collectionDocuments.value) addTemplate(doc.document_template_id, doc.document_name || doc.name || doc.title || 'Untitled document', packageDetails.value?.name || 'Saved collection');
  if (portalWorkflow.value.supervisorRole) addTemplate(portalWorkflow.value.supervisorTemplateId, 'Supervisor acknowledgment', 'Supervisory role');
  for (const resource of portalWorkflow.value.resources || []) if (resource.kind === 'document') addTemplate(resource.templateId, resource.title, 'Additional step', resource.required !== false);
  for (const doc of availableJobDocs.value.filter(d => d.selected && d.templateId)) addTemplate(doc.templateId, doc.title, docSource(doc));
  for (const resource of portalWorkflow.value.resources || []) if (resource.kind !== 'document' && !builtInHireDocument(resource)) result.push({ ...resource, key: resource.id, source: 'Additional step', url: safeUrl(resource.url), action: ({ video: 'Watch and confirm', link: 'Open and confirm completion', meeting: 'Book and enter confirmed time', acknowledgement: 'Read and sign an acknowledgment', upload: 'Complete and upload' })[resource.kind], instructions: [hireResourceHelp[resource.kind], resource.instructions].filter(Boolean).join(' '), unavailable: resource.required !== false && !safeUrl(resource.url) });
  result.push({ key: 'review', title: 'Final review and submission', source: 'Provided by the app', action: 'Submit pre-hire for review', instructions: 'The candidate checks their completed work and submits it to People Operations. Onboarding begins after staff review.', required: false });
  return result;
});
const assignedSupervisorName = computed(() => { const u = staffUsers.value.find(u => Number(u.id) === Number(portalWorkflow.value.supervisorUserId)); return u ? `${u.first_name} ${u.last_name}` : ''; });
const contractCredential = computed({
  get: () => contractOverrides.CREDENTIAL ?? wizardTokens.value.CREDENTIAL ?? detail.value?.profile?.credential ?? '',
  set: value => { contractOverrides.CREDENTIAL=value; contractOverrides.LICENSE_TYPE=value; }
});
const contractTokens = computed(() => ({ ...wizardTokens.value, ...contractOverrides, CREDENTIAL:contractCredential.value,
  AGREEMENT_SELECTION_DRIVEN: agreementBuilder.value ? '1' : '0', AGREEMENT_VARIANT: agreementVariant.value,
  ...(contractTenant.value ? {
    CONTRACT_EXPECTATIONS: individualExpectations.value,
    CONTRACT_SERVICE_ROLES: individualExpectations.value.serviceRoles || [],
    CONTRACT_SERVICE_ROLE_DETAILS: individualExpectations.value.serviceRoleDetails || {},
    INDIVIDUAL_COMPENSATION_BASIS: contractTenant.value === 'isi' ? individualExpectations.value.individualCompensationBasis || '' : '',
    PRIOR_COMPENSATION_AGREEMENT_REFERENCE: contractTenant.value === 'isi' ? individualExpectations.value.priorAgreementReference || '' : ''
  } : {}),
  PROBATION_APPLIES:contract.probationChoice,PROBATION_TERMS:contract.probationTerms,PROVIDER_DESIGNATION_LEVEL:contract.providerDesignationLevel,
  COMPENSATION_CATEGORY: usesIndividualAgreement.value ? '' : contract.compensationCategory, COMPENSATION_LEVEL: usesIndividualAgreement.value ? '' : contract.compensationLevel,
  START_DATE: contract.startDate, EXECUTION_DATE: contract.executionDate, EXPIRATION_DATE: contract.expirationDate,
  CANDIDATE_NAME: candidateName.value, EMPLOYEE_FULL_NAME: candidateName.value,
  SUPERVISOR_NAME: effectiveIncludeSupervisor.value ? assignedSupervisorName.value : '', INCLUDE_SUPERVISION: effectiveIncludeSupervisor.value ? '1' : '0',
  LICENSURE_DEADLINE: contract.licenseBy, MIN_DAYS_PER_WEEK: showSchoolDays.value ? contract.minDays : '', MIN_HOURS: contract.minHours,
  IS_SUPERVISOR: portalWorkflow.value.supervisorRole ? '1' : '0', SUPERVISOR_DUTIES: portalWorkflow.value.supervisorClause || '' }));
const contractFieldKeys = computed(() => ['START_DATE', 'EXECUTION_DATE', 'EXPIRATION_DATE', 'SUPERVISOR_NAME', 'LICENSURE_DEADLINE', 'MIN_DAYS_PER_WEEK', 'MIN_HOURS', ...(agreementBuilder.value && agreementVariant.value === 'student' ? ['UNIVERSITY_NAME', 'UNIVERSITY', 'TRAINING_START_PHASE'] : []), ...contractFields.map(f => f.key)]);
const compactToken = key => key.replaceAll('_', '').toUpperCase();
const additionalContractFields = computed(() => (contractPreview.value?.unresolvedTokens || []).filter(key => !CONTRACT_SERVICE_ROLE_FIELD_LABELS[key] && !contractFieldKeys.value.some(known => compactToken(known) === compactToken(key))));
function setAdditionalContractField(key, value) {
  const canonical = Object.keys(wizardTokens.value).find(known => known.includes('_') && compactToken(known) === compactToken(key)) || key;
  contractOverrides[key] = value;
  contractOverrides[canonical] = value;
}
const lastPreviewInput = ref('');
const previewMatches = computed(() => lastPreviewInput.value === JSON.stringify(previewInput.value));
const previewInput = computed(() => ({ compensationLevel: contract.compensationLevel, officeLocationId: officeLocationId.value, configId: contractConfigId.value, tokens: contractTokens.value, compensationCategory: contract.compensationCategory || inferredCategory.value, credential: contractCredential.value }));
watch(previewInput, () => { contractReviewed.value = false; }, { deep: true });
const missingResources = computed(() => (portalWorkflow.value.resources || []).filter(r => !r.title?.trim() || (r.kind === 'document' ? !r.templateId : r.required !== false && !r.url)));
const probationRequired = computed(() => !!contractTenant.value && !/amendment|addendum|acknowledg/i.test(contractConfigs.value.find(c=>Number(c.id)===Number(contractConfigId.value))?.slug||''));
const probationChosen = computed(() => !probationRequired.value || ['yes','no'].includes(contract.probationChoice) && (contractTenant.value!=='isi' || contract.probationChoice!=='yes' || !!contract.probationTerms.trim()));
const readyToSend = computed(() => probationChosen.value && !requiresActivation.value && !uploadingFiles.value && !draftSaveError.value && !missingResources.value.length && !missingJobDocuments.value.length && (!portalWorkflow.value.supervisorRole || (portalWorkflow.value.supervisorClause && portalWorkflow.value.supervisorTemplateId)) && compensationChosen.value && contractReviewed.value && previewMatches.value && contractPreview.value && !contractPreview.value.unresolvedTokens?.length && stepsReviewed.value && (!prehirePackageId.value || Number(packageDetails.value?.id) === Number(prehirePackageId.value)));
const chosenSignerNames = computed(() => [...signerAssignments.value.map(s => s.userId), adhocSignerUserId.value].filter(Boolean).map(id => { const u = staffUsers.value.find(u => String(u.id) === String(id)); return u ? `${u.first_name} ${u.last_name}` : ''; }).join(', '));
async function resolveSetupIssue(message, tokenKey) {
  const destination=prehireIssueDestination(message);
  if (destination.settings) {
    await flushDraft();
    if (draftSaveError.value) return;
    const path=destination.settings==='agency' ? orgPath(`/admin/settings?agencyId=${agencyId.value}&category=general&item=business-details&agencyTab=address&settingField=street-address`) : destination.settings==='staff' ? orgPath(`/admin/users?agencyId=${agencyId.value}`) : contractsPath.value;
    window.open(path, '_blank', 'noopener');
    return;
  }
  // A field-specific error takes focus after switching stages. The general
  // stage heading must not take that focus back on the next render.
  explicitSetupFocus = true;
  try {
    const legacySetupStep = destination.step ?? 2;
    setupStep.value = [0, 2, 3, 5][legacySetupStep] ?? 3;
    await nextTick();
    const element=(tokenKey && document.getElementById(`prehire-field-${tokenKey}`)) || document.getElementById(destination.id);
    if (!element) return;
    element.scrollIntoView?.({block:'center',behavior:'smooth'});
    (element.matches('input,select,textarea,button') ? element : element.querySelector('input,select,textarea,button') || element).focus({preventScroll:true});
  } finally { explicitSetupFocus = false; }
}
function reportPreviewError(message) {
  previewError.value=message;
  if(contractTenant.value==='nlu') void resolveSetupIssue(message);
}
async function openAgreementPreview() {
  setupStep.value = 3;
  await nextTick();
  if (contractPreview.value && previewMatches.value) contractPreviewFrame.value?.scrollIntoView?.({ block: 'start' });
}
async function previewContract() {
  if(!probationChosen.value){reportPreviewError('Select Yes or No for new-hire probation and complete any required individual terms.');return;}
  if (!compensationChosen.value) { reportPreviewError(contractTenant.value==='nlu' ? (contract.compensationCategory?'Choose a pay level before previewing.':'Choose a pay category before previewing.') : 'Choose a pay category and level before previewing.'); return; }
  if (!contractConfigId.value) { reportPreviewError('The employment agreement terms are not configured. Refresh contract settings.'); return; }
  if (!officeLocationId.value || !offices.value.some(office => Number(office.id) === Number(officeLocationId.value))) { reportPreviewError('Select the assigned office before previewing.'); return; }
  if (!contractOverrides.COMPANY_ADDRESS) { reportPreviewError('Set the agency’s place-of-business address in agency settings, then refresh contract settings.'); return; }
  if (showSchoolDays.value && (!Number.isInteger(Number(contract.minDays)) || Number(contract.minDays) < 1 || Number(contract.minDays) > 7)) { reportPreviewError('Enter expected school days per week (1–7).'); return; }
  if(effectiveIncludeSupervisor.value && !eligibleSupervisors.value.some(u=>Number(u.id)===Number(portalWorkflow.value.supervisorUserId))){reportPreviewError('Choose an eligible assigned clinical supervisor, or select no clinical supervision for a nonclinical agreement.');return;}
  previewBusy.value = true; previewError.value = ''; contractReviewed.value = false;
  const input = JSON.stringify(previewInput.value);
  try { const { data } = await api.post(`/contracts/candidates/${userId.value}/preview`, JSON.parse(input), { params: { agencyId: agencyId.value }, skipGlobalLoading: true }); if (input === JSON.stringify(previewInput.value)) { contractPreview.value = data; lastPreviewInput.value = input; } }
  catch (e) { reportPreviewError(e.response?.data?.error?.message || 'Could not prepare the contract preview.'); }
  finally { previewBusy.value = false; }
}
async function refreshContractLibrary() {
  try {
    const { data } = await api.get(`/contracts/candidates/${userId.value}/wizard-context`, { params: { agencyId: agencyId.value }, skipGlobalLoading: true });
    contractConfigs.value = data.configs || []; compensationLevels.value = data.compensationLevels || []; offices.value = data.offices || [];
    compensationCategories.value = data.compensationCategories || compensationCategories.value;
    serviceCompensation.value = data.serviceCompensation || null;
    contractOverrides.COMPANY_ADDRESS = data.agency?.address || data.tokens?.COMPANY_ADDRESS || '';
    if (!offices.value.some(office => Number(office.id) === Number(officeLocationId.value))) officeLocationId.value = data.suggested?.officeLocationId || null;
    applyOffice();
    if (!officeLocationId.value) officeSource.value = data.tokens?.ASSIGNED_OFFICE_SOURCE || '';
    serviceFocusOptions.value = data.serviceFocusOptions || []; schoolDaysEnabled.value = data.schoolDaysEnabled === true;
    agreementBuilder.value = data.agreementBuilder || null;
    if (agreementBuilder.value) { agreementVariant.value ||= agreementBuilder.value.suggestedVariant; contractOverrides.TRAINING_START_PHASE ||= agreementBuilder.value.suggestedTrainingStartPhase || 'internship'; applyAgreementVariant(); }
    contractPreview.value = null; contractReviewed.value = false;
  }
  catch (e) { previewError.value = 'Could not refresh contract settings.'; }
}
watch(contractCredential, async credential => {
  if (loading.value || !credential) return;
  try { const { data } = await api.get('/contracts/infer-compensation', { params: { agencyId: agencyId.value, credential, jobTitle: jobTitle.value }, skipGlobalLoading: true });
    if (credential !== contractCredential.value) return;
    inferredCategory.value = data.compensationCategory; inferredPayLabel.value = data.payCategoryLabel;
    if(contractTenant.value!=='nlu' || !contract.compensationCategory){contract.compensationCategory = String(data.compensationCategory || ''); if(contractTenant.value!=='nlu')contract.compensationLevel = '';}
  } catch { previewError.value = 'Could not infer compensation. Select the category and level explicitly.'; }
});

const draftRevision = ref(0), draftReady = ref(false), draftSaving = ref(false), draftSaveError = ref('');
const draftState = computed(() => ({ contract: { ...contract }, contractOverrides: { ...contractOverrides }, individualExpectations: individualExpectations.value, agreementVariant: agreementVariant.value,
  contractConfigId: contractConfigId.value, officeLocationId: officeLocationId.value, includeSupervisor: includeSupervisor.value,
  signerAssignments: signerAssignments.value, adhocSignerUserId: adhocSignerUserId.value,
  prehirePackageId: prehirePackageId.value, packetTemplateId: packetTemplateId.value,
  portalWorkflow: portalWorkflow.value, jobDocs: jobDocs.value.map(({ id, selected }) => ({ id, selected })), extraFiles: extraFiles.value.map(({ id, name, title }) => ({ id, name, title })), setupVersion: 3, setupStep: setupStep.value }));
const savedDraft = ref('');
let draftTimer, savingDraft;
const draftDirty = computed(() => draftReady.value && JSON.stringify(draftState.value) !== savedDraft.value);
const draftMessage = computed(() => draftSaveError.value || (uploadingFiles.value ? 'Saving attached files…' : draftSaving.value ? 'Saving progress…' : draftDirty.value ? 'Unsaved changes' : draftReady.value ? 'Progress saved. You can return to this candidate later.' : 'Loading saved progress…'));
async function restoreDraft() {
  const { data } = await api.get(`/hiring/candidates/${userId.value}/prehire-draft`, { params: { agencyId: agencyId.value }, skipGlobalLoading: true });
  const agencyAddress = contractOverrides.COMPANY_ADDRESS;
  const d = data?.draft;
  draftRevision.value = Number(data?.revision || 0);
  if (d) {
    if (d.contract) Object.assign(contract, d.contract);
    if (d.contractOverrides) Object.assign(contractOverrides, d.contractOverrides);
    if (d.individualExpectations) individualExpectations.value = d.individualExpectations;
    for (const [key, target] of Object.entries({ agreementVariant, contractConfigId, officeLocationId, includeSupervisor, signerAssignments, adhocSignerUserId, prehirePackageId, packetTemplateId, portalWorkflow, extraFiles, setupStep })) {
      if (d[key] !== undefined) target.value = d[key];
    }
    // The draft owns selections; current job/agency settings own document content.
    const savedSelections = new Map((d.jobDocs || []).map(doc => [String(doc.id), doc.selected !== false]));
    jobDocs.value = jobDocs.value.map(doc => ({ ...doc, selected: savedSelections.has(String(doc.id)) ? savedSelections.get(String(doc.id)) : doc.selected }));
    const savedStep = Number(d.setupStep) || 0;
    if (d.setupVersion !== 3 && contractOverrides.JOB_TITLE === jobTitle.value) contractOverrides.JOB_TITLE = wizardTokens.value.JOB_TITLE || jobTitle.value;
    setupStep.value = d.setupVersion === 3 ? Math.max(0, Math.min(5, savedStep))
      : d.setupVersion === 2 ? [0, 1, 2, 4, 3, 5][savedStep] ?? 0
      : [0, 2, 3, 5][savedStep] ?? 0;
    delete portalWorkflow.value.handbookUrl;
    portalWorkflow.value.resources = (portalWorkflow.value.resources || []).filter(r => !builtInHireDocument(r));
    if (agreementBuilder.value) applyAgreementVariant();
    // Always resolve source-owned office/address data against the current agency records.
    contractOverrides.COMPANY_ADDRESS = agencyAddress;
    if (!offices.value.some(o => Number(o.id) === Number(officeLocationId.value))) officeLocationId.value = null;
    applyOffice();
    contractPreview.value = null; contractReviewed.value = false;
  }
  await nextTick();
  savedDraft.value = JSON.stringify(draftState.value); draftReady.value = true;
}
async function flushDraft() {
  clearTimeout(draftTimer);
  while (savingDraft) { await savingDraft; if (draftSaveError.value) return; }
  if (!draftReady.value || JSON.stringify(draftState.value) === savedDraft.value) return;
  const snapshot = JSON.stringify(draftState.value);
  draftSaving.value = true; draftSaveError.value = '';
  savingDraft = api.put(`/hiring/candidates/${userId.value}/prehire-draft`, { draft: JSON.parse(snapshot), revision: draftRevision.value }, { params: { agencyId: agencyId.value }, skipGlobalLoading: true })
    .then(({ data }) => { draftRevision.value = data.revision; savedDraft.value = snapshot; })
    .catch(e => { draftSaveError.value = e.response?.data?.error?.message || 'Progress could not be saved. Retry before leaving this page.'; })
    .finally(() => { draftSaving.value = false; savingDraft = null; });
  await savingDraft;
  if (!draftSaveError.value && JSON.stringify(draftState.value) !== savedDraft.value) await flushDraft();
}
watch(draftState, () => { if (!draftReady.value) return; clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 350); }, { deep: true });
function warnUnsaved(event) { if (draftDirty.value || uploadingFiles.value || draftSaveError.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => window.addEventListener('beforeunload', warnUnsaved));
onBeforeUnmount(() => { clearTimeout(draftTimer); window.removeEventListener('beforeunload', warnUnsaved); void flushDraft(); });
onBeforeRouteLeave(async () => { if (uploadingFiles.value) return false; await flushDraft(); return !draftSaveError.value; });

onMounted(load);
</script>

<style scoped>
.sph-program-rates{max-width:100%;overflow-x:auto;margin:16px 0}.sph-program-rates table{width:100%;min-width:500px;border-collapse:collapse}.sph-program-rates th,.sph-program-rates td{text-align:left;padding:9px;border-bottom:1px solid #d9e4de}.sph-program-rates caption{text-align:left;font-weight:700;padding:9px 0}

.sph { width:100%; max-width:none; margin:0; padding:20px clamp(16px,3vw,48px) 48px; box-sizing:border-box; color:#243b53; font-family:'Plotline Inter',Inter,system-ui,sans-serif; background:#f7f8fa; min-height:100vh; }
.sph-head h1 { margin: 6px 0 4px; }
.sph-back { background: none; border: 0; color: #1a8c54; font-weight: 700; cursor: pointer; padding: 0; }
.sph-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 18px 20px;
  margin: 16px 0;
}
.sph-name { font-size: 1.2rem; font-weight: 800; margin: 0 0 4px; }
.sph-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.sph-grid label, .sph-upload label { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; font-weight: 650; }
.sph-check {
  display: flex;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 650;
  grid-column: 1 / -1;
}
.sph-check input { width: auto; }
.sph-grid input, .sph-grid select, .input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-weight: 400;
}
.sph-doc {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 10px 0;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.sph-empty-docs {
  padding: 10px 0 4px;
}
.sph-careers-link {
  display: inline-block;
  margin-top: 8px;
  color: #1a8c54;
  font-weight: 700;
  text-decoration: none;
}
.sph-careers-link:hover { text-decoration: underline; }
.sph-extra-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sph-extra-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
}
.sph-extra-item label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 650;
}
.sph-extra-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
.sph-extra-remove {
  border: 0;
  background: none;
  color: #b91c1c;
  font-weight: 650;
  cursor: pointer;
  font-size: 0.8rem;
}
.sph-kind {
  margin-left: 8px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.sph-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.sph-ok { color: #1a8c54; font-weight: 650; word-break: break-all; }
.sph-warn {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 8px 0 14px;
  font-size: 0.9rem;
}
.sph-config { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; font-weight: 650; }
.sph-config .input { font-weight: 400; }
.sph-upload { margin-top: 12px; }
.muted { color: #6b7280; }
.small { font-size: 0.82rem; }
.error { color: #b91c1c; font-weight: 650; }
@media (max-width: 720px) { .sph-grid { grid-template-columns: 1fr; } }
.sph-steps{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:24px 0}.sph-steps button{display:flex;gap:8px;align-items:center;padding:12px;border:1px solid #d5e0dc;border-radius:8px;background:white;color:#36564b;font:inherit;font-size:13px}.sph-steps button[aria-current=step]{background:#165c46;color:white}.sph-steps span{font-weight:700}.sph-preview{display:block;width:100%;height:660px;border:1px solid #d5dfdb;border-radius:8px;margin:20px 0;background:white}.sph-description{white-space:pre-line}.sph-card>label:not(.sph-check):not(.sph-doc){display:grid;gap:8px;margin:14px 0}.sph-card select,.sph-card>label input:not([type=checkbox]){padding:10px;border:1px solid #cad8d2;border-radius:6px;font:inherit;max-width:100%;background:white;color:#223d35}.sph-card li{padding:5px 0}.sph-card a{color:#165c46}.sph-actions{background:#fff;padding:16px;border-top:1px solid #d5dfdb}.sph-actions button:disabled{opacity:.5}@media(max-width:720px){.sph-steps{grid-template-columns:1fr 1fr}.sph-preview{height:480px}}
.sph .btn{padding:12px 18px;border-radius:8px;border:1px solid #bfd2c9;font:inherit;font-weight:650;cursor:pointer}.sph .btn-primary{background:#165c46;color:#fff}.sph .btn-secondary{background:white;color:#165c46}.sph-check input,.sph-doc input[type=checkbox]{width:auto;flex:none}.sph-grid label.sph-check{flex-direction:row}.sph-card button:not(.btn):not(.sph-extra-remove){padding:8px 12px;border:1px solid #bfd2c9;border-radius:6px;background:#f5f9f7;color:#165c46;cursor:pointer}

.sph h1,.sph h2,.sph h3,.sph label,.sph legend{color:#243b53}.sph h1{font-family:'Plotline Sora',system-ui,sans-serif;font-size:clamp(28px,3vw,40px);font-weight:600;letter-spacing:-1.2px}.sph h2{font-size:23px;letter-spacing:-.4px;margin:0 0 20px}.sph h3{font-size:18px}.sph p{line-height:1.7}.sph-head{padding-bottom:10px}.sph-brandbar,.sph-heading-row{display:flex;align-items:center;justify-content:space-between;gap:24px}.sph-brandbar{border-bottom:1px solid #dae1e8;margin-bottom:24px}.sph-brandbar :deep(.plotline-signature){padding:12px 0}.sph-back{color:#4a6177;font:600 13px 'Plotline Inter',system-ui,sans-serif}.sph-eyebrow{text-transform:uppercase;letter-spacing:.13em;font-size:11px;font-weight:700;color:#7b655a;margin:0 0 9px}.sph-save-state{display:flex;align-items:center;gap:9px;max-width:330px;font-size:12px;color:#62748a}.sph-save-state p{margin:0}.sph-save-dot{width:8px;height:8px;background:#578565;border-radius:50%;flex-shrink:0}.sph-save-dot.pending{background:#bc9254}.sph-save-dot.failed{background:#ad4a3e}.sph-context-strip{display:flex;align-items:center;gap:16px;padding:20px 24px;background:#fff;border:1px solid #dce3eb;border-radius:12px;margin:18px 0}.sph-avatar{display:grid;place-items:center;background:#e9edf4;color:#344f70;border-radius:50%;width:46px;height:46px;font-size:16px;font-weight:700;flex-shrink:0}.sph-context-strip div{display:grid;gap:6px;font-size:14px;min-width:0}.sph-context-strip div span{color:#697b8f;font-size:12px;overflow-wrap:anywhere}.sph-context-job{margin-left:auto;padding-left:24px;border-left:1px solid #e0e6ed}.sph-stage-badge{font-size:11px;background:#f1ece7;color:#745947;border-radius:20px;padding:7px 12px}.sph-card{border-color:#dce3eb;padding:clamp(20px,2.5vw,36px);box-shadow:0 2px 5px #243b5304}.sph-person-job-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.sph-summary-panel{padding:24px;background:#f8fafc;border:1px solid #e0e6ed;border-radius:10px}.sph-summary-panel h3{margin:0 0 20px;font-size:23px}.sph-facts{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:0 0 24px}.sph-facts div{min-width:0}.sph-facts dt{font-size:11px;font-weight:600;color:#687b90;margin-bottom:5px}.sph-facts dd{margin:0;font-size:14px;overflow-wrap:anywhere;line-height:1.6}.sph-application-context{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin:28px 0}.sph-application-context article{border-bottom:1px solid #e0e6ed;padding-bottom:20px}.sph-application-context ul{list-style:none;padding:0}.sph-application-context li{margin:12px 0;font-size:14px}.sph-application-context li span{display:block;color:#697b8f;font-size:12px}.sph-section-heading{margin:28px 0}.sph-steps button{font-size:12px;min-height:58px;color:#566c81;border-color:#dce3eb;cursor:pointer}.sph-steps button[aria-current=step]{background:#243b53;border-color:#243b53;color:#fff}.sph-steps button[aria-current=step] span{color:#e8c3aa}.sph .btn-primary{background:#243b53;border-color:#243b53}.sph .btn-secondary,.sph-card a{color:#365b7c}.sph-actions{position:relative;z-index:4;box-shadow:0 -4px 14px #243b5308;border:1px solid #dae2eb;border-radius:10px}.sph-role-options{border:0;padding:0;margin:28px 0;display:grid;grid-template-columns:1fr 1fr;gap:18px}.sph-role-options legend{margin-bottom:14px;font-weight:650;font-size:15px}.sph-role-options label{display:flex;align-items:flex-start;gap:14px;border:1px solid #cbd7e3;border-radius:10px;padding:24px;cursor:pointer}.sph-role-options label.chosen{background:#eef3f8;border-color:#476886}.sph-role-options input{width:22px;height:22px;margin:0;accent-color:#365b7c;flex-shrink:0}.sph-role-options span{display:grid;gap:8px}.sph-role-options small{font-weight:400;line-height:1.7;color:#65788c}.sph-document-card{display:block;padding:24px}.sph-document-card .sph-kind{margin-left:0}.sph input[type=checkbox]{width:22px;height:22px;min-width:22px;accent-color:#365b7c}.sph-handbook-note{padding:16px 20px;background:#eef3f8;border:1px solid #dce5ee;border-radius:8px;font-size:13px}.sph-final-sequence li{padding:12px 6px;border-bottom:1px solid #e4e9ef}.sph-final-sequence .small{display:block;margin-top:5px}.sph-initial-loading{padding:36px;border:1px solid #e0e6ed;border-radius:12px;background:white;margin-top:24px;color:#62748a}.sph-skeleton{height:84px;background:linear-gradient(90deg,#f1f4f8,#e8edf4,#f1f4f8);border-radius:8px}.sph button:focus-visible,.sph a:focus-visible{outline:3px solid #a8bdd1;outline-offset:3px}
@media(max-width:1100px){.sph-steps{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.sph{padding:12px}.sph-person-job-grid,.sph-application-context,.sph-role-options{grid-template-columns:1fr}.sph-heading-row{align-items:flex-start;flex-direction:column;gap:12px}.sph-context-strip{flex-wrap:wrap;padding:16px}.sph-context-job{margin-left:0;padding-left:0;border-left:0;flex-basis:100%}.sph-steps{grid-template-columns:repeat(2,1fr)}.sph-brandbar :deep(.plotline-signature>span){display:none}.sph-facts{gap:15px}.sph-summary-panel{padding:18px}}
</style>
