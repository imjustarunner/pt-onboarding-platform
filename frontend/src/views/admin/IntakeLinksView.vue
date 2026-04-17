<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Digital Forms</h1>
        <p class="subtitle">Configure digital forms, documents, and custom fields for your agency.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <router-link class="btn btn-secondary" to="/admin/surveys">Surveys</router-link>
        <button class="btn btn-secondary" type="button" @click="showQuestionSetsPanel = !showQuestionSetsPanel">
          {{ showQuestionSetsPanel ? 'Hide Question Sets' : 'Question Sets' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="openAddOnPreviewModal">Preview Add-Ons</button>
        <button class="btn btn-primary" type="button" @click="openCreate">New Digital Form</button>
      </div>
    </div>

    <!-- Question Sets Panel -->
    <div v-if="showQuestionSetsPanel" class="question-sets-panel">
      <div class="question-sets-panel-header">
        <div>
          <h2 style="margin:0 0 4px;">Question Sets</h2>
          <p class="subtitle" style="margin:0;">Save reusable groups of questions to drop into any digital form.</p>
        </div>
        <button class="btn btn-primary btn-sm" type="button" @click="startNewQuestionSet">+ New Question Set</button>
      </div>

      <!-- Editor -->
      <div v-if="editingQuestionSet" class="question-set-editor">
        <div class="form-group" style="max-width:400px;margin-bottom:16px;">
          <label>Question Set Name</label>
          <input v-model="editingQuestionSet.name" type="text" placeholder="e.g., Self Intake Questions" />
        </div>
        <div class="question-list">
          <div v-for="(field, fIdx) in editingQuestionSet.fields" :key="field.id || fIdx" class="question-block">
            <div class="question-label-row">
              <div class="question-index">#{{ fIdx + 1 }}</div>
              <input v-model="field.label" placeholder="Question label" class="question-label-input" />
            </div>
            <div class="question-row">
              <input v-model="field.key" placeholder="Key (e.g., school_grade)" />
              <select v-model="field.type">
                <option value="text">Short answer</option>
                <option value="textarea">Long answer</option>
                <option value="checkbox">Checkbox</option>
                <option value="select">Select</option>
                <option value="radio">Radio</option>
                <option value="date">Date</option>
                <option value="info">Info / Disclaimer</option>
              </select>
              <select v-model="field.scope">
                <option value="self">Self (only when filling for themselves)</option>
                <option value="client">Client (repeats per child)</option>
                <option value="guardian">Guardian (one-time)</option>
                <option value="submission">One-time (global)</option>
              </select>
              <label class="checkbox">
                <input v-model="field.required" type="checkbox" :disabled="field.type === 'info'" />
                Required
              </label>
              <div class="question-controls">
                <button class="btn btn-xs btn-secondary" type="button" @click="moveQSetField(fIdx, -1)" :disabled="fIdx === 0">↑</button>
                <button class="btn btn-xs btn-secondary" type="button" @click="moveQSetField(fIdx, 1)" :disabled="fIdx === editingQuestionSet.fields.length - 1">↓</button>
                <button class="btn btn-xs btn-secondary" type="button" @click="addQSetFieldAfter(fIdx)">＋</button>
                <button class="btn btn-xs btn-danger" type="button" @click="removeQSetField(fIdx)">×</button>
              </div>
            </div>
            <div class="question-meta">
              <input v-model="field.helperText" placeholder="Helper text / disclaimer (optional)" />
              <div class="condition-row">
                <select v-model="field.showIf.fieldKey">
                  <option value="">Show if (optional)</option>
                  <option
                    v-for="target in getQSetConditionalTargets(fIdx)"
                    :key="target.key"
                    :value="target.key"
                  >
                    {{ target.label || target.key }}
                  </option>
                </select>
                <input
                  v-model="field.showIf.equals"
                  :disabled="!field.showIf.fieldKey"
                  placeholder="Equals value (e.g., yes)"
                />
              </div>
            </div>
            <div v-if="field.type === 'select' || field.type === 'radio'" class="option-list">
              <div v-for="(opt, oIdx) in field.options" :key="opt.id || oIdx" class="option-row">
                <input v-model="opt.label" placeholder="Option label" />
                <input v-model="opt.value" placeholder="Value" />
                <button class="btn btn-xs btn-secondary" type="button" @click="field.options.splice(oIdx, 1)">×</button>
              </div>
              <button class="btn btn-xs btn-secondary" type="button" @click="field.options.push({ id: createId('opt'), label: '', value: '' })">+ Option</button>
            </div>
          </div>
        </div>
        <button class="btn btn-xs btn-secondary" type="button" @click="addQSetField" style="margin-bottom:16px;">+ Add Question</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" type="button" @click="saveQuestionSet" :disabled="qsetSaving">{{ qsetSaving ? 'Saving…' : 'Save Question Set' }}</button>
          <button class="btn btn-secondary" type="button" @click="editingQuestionSet = null">Cancel</button>
        </div>
      </div>

      <!-- List of saved sets -->
      <div v-if="!editingQuestionSet" class="question-set-list">
        <div v-if="!questionSets.length" class="muted" style="padding:12px 0;">No question sets yet. Click "+ New Question Set" to create one.</div>
        <div v-for="qs in questionSets" :key="qs.id" class="question-set-row">
          <div>
            <strong>{{ qs.name || 'Unnamed Set' }}</strong>
            <span class="muted" style="margin-left:8px;">{{ qs.fields.length }} question{{ qs.fields.length === 1 ? '' : 's' }}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-xs btn-secondary" type="button" @click="startEditQuestionSet(qs)">Edit</button>
            <button class="btn btn-xs btn-danger" type="button" @click="deleteQuestionSet(qs.id)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <div class="quick-create">
      <h3>Quick Create</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Scope</label>
          <select v-model="quickScope">
            <option value="school">School</option>
            <option value="program">Program</option>
            <option value="agency">Agency</option>
          </select>
        </div>
        <div class="form-group" v-if="quickScope !== 'agency'">
          <label>Organization</label>
          <select v-model.number="quickOrganizationId">
            <option :value="null">Select</option>
            <option v-for="org in organizationsForQuickScope" :key="org.id" :value="org.id">
              {{ org.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Title</label>
          <input v-model="quickTitle" type="text" placeholder="e.g., School Intake or Summer Pickup Form" />
        </div>
        <div class="form-group">
          <label>Language</label>
          <select v-model="quickLanguageCode">
            <option value="en">English</option>
            <option value="es">Spanish</option>
          </select>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="createQuickLink">Create Link</button>
      <div v-if="quickError" class="error">{{ quickError }}</div>
    </div>

    <div class="filters">
      <select v-model="filterScope">
        <option value="all">All Scopes</option>
        <option value="agency">Agency</option>
        <option value="school">School</option>
        <option value="program">Program</option>
      </select>
      <select v-model="filterStatus">
        <option value="active">Active only</option>
        <option value="inactive">Inactive only</option>
        <option value="all">All statuses</option>
      </select>
      <select v-model="filterFormType">
        <option value="all">All Types</option>
        <option value="intake">Intake</option>
        <option value="public_form">Public Form</option>
        <option value="smart_school_roi">Smart School ROI</option>
        <option value="smart_registration">Smart Registration</option>
        <option value="job_application">Job Application</option>
        <option value="medical_records_request">Medical Records</option>
        <option value="internal_preferences">Internal Preferences</option>
      </select>
      <select v-model="filterOrgId">
        <option value="all">All Orgs</option>
        <option v-for="org in organizations" :key="org.id" :value="org.id">
          {{ org.name }} ({{ org.organization_type || 'agency' }})
        </option>
      </select>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Scope</th>
            <th>Language</th>
            <th>Active</th>
            <th>Guardian</th>
            <th>Documents</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="link in filteredLinks" :key="link.id">
            <td>{{ link.title || `Link ${link.id}` }}</td>
            <td>
              <span :class="['badge', getFormTypeBadgeClass(link.form_type)]">
                {{ getFormTypeLabel(link.form_type) }}
              </span>
            </td>
            <td>
              {{ getScopeTypeLabel(link.scope_type) }}
              <span v-if="link.organization_id">
                {{
                  organizationLookup.get(Number(link.organization_id))?.name
                    || `#${link.organization_id}`
                }}
              </span>
            </td>
            <td>{{ getLanguageLabel(link.language_code) }}</td>
            <td>{{ link.is_active ? 'Yes' : 'No' }}</td>
            <td>{{ link.create_guardian ? 'Yes' : 'No' }}</td>
            <td>{{ (link.allowed_document_template_ids || []).length }}</td>
            <td class="actions">
              <button class="btn btn-secondary btn-sm" type="button" @click="editLink(link)">Edit</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="duplicateLink(link)">Duplicate</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="copyLink(link)">Copy URL</button>
              <button
                class="btn btn-danger btn-sm"
                type="button"
                :disabled="!link.is_active"
                :title="link.is_active ? 'Deactivate form and remove from use' : 'Already deactivated'"
                @click="deleteLink(link)"
              >
                {{ link.is_active ? 'Deactivate' : 'Deactivated' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="template-panel">
      <h3>Digital Form Field Templates</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Agency</label>
          <select v-model.number="selectedAgencyId" :disabled="lockAgencyPicker">
            <option v-for="agency in agencyList" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Template name</label>
          <input v-model="fieldTemplateName" type="text" />
        </div>
      </div>
      <div class="form-group">
        <label>Fields JSON</label>
        <textarea v-model="fieldTemplateJson" rows="5"></textarea>
      </div>
      <div class="actions">
        <button class="btn btn-primary" type="button" @click="saveFieldTemplate">Save Template</button>
      </div>
      <div class="template-list">
        <div v-for="t in fieldTemplates" :key="t.id" class="template-row">
          <div>
            <strong>{{ t.name }}</strong>
            <div class="muted">Agency {{ t.agency_id }}</div>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="applyFieldTemplate(t)">Apply to Form</button>
        </div>
      </div>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="closeForm">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>{{ editingId ? 'Edit Digital Form' : 'Create Digital Form' }}</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeForm">Close</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Title</label>
              <input v-model="form.title" type="text" />
            </div>
            <div class="form-group">
              <label>Language</label>
              <select v-model="form.languageCode">
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
            </div>
            <div class="form-group">
              <label>Description</label>
              <input v-model="form.description" type="text" />
            </div>
            <div class="form-group">
              <label>Form Type</label>
              <select v-model="form.formType">
                <option value="intake">Intake (person-tied)</option>
                <option value="public_form">Public Form (standalone)</option>
                <option value="smart_school_roi">Smart School ROI</option>
                <option value="smart_registration">Smart Registration</option>
                <option value="job_application">Job Application</option>
                <option value="medical_records_request">Medical Records Request</option>
                <option value="internal_preferences">Internal Preferences (staff)</option>
              </select>
              <small v-if="form.formType === 'public_form'" class="form-help">
                Standalone forms (e.g. additional driver, consent) are externally clickable and not tied to a person. Completed documents land in Submitted Documents for staff to assign to a client.
              </small>
              <small v-if="form.formType === 'smart_school_roi'" class="form-help">
                Dedicated Smart ROI flow. This is the standard school ROI and is built independently per school. It stays school-scoped and does not create clients.
              </small>
              <small v-if="form.formType === 'smart_registration'" class="form-help">
                Lighter, registration-first flows (e.g. cash-only or brief events): one company event per link, minimal paperwork.
                For full intake <em>and</em> event enrollment, use <strong>Intake</strong> and add a Registration step instead.
              </small>
              <small v-if="form.formType === 'job_application'" class="form-help">
                Each job gets its own link. Applicants upload resume, cover letter, etc. Documents land in Submitted Documents.
              </small>
              <small v-if="form.formType === 'medical_records_request'" class="form-help">
                View-only form. Documents land in Submitted Documents and cannot be assigned to a client.
              </small>
              <small v-if="form.formType === 'intake'" class="form-help">
                Default school/agency intake with client creation and documents. Add a <strong>Registration</strong> step to enroll
                into one company event at the same time — same event binding and returning-client shortcuts as Smart Registration,
                with your full questions and packet.
              </small>
              <small v-if="form.formType === 'internal_preferences'" class="form-help">
                Shareable link for staff to update their own notification and communication preferences (including Campaign 4 workforce SMS opt-in) without logging in. Scoped to an agency.
              </small>
            </div>
            <div v-if="form.formType === 'job_application'" class="form-group">
              <label>Agency</label>
              <select v-model.number="form.organizationId" :disabled="lockAgencyPicker" @change="fetchJobDescriptions">
                <option :value="null">Select agency</option>
                <option v-for="a in agencyList" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </div>
            <div v-if="form.formType === 'job_application'" class="form-group">
              <label>Job</label>
              <select v-model.number="form.jobDescriptionId">
                <option :value="null">Select job</option>
                <option v-for="j in jobDescriptionsForForm" :key="j.id" :value="j.id">{{ j.title }}</option>
              </select>
            </div>
            <div v-if="form.formType === 'job_application'" class="form-group" style="grid-column: 1 / -1;">
              <label>Application flow shortcuts</label>
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" type="button" @click="addJobApplicationStarterSteps">
                  Add application defaults
                </button>
                <button
                  v-if="form.jobDescriptionId"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="openLinkedJobInCareers"
                >
                  Open linked job in Careers
                </button>
              </div>
              <small class="form-help">
                Adds Resume upload, Cover Letter upload/paste, and Professional references steps.
              </small>
            </div>
            <div v-if="form.formType === 'medical_records_request'" class="form-group">
              <label>Agency</label>
              <select v-model.number="form.organizationId" :disabled="lockAgencyPicker">
                <option :value="null">Select agency</option>
                <option v-for="a in agencyList" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <small class="form-help">One medical release form per agency. The requester will not need to select an agency.</small>
            </div>
            <div class="form-group" v-if="form.formType !== 'job_application' && form.formType !== 'medical_records_request'">
              <label>Scope</label>
              <select v-model="form.scopeType" :disabled="form.formType === 'smart_school_roi' || form.formType === 'smart_registration'">
                <option value="agency">Agency</option>
                <option value="school">School</option>
                <option value="program">Program</option>
              </select>
              <small v-if="form.formType === 'smart_registration'" class="form-help" style="color:#64748b;font-size:12px;">
                Smart Registration is always agency-scoped — set above via the agency picker.
              </small>
            </div>
            <div v-if="form.scopeType !== 'agency' && form.formType !== 'job_application'" class="form-group">
              <label>Organization</label>
              <select v-model.number="form.organizationId">
                <option :value="null">Select</option>
                <option v-for="org in organizationsForScope" :key="org.id" :value="org.id">
                  {{ org.name }} ({{ org.organization_type }})
                </option>
              </select>
            </div>
            <div v-if="form.scopeType === 'program'" class="form-group">
              <label>Program ID (optional)</label>
              <input v-model.number="form.programId" type="number" />
            </div>
            <div
              v-if="registrationFlowAdmin"
              class="form-group"
              style="grid-column: 1 / -1"
            >
              <label>Agency (for company event picker)</label>
              <select
                v-model.number="companyEventsPickerAgencyId"
                :disabled="lockAgencyPicker || !agencyList.length"
                @change="fetchCompanyEventsForPicker"
              >
                <option :value="null">Select agency</option>
                <option v-for="a in agencyList" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <small class="form-help">Used only to list events when locking this link to one Skill Builders / company event.</small>
            </div>
            <div
              v-if="registrationFlowAdmin"
              class="form-group il-ce-wrap"
              :class="{ 'il-ce-wrap--warn': !form.companyEventId }"
              style="grid-column: 1 / -1"
            >
              <label class="il-ce-label">
                Program / company event
                <span class="required-indicator" title="Recommended before sharing this link publicly">*</span>
              </label>
              <select
                v-model="form.companyEventId"
                class="il-ce-select"
                :class="{ 'il-ce-select--warn': !form.companyEventId }"
                :disabled="companyEventsPickerLoading"
              >
                <option :value="null">
                  None yet — save as a draft, then pick the Skill Builders / company event this URL enrolls into
                </option>
                <option v-for="e in companyEventsPickerFilteredOptions" :key="e.id" :value="e.id">
                  {{ e.title || `Event ${e.id}` }} (starts {{ formatCompanyEventPickerLabel(e) }}){{
                    Number(e.organizationId || 0) ? '' : ' — agency-wide'
                  }}
                </option>
              </select>
              <div v-if="!form.companyEventId" class="il-ce-warn" role="status">
                <span class="il-ce-warn-icon" aria-hidden="true">!</span>
                <div class="il-ce-warn-body">
                  <strong>No event selected.</strong>
                  You can still save this digital form. Registration and public enroll flows need a specific company event
                  before the link is reliable — create the program event first if needed, then return here and choose it.
                </div>
              </div>
              <small class="form-help">
                Each registration-capable URL should eventually enroll into one company event (program calendar card).
                Use <strong>Intake</strong> + Registration for full paperwork plus event enrollment; use <strong>Smart Registration</strong>
                alone for shorter flows. Events saved as <strong>agency-wide</strong> on the calendar (no program on the event) still
                appear in this list when your form is program-scoped — choose the row that matches your title and dates.
                For returning families, use step visibility on <strong>questions</strong>, <strong>documents</strong>,
                and <strong>uploads</strong>. For <strong>Register</strong> on <code>/open-events/…</code>, keep this link <strong>active</strong>
                with the same event once selected.
              </small>
            </div>
            <div class="form-group">
              <label>Active</label>
              <select v-model="form.isActive">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div v-if="form.formType !== 'job_application'" class="form-group">
              <label>Create Client</label>
              <select v-model="form.createClient" :disabled="['public_form', 'medical_records_request', 'smart_school_roi'].includes(form.formType)">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
              <small v-if="['public_form', 'medical_records_request', 'smart_school_roi'].includes(form.formType)" class="form-help">These forms do not create clients directly.</small>
            </div>
            <div v-if="form.formType !== 'job_application'" class="form-group form-group-guardian-toggle">
              <label>Create Guardian (default)</label>
              <select v-model="form.createGuardian" :disabled="form.formType === 'smart_school_roi'">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
              <small v-if="form.formType !== 'smart_school_roi'" class="form-help form-help-guardian">
                When <strong>Yes</strong>, you can add the green <strong>Guardian waivers</strong> step to collect pickup, emergency
                contacts, allergies/meals, and e-sign consent into the guardian’s profile (more sections may be added later).
              </small>
            </div>
            <div class="form-group">
              <label>Intake retention</label>
              <select v-model="form.retentionPolicy.mode">
                <option value="inherit">Use agency default</option>
                <option value="days">Delete after N days</option>
                <option value="never">Never delete automatically</option>
              </select>
            </div>
            <div class="form-group" v-if="form.retentionPolicy.mode === 'days'">
              <label>Days to retain</label>
              <input v-model.number="form.retentionPolicy.days" type="number" min="1" max="3650" />
            </div>
          </div>

          <div class="form-group custom-messages-section">
            <label>Custom intro messages (optional)</label>
            <p class="muted" style="margin-bottom: 8px;">
              Override the default text shown on the intake cover and intro screens. Leave blank to use defaults.
            </p>
            <div class="form-grid">
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Cover screen subtitle</label>
                <textarea
                  v-model="form.customMessages.beginSubtitle"
                  rows="2"
                  placeholder="e.g., Begin to start a secure intake session. This link creates a unique session for each person."
                />
              </div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Form time limit message</label>
                <textarea
                  v-model="form.customMessages.formTimeLimit"
                  rows="2"
                  placeholder="e.g., This form must be completed within 1 hour. Each new page adds 5 minutes. The session is unique and cannot be saved or resumed."
                />
              </div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Completion email template</label>
                <select :value="completionEmailDropdownValue" @change="onCompletionEmailDropdownChange">
                  <option value="">Use agency default (School Full Intake Packet)</option>
                  <option value="preset:guardian_partnership">
                    Parent partnership / class registration (welcome + account &amp; packet)
                  </option>
                  <option
                    v-for="tpl in completionEmailTemplateOptions"
                    :key="tpl.id"
                    :value="`template:${tpl.id}`"
                  >
                    {{ tpl.name }} ({{ tpl.type || 'template' }})
                  </option>
                </select>
                <small class="form-help">
                  Default behavior uses the agency template type <code>school_full_intake_packet_default</code>.
                  The parent-partnership option fills suggested copy for welcome plus portal credentials; when a new
                  guardian account is created, the PORTAL_LOGIN_URL placeholder resolves to the one-time sign-in link.
                  You can edit the subject and body after choosing it.
                </small>
              </div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <label style="margin:0;">Completion email subject</label>
                  <button class="btn btn-secondary btn-xs" type="button" @click="applyDefaultCompletionEmailCopy">
                    Use suggested copy
                  </button>
                </div>
                <input
                  v-model="form.customMessages.completionEmailSubject"
                  type="text"
                  placeholder="e.g., {{CLIENT_NAME}} - Signed Packet Ready"
                />
              </div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Completion email body</label>
                <textarea
                  v-model="form.customMessages.completionEmailBody"
                  rows="6"
                  placeholder="Placeholders include {{SIGNER_NAME}}, {{CLIENT_SUMMARY}}, {{DOWNLOAD_URL}}, {{LINK_EXPIRES_DAYS}}, {{PORTAL_LOGIN_URL}}, {{REGISTRATION_LOGIN_PAGE_URL}}, {{REGISTRATION_LOGIN_EMAIL}}, {{REGISTRATION_TEMP_PASSWORD}}, {{REGISTRATION_EVENT_SUMMARY}}, {{SCHOOL_NAME}}."
                />
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Document selection</label>
            <div class="muted">
              Documents are added one at a time using <strong>+ Add Document</strong> in the Intake Flow Builder.
            </div>
          </div>

          <div class="form-group">
            <label>Intake Flow Builder</label>
            <div class="step-builder">
              <div v-if="canAddGuardianWaiverStep" class="flow-legend-guardian" role="note">
                <span class="flow-legend-guardian-dot" aria-hidden="true" />
                <span><strong>Green</strong> = adds a step tied to the <strong>guardian account</strong> (waivers today; more later).</span>
              </div>
              <div class="step-actions">
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('questions')">+ Add Questions</button>
                <button v-if="questionSets.length" class="btn btn-secondary btn-sm" type="button" @click="openQSetPicker">+ Add Question Set</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('registration')">+ Add Registration</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('document')">+ Add Document</button>
                <button
                  v-if="canAddSchoolRoiStep"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addSchoolRoiStep"
                >
                  + Add School ROI
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('upload')">+ Add Upload</button>
                <button
                  v-if="form.formType === 'job_application'"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('references')"
                >
                  + Add References
                </button>
                <button
                  v-if="canAddGuardianWaiverStep"
                  class="btn btn-secondary btn-sm btn-flow-add-guardian"
                  type="button"
                  @click="addStep('guardian_waiver')"
                >
                  + Add Guardian waivers
                </button>
                <button
                  class="btn btn-secondary btn-sm btn-flow-add-guardian"
                  type="button"
                  @click="addStep('insurance_info')"
                >
                  + Add Insurance info
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('payment_collection')"
                >
                  + Add Payment collection
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('communications')"
                >
                  + Add Communications
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('demographics')"
                >
                  + Add Demographics
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('clinical_questions')"
                >
                  + Add Clinical Questions
                </button>
                <span v-if="hasProgrammedSchoolRoiStep" class="programmed-step-pill">
                  Programmed School ROI active
                </span>
              </div>
              <p
                v-if="showGuardianWaiverStepHint"
                class="muted form-help"
                style="margin-top: 10px; max-width: 52rem; line-height: 1.45;"
              >
                To add <strong>Guardian waivers</strong>, set <strong>Create Guardian</strong> to <strong>Yes</strong> above.
                Waiver data still saves to the guardian–client profile; kiosk requirements follow each program site (and optional event).
              </p>

              <div v-if="form.intakeSteps.length === 0" class="muted">No steps yet.</div>

              <div v-if="qsetInsertedNotice" class="qset-inserted-notice">
                ✅ Question set added as a new step — <strong>save the form</strong> to keep it.
              </div>

              <div
                v-for="(step, idx) in safeSteps"
                :key="step.id"
                class="step-card"
                :class="{ 'step-card--guardian-flow': step.type === 'guardian_waiver' }"
              >
                <div class="step-header">
                  <div class="step-header-start">
                    <strong>{{ getStepTypeLabel(step.type) }}</strong>
                    <span v-if="step.type === 'guardian_waiver'" class="step-flow-pill step-flow-pill--guardian">Guardian</span>
                    <span v-if="step.type === 'clinical_questions'" class="step-flow-pill step-flow-pill--clinical">Clinical</span>
                    <span v-if="step.type === 'demographics'" class="step-flow-pill step-flow-pill--demographics">Demographics</span>
                  </div>
                  <div class="step-controls">
                    <button class="btn btn-xs btn-secondary" type="button" @click="moveStep(idx, -1)" :disabled="idx === 0">↑</button>
                    <button class="btn btn-xs btn-secondary" type="button" @click="moveStep(idx, 1)" :disabled="idx === form.intakeSteps.length - 1">↓</button>
                    <button class="btn btn-xs btn-danger" type="button" @click="removeStep(idx)">Remove</button>
                  </div>
                </div>

                <div v-if="step.type === 'upload'" class="form-grid">
                  <div class="form-group">
                    <label>Label</label>
                    <input v-model="step.label" type="text" placeholder="e.g., Resume, Cover Letter" />
                  </div>
                  <div class="form-group">
                    <label>Accepted file types</label>
                    <input v-model="step.accept" type="text" placeholder="e.g., .pdf,.doc,.docx or application/pdf" />
                    <small class="form-help">Leave blank for PDF only. Use .pdf,.doc,.docx for multiple types.</small>
                  </div>
                  <div class="form-group">
                    <label>Max files</label>
                    <input v-model.number="step.maxFiles" type="number" min="1" max="10" placeholder="1" />
                  </div>
                  <div class="form-group">
                    <label class="checkbox">
                      <input v-model="step.required" type="checkbox" />
                      Required
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="checkbox">
                      <input v-model="step.allowPasteText" type="checkbox" />
                      Allow paste text (in addition to file upload)
                    </label>
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this upload step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only (skip when existing client match)</option>
                      <option value="existing_client_only">Existing clients only (skip for new client match)</option>
                    </select>
                  </div>
                </div>

                <div v-else-if="step.type === 'references'" class="form-grid">
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Step title</label>
                    <input v-model="step.label" type="text" placeholder="Professional references" />
                  </div>
                  <div class="form-group">
                    <label>Minimum references</label>
                    <input v-model.number="step.minReferences" type="number" min="1" max="5" />
                  </div>
                  <div class="form-group">
                    <label class="checkbox">
                      <input v-model="step.waivable" type="checkbox" />
                      Include waiver option
                    </label>
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Authorization notice</label>
                    <textarea v-model="step.authorizationNotice" rows="5" />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this references step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only (skip when existing client match)</option>
                      <option value="existing_client_only">Existing clients only (skip for new client match)</option>
                    </select>
                  </div>
                </div>

                <div v-if="step.type === 'document'" class="form-grid">
                  <div class="form-group">
                    <label>Document Template</label>
                    <div
                      class="document-step-select-wrap"
                      :ref="(el) => openDocumentStepSelectId === step.id && (documentStepSelectRef = el)"
                    >
                      <button
                        type="button"
                        class="document-step-trigger"
                        @click="toggleDocumentStepSelect(step.id)"
                      >
                        {{ getSelectedTemplateLabel(step.templateId) || 'Select document' }}
                      </button>
                      <div v-if="openDocumentStepSelectId === step.id" class="document-step-dropdown">
                        <input
                          ref="documentStepFilterInputRef"
                          v-model="documentStepFilter"
                          type="text"
                          class="document-step-filter"
                          placeholder="Type to filter (e.g. P for documents starting with P)"
                          @keydown.escape="closeDocumentStepSelect"
                        />
                        <div class="document-step-list">
                          <button
                            type="button"
                            class="document-step-option"
                            :class="{ selected: step.templateId === null }"
                            @click="selectDocumentTemplate(step, null)"
                          >
                            Select document
                          </button>
                          <button
                            v-for="t in filteredDocumentStepTemplates"
                            :key="t.id"
                            type="button"
                            class="document-step-option"
                            :class="{ selected: step.templateId === t.id }"
                            @click="selectDocumentTemplate(step, t.id)"
                          >
                            {{ t.name }} ({{ t.document_action_type }})
                          </button>
                        </div>
                      </div>
                    </div>
                    <div v-if="!templates.length" class="muted">
                      No document templates available. Create one in Documents Library.
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Checkbox instructions (optional)</label>
                    <textarea
                      v-model="step.checkboxDisclaimer"
                      rows="2"
                      placeholder="e.g., Check each box if you agree with the statement on that line. You may uncheck any you do not agree with."
                    ></textarea>
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this document step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only (skip when existing client match)</option>
                      <option value="existing_client_only">Existing clients only (skip for new client match)</option>
                    </select>
                  </div>
                </div>

                <div v-if="step.type === 'school_roi'" class="form-grid">
                  <div class="form-group">
                    <label>School ROI Section</label>
                    <div class="muted">
                      This inserts the programmed Smart School ROI step as its own section in the sequence.
                      No template dropdown is required for this step.
                    </div>
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this School ROI step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only (skip when existing client match)</option>
                      <option value="existing_client_only">Existing clients only (skip for new client match)</option>
                    </select>
                  </div>
                </div>

                <div v-else-if="step.type === 'guardian_waiver'" class="form-grid">
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Step title</label>
                    <input v-model="step.label" type="text" placeholder="e.g., Guardian waivers & safety" />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Waiver sections</label>
                    <div class="muted" style="margin-bottom: 8px;">
                      Signers complete pickup, emergency contacts, allergies/meals, and e-sign consent. Saved to the
                      guardian–client waiver profile when the agency has <code>guardianWaiversEnabled</code>. Kiosk “required”
                      sections follow each <strong>program site</strong> (and optional event), not this form’s scope alone.
                    </div>
                    <div class="checkbox-stack">
                      <label v-for="opt in guardianWaiverSectionOptions" :key="opt.value" class="checkbox">
                        <input type="checkbox" :value="opt.value" v-model="step.sectionKeys" />
                        {{ opt.label }}
                      </label>
                    </div>
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only (skip when existing client match)</option>
                      <option value="existing_client_only">Existing clients only (skip for new client match)</option>
                    </select>
                  </div>
                </div>

                <div v-else-if="step.type === 'insurance_info'" class="form-grid">
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Step title</label>
                    <input v-model="step.label" type="text" placeholder="Insurance information" />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Non-Medicaid disclaimer / notice text</label>
                    <div class="muted" style="margin-bottom: 6px; font-size: 13px;">
                      Shown when the family selects a <strong>non-Medicaid</strong> insurer, above the insurance fields.
                      Use this to explain why payment information will also be collected. Leave blank to omit.
                    </div>
                    <textarea
                      v-model="step.nonMedicaidDisclaimerText"
                      rows="4"
                      placeholder="e.g., Because your insurance plan is not a Medicaid plan, a cost-share or private-pay balance may apply for this program. Payment information will be collected in the next step."
                    />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Secondary insurance notice (optional)</label>
                    <div class="muted" style="margin-bottom: 6px; font-size: 13px;">
                      Shown for every family on this step, after primary insurance and before the optional secondary block.
                      Leave blank to use the default notice about reporting secondary coverage.
                    </div>
                    <textarea
                      v-model="step.secondaryInsuranceDisclaimerText"
                      rows="4"
                      placeholder="Override the default secondary-insurance notice, or leave blank for the built-in text."
                    />
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only</option>
                    </select>
                  </div>
                </div>

                <div v-else-if="step.type === 'payment_collection'" class="form-grid">
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Step title</label>
                    <input v-model="step.label" type="text" placeholder="Payment information" />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Cost disclosure / terms text</label>
                    <div class="muted" style="margin-bottom: 6px; font-size: 13px;">
                      Displayed at the top of the payment collection form. Include the cost amount, billing cadence, and
                      any relevant payment terms. The platform payment disclaimer is always appended automatically.
                    </div>
                    <textarea
                      v-model="step.costDisclosureText"
                      rows="4"
                      placeholder="e.g., The total program fee of $150 is billed per session. Your card will be charged at the start of each session unless paid in advance."
                    />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label class="checkbox" style="gap: 8px; display: flex; align-items: center;">
                      <input v-model="step.autoChargeDefault" type="checkbox" />
                      Default to auto-charge (families may opt out during enrollment)
                    </label>
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only</option>
                    </select>
                  </div>
                </div>

                <div v-else-if="step.type === 'communications'" class="form-grid">
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Step title</label>
                    <input v-model="step.label" type="text" placeholder="Communication preferences" />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Audience</label>
                    <select v-model="step.audience">
                      <option value="auto">Auto (based on form context)</option>
                      <option value="guardian_client">Guardian / client</option>
                      <option value="workforce">Employee / contractor</option>
                      <option value="school_staff">School staff</option>
                    </select>
                    <div class="muted" style="font-size: 13px; margin-top: 6px;">
                      Auto uses the intake context. Job/onboarding-style links default to workforce wording.
                    </div>
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label class="checkbox">
                      <input v-model="step.campaigns.scheduling" type="checkbox" />
                      Include Campaign 1 — Appointment scheduling + reminders (required for A2P proof)
                    </label>
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label class="checkbox">
                      <input v-model="step.campaigns.providerTexting" type="checkbox" />
                      Include Campaign 2 — Provider ↔ client 1:1 conversational texting
                    </label>
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label class="checkbox">
                      <input v-model="step.campaigns.programUpdates" type="checkbox" />
                      Include Campaign 3 — Program/service opportunities
                    </label>
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label class="checkbox">
                      <input v-model="step.campaigns.internalWorkforce" type="checkbox" />
                      Include Campaign 4 — Internal workforce + school staff notifications
                    </label>
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <div class="muted" style="font-size: 13px; line-height: 1.45;">
                      This step renders platform-standard consent language for SMS/email, including frequency, rates,
                      STOP/HELP, and Terms/Privacy references.
                    </div>
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Show this step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only</option>
                      <option value="existing_client_only">Existing clients only</option>
                    </select>
                  </div>
                </div>

                <div v-else-if="step.type === 'registration'" class="form-grid">
                  <div
                    v-if="registrationFlowAdmin"
                    class="form-group"
                    style="grid-column: 1 / -1; padding: 10px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;"
                  >
                    <strong style="display: block; margin-bottom: 6px;">Choosing a real company / Skill Builders event</strong>
                    <span class="muted" style="font-size: 13px; line-height: 1.45;">
                      There is no Agency → Program → Event cascade here. Use one of these:
                      <br />
                      <strong>1)</strong> Set <strong>Source type</strong> to <strong>Agency catalog (public)</strong> — signers pick from
                      live events on <em>this link&rsquo;s agency</em> that are marked registration-eligible and still open.
                      <br />
                      <strong>2)</strong> Or, in link settings, choose the <strong>company event</strong> (after picking the agency).
                      You can save the link first and attach the event later; the editor highlights until one is selected.
                      <br />
                      <strong>Programs</strong> = affiliated program <em>organizations</em> (e.g. D11 Summer), not a specific dated
                      event — use schedule blocks / copy for timing unless you use the catalog or lock.
                    </span>
                  </div>
                  <div class="form-group">
                    <label>Step title</label>
                    <input v-model="step.label" type="text" placeholder="e.g., Registration Selection" />
                  </div>
                  <div class="form-group">
                    <label>Description (optional)</label>
                    <input v-model="step.description" type="text" placeholder="e.g., Choose one or more options below" />
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="grid-column: 1 / -1;">
                    <label>Registration step</label>
                    <p class="form-help" style="margin: 0 0 8px;">
                      Always shown for everyone: they start a session like other intakes and are enrolled into the link&rsquo;s
                      company event. Use <strong>Show this … step</strong> on <strong>questions</strong>, <strong>documents</strong>, and
                      <strong>upload</strong> steps to hide redundant signing or fields for <em>existing</em> clients (profile already has
                      that data); new clients still complete those steps.
                    </p>
                  </div>
                  <div class="form-group">
                    <label>Source type</label>
                    <select v-model="step.sourceType" @change="onRegistrationSourceTypeChange(step)">
                      <option value="manual">Manual options (labels only; not tied to DB events)</option>
                      <option value="program">Programs (affiliated program orgs)</option>
                      <option value="program_event">Program events (shift sites &amp; slots)</option>
                      <option value="class">Classes (learning)</option>
                      <option value="event">Manual options + event id field (advanced; prefer catalog or lock)</option>
                      <option value="agency_catalog">Agency catalog (public) — recommended for real events</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Registration mode</label>
                    <select v-model="step.participantMode">
                      <option value="any">{{ registrationFlowAdmin && form.companyEventId ? 'New or existing attendee' : 'New or existing participant' }}</option>
                      <option value="existing_only">{{ registrationFlowAdmin && form.companyEventId ? 'Existing attendee/member only (recommended for staff events)' : 'Existing participant only' }}</option>
                      <option value="new_only">{{ registrationFlowAdmin && form.companyEventId ? 'New attendee only' : 'New participant only' }}</option>
                    </select>
                    <small v-if="registrationFlowAdmin && form.companyEventId" class="form-help" style="color:#64748b;font-size:12px;">
                      For company events, attendees receive a tokenized invitation and are looked up by email.
                      "Existing attendee/member only" is recommended since all invitees are already in the system.
                    </small>
                  </div>
                  <div class="form-group">
                    <label>Existing lookup key</label>
                    <select v-model="step.existingLookupField">
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="client_id">Client ID</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="checkbox">
                      <input v-model="step.selectionRules.allowMultiple" type="checkbox" @change="onRegistrationRuleChange(step)" />
                      Allow multiple selections
                    </label>
                  </div>
                  <div class="form-group">
                    <label>Minimum selections</label>
                    <input
                      v-model.number="step.selectionRules.minSelections"
                      type="number"
                      min="0"
                      :max="step.selectionRules.allowMultiple ? 99 : 1"
                      @change="onRegistrationRuleChange(step)"
                    />
                  </div>
                  <div class="form-group">
                    <label>Default video link (optional)</label>
                    <input v-model="step.defaultVideoUrl" type="url" placeholder="https://..." />
                  </div>
                  <div class="form-group">
                    <label>Provider User IDs (comma-separated)</label>
                    <input v-model="step.providerUserIdsCsv" type="text" placeholder="e.g., 102, 214" />
                  </div>
                  <div class="form-group">
                    <label class="checkbox">
                      <input v-model="step.selfPay.enabled" type="checkbox" />
                      Enable self-pay
                    </label>
                  </div>
                  <div class="form-group" v-if="step.selfPay.enabled">
                    <label>Cost (USD)</label>
                    <input v-model.number="step.selfPay.costDollars" type="number" min="0" step="0.01" />
                  </div>
                  <div class="form-group" v-if="step.selfPay.enabled">
                    <label>QuickBooks payment link (optional)</label>
                    <input v-model="step.selfPay.paymentLinkUrl" type="url" placeholder="https://..." />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Schedule blocks (multi-day / sequence)</label>
                    <div class="option-list">
                      <div v-for="(sb, sbIdx) in step.scheduleBlocks" :key="sb.id || sbIdx" class="option-row">
                        <input v-model="sb.label" placeholder="Label (e.g., Weeknight Group A)" />
                        <input v-model="sb.startDate" type="date" />
                        <input v-model="sb.endDate" type="date" />
                        <input v-model="sb.startTime" type="time" />
                        <input v-model="sb.endTime" type="time" />
                        <input v-model.number="sb.sequenceDays" type="number" min="1" max="365" placeholder="Days in sequence" />
                        <button class="btn btn-xs btn-secondary" type="button" @click="removeRegistrationScheduleBlock(step, sbIdx)">×</button>
                      </div>
                      <button class="btn btn-xs btn-secondary" type="button" @click="addRegistrationScheduleBlock(step)">+ Schedule block</button>
                    </div>
                  </div>
                  <div class="form-group" v-if="step.selectionRules.allowMultiple">
                    <label>Maximum selections (optional)</label>
                    <input
                      v-model.number="step.selectionRules.maxSelections"
                      type="number"
                      min="1"
                      max="99"
                      @change="onRegistrationRuleChange(step)"
                    />
                  </div>
                  <div class="form-group" v-if="step.sourceType === 'program'" style="grid-column: 1 / -1;">
                    <p class="muted" style="margin: 0 0 10px;">
                      Affiliated <strong>program organizations</strong> on your account (e.g. D11 Summer, Skill Builders). Use this
                      for portal-style programs; pair with schedule blocks below as needed.
                    </p>
                    <label>Programs</label>
                    <div class="template-list" v-if="programOrganizations.length">
                      <label v-for="org in programOrganizations" :key="`reg_prog_${org.id}`" class="template-item">
                        <input
                          type="checkbox"
                          :value="Number(org.id)"
                          v-model="step.sourceConfig.selectedProgramOrganizationIds"
                          @change="refreshRegistrationStepOptions(step)"
                        />
                        {{ org.name }}
                      </label>
                    </div>
                    <div v-else class="muted">No program organizations found.</div>
                  </div>
                  <div class="form-group" v-if="step.sourceType === 'program_event'" style="grid-column: 1 / -1;">
                    <p class="muted" style="margin: 0 0 10px;">
                      Uses <strong>shift programs</strong> (Programs hub: sites and weekly slots). This is not the same as
                      affiliated <strong>program organizations</strong> (e.g. D11 Summer). For those, use source type
                      <strong>Programs</strong> or <strong>Agency catalog (public)</strong> for published company events.
                    </p>
                    <label>Agency</label>
                    <select
                      v-model.number="step.sourceConfig.programEventAgencyId"
                      @change="onRegistrationProgramEventAgencyChange(step)"
                    >
                      <option :value="null">Select agency</option>
                      <option v-for="agency in agencyList" :key="`reg_prog_event_agency_${agency.id}`" :value="Number(agency.id)">
                        {{ agency.name }}
                      </option>
                    </select>
                    <div class="form-group" style="margin-top:8px;">
                      <label>Shift program</label>
                      <select
                        v-model.number="step.sourceConfig.programEventProgramId"
                        :disabled="!step.sourceConfig.programEventAgencyId"
                        @change="onRegistrationProgramEventProgramChange(step)"
                      >
                        <option :value="null">Select shift program</option>
                        <option
                          v-for="prog in getShiftProgramsForAgency(step.sourceConfig.programEventAgencyId)"
                          :key="`reg_prog_event_program_${prog.id}`"
                          :value="Number(prog.id)"
                        >
                          {{ prog.name }}
                        </option>
                      </select>
                      <p
                        v-if="step.sourceConfig.programEventAgencyId && shiftProgramsErrorByAgencyId[step.sourceConfig.programEventAgencyId]"
                        class="form-help"
                        style="color: #b45309; margin-top: 6px;"
                      >
                        {{ shiftProgramsErrorByAgencyId[step.sourceConfig.programEventAgencyId] }}
                      </p>
                      <p
                        v-else-if="
                          step.sourceConfig.programEventAgencyId &&
                          !loadingShiftProgramsByAgency[step.sourceConfig.programEventAgencyId] &&
                          !getShiftProgramsForAgency(step.sourceConfig.programEventAgencyId).length
                        "
                        class="muted"
                        style="margin-top: 6px;"
                      >
                        No shift programs returned. Enable <strong>Shift programs</strong> on the agency (feature flags) and
                        create programs under Programs / shift scheduling, or switch source type to <strong>Programs</strong> for
                        affiliated program orgs.
                      </p>
                    </div>
                    <div class="form-group" style="margin-top:8px;">
                      <label>Site</label>
                      <select
                        v-model.number="step.sourceConfig.programEventSiteId"
                        :disabled="!step.sourceConfig.programEventProgramId"
                        @change="onRegistrationProgramEventSiteChange(step)"
                      >
                        <option :value="null">Select site</option>
                        <option
                          v-for="site in getShiftProgramSites(step.sourceConfig.programEventProgramId)"
                          :key="`reg_prog_event_site_${site.id}`"
                          :value="Number(site.id)"
                        >
                          {{ site.name }}
                        </option>
                      </select>
                    </div>
                    <div class="template-list" style="margin-top:8px;" v-if="step.sourceConfig.programEventSiteId && getShiftProgramSiteSlots(step.sourceConfig.programEventSiteId).length">
                      <label
                        v-for="slot in getShiftProgramSiteSlots(step.sourceConfig.programEventSiteId)"
                        :key="`reg_prog_event_slot_${slot.id}`"
                        class="template-item"
                      >
                        <input
                          type="checkbox"
                          :value="Number(slot.id)"
                          v-model="step.sourceConfig.selectedProgramEventSlotIds"
                          @change="refreshRegistrationStepOptions(step)"
                        />
                        {{ formatProgramEventSlotLabel(slot) }}
                      </label>
                    </div>
                    <div
                      v-else-if="step.sourceConfig.programEventSiteId && loadingShiftSlotsBySite[step.sourceConfig.programEventSiteId]"
                      class="muted"
                      style="margin-top:8px;"
                    >
                      Loading event slots...
                    </div>
                    <div v-else-if="step.sourceConfig.programEventSiteId" class="muted" style="margin-top:8px;">
                      No event slots found for this site.
                    </div>
                  </div>
                  <div class="form-group" v-if="step.sourceType === 'class'" style="grid-column: 1 / -1;">
                    <label>Learning organization</label>
                    <select v-model.number="step.sourceConfig.learningOrganizationId" @change="onRegistrationLearningOrganizationChange(step)">
                      <option :value="null">Select learning organization</option>
                      <option v-for="org in learningOrganizations" :key="`reg_learning_org_${org.id}`" :value="Number(org.id)">
                        {{ org.name }}
                      </option>
                    </select>
                    <div class="template-list" v-if="step.sourceConfig.learningOrganizationId && getLearningClassesForOrganization(step.sourceConfig.learningOrganizationId).length">
                      <label
                        v-for="klass in getLearningClassesForOrganization(step.sourceConfig.learningOrganizationId)"
                        :key="`reg_class_${klass.id}`"
                        class="template-item"
                      >
                        <input
                          type="checkbox"
                          :value="Number(klass.id)"
                          v-model="step.sourceConfig.selectedClassIds"
                          @change="onRegistrationClassSelectionChange(step)"
                        />
                        {{ klass.class_name || klass.title || klass.class_code || `Class ${klass.id}` }}
                      </label>
                    </div>
                    <div v-else-if="step.sourceConfig.learningOrganizationId && loadingLearningClassesForOrganization[step.sourceConfig.learningOrganizationId]" class="muted">
                      Loading classes...
                    </div>
                    <div v-else-if="step.sourceConfig.learningOrganizationId" class="muted">
                      No classes found for this learning organization.
                    </div>
                  </div>
                  <div v-if="step.sourceType === 'agency_catalog'" class="muted" style="grid-column: 1 / -1;">
                    With the catalog, signers see registration-eligible items for the agency. Smart registration links also
                    require a <strong>company event</strong> in link settings: the API and enrollment use that event (catalog
                    options narrow to it when set).
                  </div>
                  <div class="form-group" v-if="step.sourceType === 'manual' || step.sourceType === 'event'" style="grid-column: 1 / -1;">
                    <label>Options</label>
                    <div v-if="step.sourceType === 'event'" class="muted" style="margin-bottom: 8px;">
                      For a normal public event flow, use <strong>Agency catalog (public)</strong> and set the link&rsquo;s
                      <strong>company event</strong>. Use this only if you are entering options by hand and optional numeric event ids (advanced).
                    </div>
                    <div class="option-list">
                      <div v-for="(opt, oIdx) in step.options" :key="opt.id || oIdx" class="option-row">
                        <input v-model="opt.label" placeholder="Option label" @input="refreshRegistrationStepOptions(step)" />
                        <input v-model="opt.description" placeholder="Optional description" @input="refreshRegistrationStepOptions(step)" />
                        <input v-model="opt.videoJoinUrl" type="url" placeholder="Video link (optional)" @input="refreshRegistrationStepOptions(step)" />
                        <input v-model.number="opt.costDollars" type="number" min="0" step="0.01" placeholder="Cost USD" @input="refreshRegistrationStepOptions(step)" />
                        <input v-model="opt.paymentLinkUrl" type="url" placeholder="QuickBooks payment link" @input="refreshRegistrationStepOptions(step)" />
                        <input v-model="opt.providerUserIdsCsv" type="text" placeholder="Provider IDs (e.g., 4,9)" @input="refreshRegistrationStepOptions(step)" />
                        <button class="btn btn-xs btn-secondary" type="button" @click="removeRegistrationOption(step, oIdx)">×</button>
                      </div>
                      <button class="btn btn-xs btn-secondary" type="button" @click="addRegistrationOption(step)">+ Option</button>
                    </div>
                  </div>
                </div>

                <div v-else-if="step.type === 'demographics'" class="form-grid">
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Step title</label>
                    <input v-model="step.label" type="text" placeholder="Demographics" />
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <p class="muted" style="margin: 0; font-size: 13px;">
                      This step collects standard demographic fields and saves them directly to the client's profile.
                      Choose which fields to display:
                    </p>
                  </div>
                  <div class="form-group">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 8px;">
                      <input v-model="step.showDob" type="checkbox" />
                      Date of birth
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 8px;">
                      <input v-model="step.showGender" type="checkbox" />
                      Gender
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 8px;">
                      <input v-model="step.showEthnicity" type="checkbox" />
                      Race / Ethnicity
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 8px;">
                      <input v-model="step.showAddress" type="checkbox" />
                      Address (street, city, state, zip)
                    </label>
                  </div>
                  <div class="form-group">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 8px;">
                      <input v-model="step.showPreferredLanguage" type="checkbox" />
                      Preferred language
                    </label>
                  </div>
                  <div class="form-group" style="grid-column: 1 / -1;">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 8px;">
                      <input v-model="step.hideForExisting" type="checkbox" />
                      Skip this step for returning / existing clients (recommended)
                    </label>
                  </div>
                </div>

                <div v-else-if="step.type === 'questions' || step.type === 'clinical_questions'" class="question-builder">
                  <div v-if="step.type === 'clinical_questions'" class="form-group" style="margin-bottom: 12px; padding: 10px 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; grid-column: 1 / -1;">
                    <p class="muted" style="margin: 0; font-size: 13px;">
                      <strong>Clinical questions</strong> — answers are stored separately and only visible to the assigned provider
                      in the <strong>Clinical</strong> tab of the client profile. They are excluded from the standard intake PDF.
                    </p>
                  </div>
                  <div v-if="registrationFlowAdmin" class="form-group" style="margin-bottom: 12px;">
                    <label>Show this questions step</label>
                    <select v-model="step.visibility">
                      <option value="always">Always</option>
                      <option value="new_client_only">New clients only (hide when existing client match)</option>
                    </select>
                  </div>
                  <div class="question-list">
                    <div v-for="(field, fIdx) in getStepFields(step)" :key="field.id || fIdx" class="question-block">
                      <div class="question-label-row">
                        <div class="question-index">#{{ fIdx + 1 }}</div>
                        <input v-model="field.label" placeholder="Question label" class="question-label-input" />
                      </div>
                      <div class="question-row">
                        <input v-model="field.key" placeholder="Key (e.g., grade)" />
                        <select v-model="field.type">
                          <option value="text">Short answer</option>
                          <option value="textarea">Long answer</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="select">Select</option>
                          <option value="radio">Radio</option>
                          <option value="date">Date</option>
                          <option value="info">Info / Disclaimer</option>
                        </select>
                        <select v-model="field.scope">
                          <option value="client">Client (repeats per child)</option>
                          <option value="self">Self (only when filling for themselves)</option>
                          <option value="guardian">Guardian (one-time)</option>
                          <option value="submission">One-time (global)</option>
                        </select>
                        <label class="checkbox">
                          <input v-model="field.required" type="checkbox" :disabled="field.type === 'info'" />
                          Required
                        </label>
                        <select v-if="registrationFlowAdmin" v-model="field.visibility" title="Field visibility">
                          <option value="always">Always show</option>
                          <option value="new_client_only">New clients only</option>
                        </select>
                        <div class="question-controls">
                          <button class="btn btn-xs btn-secondary" type="button" @click="moveField(step, fIdx, -1)" :disabled="fIdx === 0">↑</button>
                          <button class="btn btn-xs btn-secondary" type="button" @click="moveField(step, fIdx, 1)" :disabled="fIdx === getStepFields(step).length - 1">↓</button>
                          <button class="btn btn-xs btn-secondary" type="button" @click="addFieldAfter(step, fIdx)">＋</button>
                          <button class="btn btn-xs btn-danger" type="button" @click="removeField(step, fIdx)">×</button>
                        </div>
                      </div>
                      <div class="question-meta">
                        <input v-model="field.helperText" placeholder="Helper text / disclaimer (optional)" />
                    <input
                      v-model="field.documentKey"
                      placeholder="Document field key for autofill (optional)"
                    />
                        <div class="condition-row">
                          <select v-model="field.showIf.fieldKey">
                            <option value="">Show if (optional)</option>
                            <option
                              v-for="target in getConditionalTargets(step, fIdx)"
                              :key="target.key"
                              :value="target.key"
                            >
                              {{ target.label || target.key }}
                            </option>
                          </select>
                          <input
                            v-model="field.showIf.equals"
                            :disabled="!field.showIf.fieldKey"
                            placeholder="Equals value (e.g., yes)"
                          />
                        </div>
                        <div v-if="registrationFlowAdmin" class="condition-row">
                          <button
                            class="btn btn-xs btn-secondary"
                            type="button"
                            @click="applyRegistrationAccountShowIf(field, 'new')"
                          >
                            Show for new accounts only
                          </button>
                          <button
                            class="btn btn-xs btn-secondary"
                            type="button"
                            @click="applyRegistrationAccountShowIf(field, 'existing')"
                          >
                            Show for existing accounts only
                          </button>
                          <button
                            v-if="isRegistrationAccountShowIf(field)"
                            class="btn btn-xs btn-secondary"
                            type="button"
                            @click="clearFieldShowIf(field)"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div v-if="field?.type === 'select' || field?.type === 'radio'" class="option-list">
                        <div v-for="(opt, oIdx) in field.options" :key="opt.id" class="option-row">
                          <input v-model="opt.label" placeholder="Option label" />
                          <input v-model="opt.value" placeholder="Value" />
                          <button class="btn btn-xs btn-secondary" type="button" @click="removeOption(field, oIdx)">×</button>
                        </div>
                        <button class="btn btn-xs btn-secondary" type="button" @click="addOption(field)">+ Option</button>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-xs btn-secondary" type="button" @click="addField(step)">+ Add Question</button>
                </div>
              </div>

              <div v-if="safeSteps.length" class="step-actions step-actions-bottom">
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('questions')">+ Add Questions</button>
                <button v-if="questionSets.length" class="btn btn-secondary btn-sm" type="button" @click="openQSetPicker">+ Add Question Set</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('registration')">+ Add Registration</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('document')">+ Add Document</button>
                <button
                  v-if="canAddSchoolRoiStep"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addSchoolRoiStep"
                >
                  + Add School ROI
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('upload')">+ Add Upload</button>
                <button
                  v-if="form.formType === 'job_application'"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('references')"
                >
                  + Add References
                </button>
                <button
                  v-if="canAddGuardianWaiverStep"
                  class="btn btn-secondary btn-sm btn-flow-add-guardian"
                  type="button"
                  @click="addStep('guardian_waiver')"
                >
                  + Add Guardian waivers
                </button>
                <button
                  class="btn btn-secondary btn-sm btn-flow-add-guardian"
                  type="button"
                  @click="addStep('insurance_info')"
                >
                  + Add Insurance info
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('payment_collection')"
                >
                  + Add Payment collection
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('communications')"
                >
                  + Add Communications
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('demographics')"
                >
                  + Add Demographics
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="addStep('clinical_questions')"
                >
                  + Add Clinical Questions
                </button>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <div v-if="formError" class="error">{{ formError }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <Teleport to="body">
    <div v-if="showAddOnPreviewModal" class="modal-backdrop addon-preview-backdrop" @click.self="closeAddOnPreviewModal">
      <div class="modal-box addon-preview-modal-box" style="max-width: 860px;">
        <div class="modal-header">
          <h3 style="margin:0;">Preview Add-Ons</h3>
          <button class="btn btn-xs btn-secondary" type="button" @click="closeAddOnPreviewModal">✕</button>
        </div>
        <div class="modal-body" style="padding: 16px;">
          <template v-if="!selectedAddOnPreviewId">
            <p class="muted" style="margin-top:0;">
              Choose any add-on to preview how it appears to people filling out the form.
            </p>
            <div class="addon-preview-list">
              <button
                v-for="item in addOnPreviewItems"
                :key="item.id"
                class="addon-preview-item"
                type="button"
                @click="openAddOnPreview(item.id)"
              >
                <strong>{{ item.label }}</strong>
                <span class="muted">{{ item.description }}</span>
              </button>
            </div>
          </template>
          <template v-else>
            <div class="addon-preview-header-row">
              <button class="btn btn-secondary btn-sm" type="button" @click="backToAddOnList">← Back</button>
              <div>
                <h4 style="margin: 0;">{{ selectedAddOnPreview?.label || 'Preview' }}</h4>
                <div class="muted">Participant-facing preview</div>
              </div>
            </div>

            <div v-if="selectedAddOnPreviewId === 'guardian_waiver'" class="addon-preview-form">
              <PublicIntakeGuardianWaiverStep
                :model-value="previewGuardianWaivers"
                :section-keys="['pickup_authorization', 'emergency_contacts', 'allergies_snacks', 'meal_preferences']"
                :client-labels="['Client 1']"
                :guardian-default-pickup="{ name: 'Demo Guardian', relationship: 'Parent/Guardian', phone: '(555) 555-0101' }"
                saved-signature-data="data:image/png;base64,preview"
                :event-waiver-context="{ snacksAvailable: true, snackOptions: ['Fruit', 'Crackers'], mealsAvailable: true, mealOptions: ['Lunch'] }"
              />
            </div>

            <div v-else-if="selectedAddOnPreviewId === 'insurance_info'" class="addon-preview-form">
              <PublicIntakeInsuranceStep
                :model-value="previewInsurance"
                :step-config="{ nonMedicaidDisclaimerText: '', secondaryInsuranceDisclaimerText: '', requireSecondaryInsurance: false }"
                guardian-name="Demo Guardian"
                guardian-relationship="Parent/Guardian"
                guardian-phone="(555) 555-0101"
                :client-names="['Client 1']"
                :intake-for-self="false"
                agency-name="Demo Agency"
                @update:model-value="setPreviewInsurance"
              />
            </div>

            <div v-else-if="selectedAddOnPreviewId === 'payment_collection'" class="addon-preview-form">
              <PublicIntakePaymentStep
                :model-value="previewPayment"
                :step-config="{ costDisclosureText: 'This is a preview of the payment step.', costSummary: '$125.00' }"
                public-key="preview"
                :submission-id="1"
                cost-display="$125.00"
                @update:model-value="setPreviewPayment"
              />
            </div>

            <div v-else-if="selectedAddOnPreviewId === 'communications'" class="addon-preview-form">
              <p class="muted" style="margin-bottom: 12px;">
                Choose how you would like to receive platform communications. You can update these preferences at any time.
              </p>

              <!-- Campaign 1: Email -->
              <section class="communications-campaign-card">
                <h4>Email Communication Preference <span class="required-indicator">*</span></h4>
                <p class="communications-disclosure">
                  Please choose what you would like to receive emails from us. If you opt in, we may email you about scheduling, appointment reminders, and—if selected—updates about mental health programs and services. Your email will never be shared or sold to third parties, and you may unsubscribe at any time.
                </p>
                <div class="radio-group">
                  <label class="radio-row">
                    <input v-model="previewCommunications.emailPreference" type="radio" value="all" name="preview_email_pref" />
                    <span>Yes - Scheduling + all program communications</span>
                  </label>
                  <label class="radio-row">
                    <input v-model="previewCommunications.emailPreference" type="radio" value="scheduling_only" name="preview_email_pref" />
                    <span>Yes - Scheduling only</span>
                  </label>
                  <label class="radio-row">
                    <input v-model="previewCommunications.emailPreference" type="radio" value="no" name="preview_email_pref" />
                    <span>No</span>
                  </label>
                </div>
              </section>

              <!-- Campaign 2: SMS -->
              <section class="communications-campaign-card">
                <h4>Text Message (SMS) Communication Preference <span class="required-indicator">*</span></h4>
                <p class="communications-disclosure">
                  [Top Level Agency] utilizes PlotTwistHQ, a platform by PlotTwistCo (PTCo), to facilitate appointment scheduling, reminders, and related communication.
                  All messages you receive are scheduled, coordinated, and established directly by [Top Level Agency] — you will never receive any communications from PlotTwistCo (PTCo) directly.
                  Please select your preference for receiving text messages. If you opt in, you may receive messages related to scheduling and appointment reminders.
                  The default frequency is 7 days before and 24 hours before your appointment. You may be asked to reply with Yes or No regarding your attendance.
                  Message and data rates may apply. Reply STOP to opt out at any time and HELP for assistance.
                  Terms: <a href="/terms" target="_blank">/terms</a>.
                  Privacy: <a href="/privacypolicy" target="_blank">/privacypolicy</a>.
                </p>
                <div class="radio-group">
                  <label class="radio-row">
                    <input v-model="previewCommunications.smsPreference" type="radio" value="scheduling_only" name="preview_sms_pref" />
                    <span>Yes - Scheduling and appointment reminders</span>
                  </label>
                  <label class="radio-row">
                    <input v-model="previewCommunications.smsPreference" type="radio" value="no" name="preview_sms_pref" />
                    <span>No - Do not text me</span>
                  </label>
                </div>
              </section>

              <!-- Campaign 3: Provider/care-team texting -->
              <section class="communications-campaign-card">
                <h4>SMS With Your Provider/Care Team <span class="required-indicator">*</span></h4>
                <p class="communications-disclosure">
                  If you choose Yes, you consent to receive service-related text messages through PlotTwistHQ from
                  [Top Level Agency] and, when applicable, your provider/care team (for example, follow-up, coordination,
                  and service-related responses). These messages are HIPAA-protected and associated with your care
                  relationship at [Top Level Agency].
                </p>
                <p class="communications-disclosure" style="margin-top: 8px;">
                  By selecting <strong>Yes</strong> and opting in, you understand and agree to the following:
                </p>
                <ol class="communications-provider-terms">
                  <li>These messages may be viewed by the care team associated with your provider.</li>
                  <li>Your provider and our care team are <strong>not</strong> available for emergencies, and these messages are not monitored in real time. In case of emergency, call 911.</li>
                  <li>Your provider will not receive messages outside of their working hours. All messages are confidentially stored within the platform.</li>
                  <li>PlotTwistHQ is not responsible for, nor independently aware of, the content of direct communications between you and your provider.</li>
                  <li>You agree not to share confidential third-party information in these messages, and understand that this communication channel does <strong>not</strong> replace nor constitute clinical care or a therapeutic relationship.</li>
                </ol>
                <p class="communications-disclosure" style="margin-top: 8px;">
                  Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
                  Appointment reminders/confirmations are not sent from individual provider numbers.
                  Additional terms apply —
                  Terms: <a href="/terms" target="_blank">/terms</a>.
                  Privacy: <a href="/privacypolicy" target="_blank">/privacypolicy</a>.
                </p>
                <div class="radio-group">
                  <label class="radio-row">
                    <input v-model="previewCommunications.providerTextingOptIn" type="radio" value="yes" name="preview_provider_sms" />
                    <span>Yes - I opt in to provider/care-team texting and agree to the terms above</span>
                  </label>
                  <label class="radio-row">
                    <input v-model="previewCommunications.providerTextingOptIn" type="radio" value="no" name="preview_provider_sms" />
                    <span>No - Keep provider texting off</span>
                  </label>
                </div>
                <p class="communications-disclosure" style="margin-top: 10px;">
                  <strong>Please note:</strong> Your provider/care team sends these messages through PlotTwistHQ, and you receive/reply to them as standard SMS messages on your phone.
                  If you choose to respond to or initiate a text message with your provider or care team via SMS, you acknowledge and agree that the same terms and conditions outlined above apply to that exchange.
                  Additional terms are always available at
                  <a href="/terms" target="_blank">/terms</a> and
                  <a href="/privacypolicy" target="_blank">/privacypolicy</a>.
                </p>
              </section>

              <!-- Campaign 4: Program/service updates -->
              <section class="communications-campaign-card">
                <h4>Optional Program &amp; Service Updates <span class="required-indicator">*</span></h4>
                <p class="communications-disclosure">
                  If you choose Yes, [Top Level Agency] may send optional SMS updates through PlotTwistHQ about this agency's
                  programs and services (for example, openings, enrollment options, and availability). You may also
                  receive limited updates about relevant affiliate services. Affiliates never receive access to your
                  personal or clinical information through this update channel, and any affiliate program requires its
                  own separate opt-in for communication and registration. Message frequency is no greater than twice
                  per month. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
                  Terms: <a href="/terms" target="_blank">/terms</a>.
                  Privacy: <a href="/privacypolicy" target="_blank">/privacypolicy</a>.
                </p>
                <div class="radio-group">
                  <label class="radio-row">
                    <input v-model="previewCommunications.programUpdatesOptIn" type="radio" value="yes" name="preview_program_sms" />
                    <span>Yes - I want optional updates</span>
                  </label>
                  <label class="radio-row">
                    <input v-model="previewCommunications.programUpdatesOptIn" type="radio" value="no" name="preview_program_sms" />
                    <span>No - Keep optional updates off</span>
                  </label>
                </div>
              </section>

              <!-- Campaign 4 (alt): Internal workforce / school staff -->
              <section class="communications-campaign-card">
                <h4>Internal Workforce + School Staff Notifications (Opt-In) <span class="required-indicator">*</span></h4>
                <p class="communications-disclosure">
                  By opting in, you agree to receive SMS/text messages from [Top Level Agency] through PlotTwistHQ for operational
                  notifications and reminders, internal announcements, and optional polls/voting related to your participation on the
                  platform. Message frequency varies.
                  Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
                  Support: 833-756-8894 ext. 701 | hq@plottwistco.com.
                  Terms: <a href="/terms" target="_blank">/terms</a>.
                  Privacy: <a href="/privacypolicy" target="_blank">/privacypolicy</a>.
                </p>
                <div class="radio-group">
                  <label class="radio-row">
                    <input v-model="previewCommunications.internalWorkforceOptIn" type="radio" value="yes" name="preview_internal_sms" />
                    <span>Yes - I opt in to internal workforce / school staff SMS notifications</span>
                  </label>
                  <label class="radio-row">
                    <input v-model="previewCommunications.internalWorkforceOptIn" type="radio" value="no" name="preview_internal_sms" />
                    <span>No - Keep internal notifications off</span>
                  </label>
                </div>
              </section>
            </div>

            <!-- Demographics -->
            <div v-else-if="selectedAddOnPreviewId === 'demographics'" class="addon-preview-form">
              <p class="muted" style="margin-bottom: 16px;">
                Please fill in the following information so we can keep your records up to date.
              </p>
              <div class="form-grid">
                <div class="form-group">
                  <label>Date of Birth <span class="required-indicator">*</span></label>
                  <input v-model="previewSimple.dob" type="date" />
                </div>
                <div class="form-group">
                  <label>Gender</label>
                  <select v-model="previewSimple.gender">
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="nonbinary">Non-binary</option>
                    <option value="other">Other / self-describe</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Race / Ethnicity</label>
                  <select v-model="previewSimple.ethnicity">
                    <option value="">Prefer not to say</option>
                    <option value="american_indian">American Indian or Alaska Native</option>
                    <option value="asian">Asian</option>
                    <option value="black">Black or African American</option>
                    <option value="hispanic">Hispanic or Latino</option>
                    <option value="nhpi">Native Hawaiian or Other Pacific Islander</option>
                    <option value="white">White</option>
                    <option value="two_or_more">Two or more races</option>
                    <option value="other">Other / self-describe</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Preferred Language</label>
                  <select v-model="previewSimple.preferredLanguage">
                    <option value="">Select…</option>
                    <option value="english">English</option>
                    <option value="spanish">Spanish</option>
                    <option value="french">French</option>
                    <option value="mandarin">Mandarin</option>
                    <option value="arabic">Arabic</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                  <label>Street Address</label>
                  <input v-model="previewSimple.addressStreet" type="text" placeholder="123 Main St" />
                </div>
                <div class="form-group">
                  <label>Apt / Unit (optional)</label>
                  <input v-model="previewSimple.addressApt" type="text" placeholder="Apt 4B" />
                </div>
                <div class="form-group">
                  <label>Zip Code</label>
                  <input v-model="previewSimple.addressZip" type="text" placeholder="80903" maxlength="10" />
                </div>
                <div class="form-group">
                  <label>City</label>
                  <input v-model="previewSimple.addressCity" type="text" placeholder="Colorado Springs" />
                </div>
                <div class="form-group">
                  <label>State</label>
                  <input v-model="previewSimple.addressState" type="text" placeholder="CO" maxlength="2" style="max-width:80px;" />
                </div>
              </div>
            </div>

            <!-- Clinical Questions -->
            <div v-else-if="selectedAddOnPreviewId === 'clinical_questions'" class="addon-preview-form">
              <p class="muted" style="margin-bottom: 16px; font-size: 13px;">
                The following questions help your provider understand your needs. Your answers are confidential and only visible to your assigned provider.
              </p>
              <div class="form-group">
                <label>Primary concern or reason for seeking services <span class="required-indicator">*</span></label>
                <textarea v-model="previewSimple.clinicalConcern" rows="3" placeholder="Describe your primary concern…" />
              </div>
              <div class="form-group">
                <label>Current medications (if any)</label>
                <input v-model="previewSimple.clinicalMeds" type="text" placeholder="e.g. None, or list medications" />
              </div>
              <div class="form-group">
                <label>Have you received mental health services before?</label>
                <div class="radio-group">
                  <label class="radio-row"><input v-model="previewSimple.clinicalPrior" type="radio" value="yes" name="preview_cq_prior" /> <span>Yes</span></label>
                  <label class="radio-row"><input v-model="previewSimple.clinicalPrior" type="radio" value="no" name="preview_cq_prior" /> <span>No</span></label>
                </div>
              </div>
              <div class="form-group">
                <label>Emergency contact name <span class="required-indicator">*</span></label>
                <input v-model="previewSimple.clinicalEmergencyName" type="text" placeholder="Full name" />
              </div>
              <div class="form-group">
                <label>Emergency contact phone <span class="required-indicator">*</span></label>
                <input v-model="previewSimple.clinicalEmergencyPhone" type="tel" placeholder="(555) 555-0101" />
              </div>
            </div>

            <!-- Fallback for questions, question_set, registration, document, school_roi, upload, references -->
            <div v-else class="addon-preview-form">
              <div class="form-group">
                <label>{{ previewSimpleConfig.a }}</label>
                <input v-model="previewSimple.textA" type="text" placeholder="Type here..." />
              </div>
              <div class="form-group">
                <label>{{ previewSimpleConfig.b }}</label>
                <input v-model="previewSimple.textB" type="text" placeholder="Type here..." />
              </div>
              <div class="form-group">
                <label>{{ previewSimpleConfig.c }}</label>
                <textarea v-model="previewSimple.textC" rows="3" placeholder="Type here..." />
              </div>
              <div class="form-group">
                <label class="checkbox">
                  <input v-model="previewSimple.checkA" type="checkbox" />
                  {{ previewSimpleConfig.check }}
                </label>
              </div>
              <div class="form-group">
                <label>{{ previewSimpleConfig.select }}</label>
                <select v-model="previewSimple.selectA">
                  <option value="">Select…</option>
                  <option value="option_1">Option 1</option>
                  <option value="option_2">Option 2</option>
                </select>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Question Set Picker Modal — teleported to body to escape any parent stacking context -->
  <Teleport to="body">
  <div v-if="showQSetPicker" class="modal-backdrop qset-backdrop" @click.self="showQSetPicker = false">
    <div class="modal-box qset-modal-box" style="max-width:480px;">
      <div class="modal-header">
        <h3 style="margin:0;">Insert a Question Set</h3>
        <button class="btn btn-xs btn-secondary" type="button" @click="showQSetPicker = false">✕</button>
      </div>
      <div class="modal-body" style="padding:16px;">
        <p class="muted" style="margin-top:0;">Choose a question set to insert as a new Questions step in the form. <strong>Remember to save the form after inserting.</strong></p>
        <div v-if="!questionSets.length" class="muted">No question sets saved yet. Create one using the "Question Sets" button above.</div>
        <div v-for="qs in questionSets" :key="qs.id" class="question-set-picker-row">
          <div>
            <strong>{{ qs.name || 'Unnamed Set' }}</strong>
            <span class="muted" style="margin-left:6px;">{{ qs.fields.length }} question{{ qs.fields.length === 1 ? '' : 's' }}</span>
            <div class="muted" style="font-size:0.8em;margin-top:2px;">
              {{ qs.fields.map((f) => f.label || f.key).filter(Boolean).slice(0, 4).join(', ') }}{{ qs.fields.length > 4 ? '…' : '' }}
            </div>
          </div>
          <button class="btn btn-sm btn-primary" type="button" @click="insertQuestionSet(qs)">Insert</button>
        </div>
        </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { buildPublicIntakeUrl, buildFormUrl } from '../../utils/publicIntakeUrl';
import PublicIntakeGuardianWaiverStep from '../../components/public-intake/PublicIntakeGuardianWaiverStep.vue';
import PublicIntakeInsuranceStep from '../../components/public-intake/PublicIntakeInsuranceStep.vue';
import PublicIntakePaymentStep from '../../components/public-intake/PublicIntakePaymentStep.vue';

/** Stored on the intake link customMessages when the admin picks the built-in parent/class registration email preset. */
const COMPLETION_EMAIL_PRESET_GUARDIAN_PARTNERSHIP = 'guardian_partnership';
const props = defineProps({
  /** When set (e.g. Settings tenant hub), lock digital forms to this agency id. */
  scopedAgencyId: { type: Number, default: null }
});

const route = useRoute();
const router = useRouter();

const lockAgencyPicker = computed(() => {
  const id = Number(props.scopedAgencyId || 0);
  return Number.isFinite(id) && id > 0;
});

const loading = ref(false);
const error = ref('');
const links = ref([]);
const templates = ref([]);
const emailTemplates = ref([]);
const organizations = ref([]);
const fieldTemplates = ref([]);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const editingId = ref(null);
const autosaveTimer = ref(null);
const lastAutosaveAt = ref(null);
const showAddOnPreviewModal = ref(false);
const selectedAddOnPreviewId = ref('');

const form = reactive({
  title: '',
  description: '',
  languageCode: 'en',
  formType: 'intake',
  scopeType: 'school',
  organizationId: null,
  programId: null,
  companyEventId: null,
  jobDescriptionId: null,
  requiresAssignment: true,
  isActive: true,
  createClient: true,
  createGuardian: true,
  retentionPolicy: {
    mode: 'inherit',
    days: 14
  },
  customMessages: {
    beginSubtitle: '',
    formTimeLimit: '',
    completionEmailTemplateId: null,
    completionEmailPreset: null,
    completionEmailTemplateType: 'school_full_intake_packet_default',
    completionEmailSubject: '',
    completionEmailBody: ''
  },
  allowAllDocuments: false,
  allowedDocumentTemplateIds: [],
  intakeFieldsText: '',
  intakeSteps: []
});

const formHasRegistrationStep = computed(() =>
  (Array.isArray(form.intakeSteps) ? form.intakeSteps : []).some(
    (s) => String(s?.type || '').trim().toLowerCase() === 'registration'
  )
);
/** Smart Registration, or Intake that includes a Registration step (full paperwork + event enrollment). */
const registrationFlowAdmin = computed(
  () => form.formType === 'smart_registration' || (form.formType === 'intake' && formHasRegistrationStep.value)
);

const addOnPreviewItems = computed(() => ([
  { id: 'questions', label: '+ Add Questions', description: 'Participant-facing question step preview.' },
  { id: 'question_set', label: '+ Add Question Set', description: 'Participant-facing question set preview.' },
  { id: 'registration', label: '+ Add Registration', description: 'Participant-facing registration selection preview.' },
  { id: 'document', label: '+ Add Document', description: 'Participant-facing signature/acknowledgement preview.' },
  { id: 'school_roi', label: '+ Add School ROI', description: 'Participant-facing school ROI preview.' },
  { id: 'upload', label: '+ Add Upload', description: 'Participant-facing file upload preview.' },
  { id: 'references', label: '+ Add References', description: 'Participant-facing references preview.' },
  { id: 'guardian_waiver', label: '+ Add Guardian waivers', description: 'Participant-facing guardian waiver preview.' },
  { id: 'insurance_info', label: '+ Add Insurance info', description: 'Participant-facing insurance preview.' },
  { id: 'payment_collection', label: '+ Add Payment collection', description: 'Participant-facing payment preview.' },
  { id: 'communications', label: '+ Add Communications', description: 'Participant-facing communications preview (all campaigns).' },
  { id: 'demographics', label: '+ Add Demographics', description: 'Participant-facing demographics preview.' },
  { id: 'clinical_questions', label: '+ Add Clinical Questions', description: 'Participant-facing clinical questions preview.' }
]));
const selectedAddOnPreview = computed(() =>
  addOnPreviewItems.value.find((item) => item.id === selectedAddOnPreviewId.value) || null
);
const previewCommunications = reactive({
  emailPreference: 'all',
  smsPreference: 'scheduling_only',
  providerTextingOptIn: 'yes',
  programUpdatesOptIn: 'yes',
  internalWorkforceOptIn: 'yes'
});
const previewInsurance = ref({});
const previewPayment = ref({});
const previewGuardianWaivers = reactive({
  clients: [{ sections: {} }]
});
const previewSimple = reactive({
  textA: '',
  textB: '',
  textC: '',
  checkA: false,
  selectA: '',
  // demographics
  dob: '',
  gender: '',
  ethnicity: '',
  preferredLanguage: '',
  addressStreet: '',
  addressApt: '',
  addressZip: '',
  addressCity: '',
  addressState: '',
  // clinical
  clinicalConcern: '',
  clinicalMeds: '',
  clinicalPrior: '',
  clinicalEmergencyName: '',
  clinicalEmergencyPhone: ''
});
const previewSimpleConfig = computed(() => {
  const map = {
    questions: {
      a: 'Question 1',
      b: 'Question 2',
      c: 'Additional notes',
      check: 'Required acknowledgment',
      select: 'Response type'
    },
    question_set: {
      a: 'Question set item 1',
      b: 'Question set item 2',
      c: 'Notes',
      check: 'I confirm these answers',
      select: 'Choose one'
    },
    registration: {
      a: 'Preferred session',
      b: 'Lookup value (email/phone/client ID)',
      c: 'Scheduling notes',
      check: 'I am already in your system',
      select: 'Participant type'
    },
    document: {
      a: 'Typed signature name',
      b: 'Signer email',
      c: 'Acknowledgement text',
      check: 'I agree and sign',
      select: 'Document choice'
    },
    school_roi: {
      a: 'School name',
      b: 'District',
      c: 'Release details',
      check: 'I authorize release of information',
      select: 'Release period'
    },
    upload: {
      a: 'File title',
      b: 'File description',
      c: 'Notes for reviewer',
      check: 'I confirm this file is correct',
      select: 'File category'
    },
    references: {
      a: 'Reference full name',
      b: 'Reference phone/email',
      c: 'Relationship and notes',
      check: 'Reference consent obtained',
      select: 'Reference type'
    },
    demographics: {
      a: 'Preferred language',
      b: 'Gender identity',
      c: 'Address / demographic notes',
      check: 'I confirm demographic details are accurate',
      select: 'Race/ethnicity selection'
    },
    clinical_questions: {
      a: 'Primary concern',
      b: 'Current medications',
      c: 'Clinical history notes',
      check: 'I confirm clinical information is accurate',
      select: 'Symptom severity'
    }
  };
  return map[selectedAddOnPreviewId.value] || map.questions;
});
const setPreviewInsurance = (v) => {
  previewInsurance.value = v && typeof v === 'object' ? v : {};
};
const setPreviewPayment = (v) => {
  previewPayment.value = v && typeof v === 'object' ? v : {};
};

const quickScope = ref('school');
const quickOrganizationId = ref(null);
const quickTitle = ref('');
const quickLanguageCode = ref('en');
const quickError = ref('');

const selectedAgencyId = ref(null);
const fieldTemplateName = ref('');
const fieldTemplateJson = ref('');

// ─── Question Sets ────────────────────────────────────────────────────────────
const showQuestionSetsPanel = ref(false);
const questionSets = ref([]);
const editingQuestionSet = ref(null);
const showQSetPicker = ref(false);
const qsetSaving = ref(false);
const qsetInsertedNotice = ref(false);

const loadQuestionSets = async () => {
  if (!selectedAgencyId.value) return;
  try {
    const r = await api.get('/intake-field-templates', {
      params: { agencyId: selectedAgencyId.value, type: 'question_set' }
    });
    questionSets.value = (Array.isArray(r.data) ? r.data : []).map((t) => ({
      id: t.id,
      name: t.name,
      fields: Array.isArray(t.fields_json) ? t.fields_json : []
    }));
  } catch {
    questionSets.value = [];
  }
};

const startNewQuestionSet = () => {
  editingQuestionSet.value = {
    id: null,
    name: '',
    fields: []
  };
};

const startEditQuestionSet = (qs) => {
  editingQuestionSet.value = JSON.parse(JSON.stringify(qs));
};

const saveQuestionSet = async () => {
  if (!editingQuestionSet.value || !selectedAgencyId.value) return;
  qsetSaving.value = true;
  try {
    const payload = {
      agencyId: selectedAgencyId.value,
      name: editingQuestionSet.value.name || 'Untitled Question Set',
      fieldsJson: editingQuestionSet.value.fields || [],
      templateType: 'question_set'
    };
    if (editingQuestionSet.value.id) {
      await api.put(`/intake-field-templates/${editingQuestionSet.value.id}`, {
        name: payload.name,
        fieldsJson: payload.fieldsJson
      });
    } else {
      await api.post('/intake-field-templates', payload);
    }
    editingQuestionSet.value = null;
    await loadQuestionSets();
  } catch (e) {
    alert('Failed to save question set: ' + (e?.response?.data?.error?.message || e.message));
  } finally {
    qsetSaving.value = false;
  }
};

const deleteQuestionSet = async (id) => {
  if (!confirm('Delete this question set? This cannot be undone.')) return;
  try {
    await api.delete(`/intake-field-templates/${id}`);
    questionSets.value = questionSets.value.filter((q) => q.id !== id);
  } catch (e) {
    alert('Failed to delete: ' + (e?.response?.data?.error?.message || e.message));
  }
};

const addQSetField = () => {
  if (!editingQuestionSet.value) return;
  editingQuestionSet.value.fields.push({
    id: createId('field'),
    key: '',
    label: '',
    type: 'text',
    required: false,
    helperText: '',
    scope: 'self',
    visibility: 'always',
    showIf: { fieldKey: '', equals: '' },
    options: []
  });
};

const addQSetFieldAfter = (idx) => {
  if (!editingQuestionSet.value) return;
  editingQuestionSet.value.fields.splice(idx + 1, 0, {
    id: createId('field'),
    key: '',
    label: '',
    type: 'text',
    required: false,
    helperText: '',
    scope: 'self',
    visibility: 'always',
    showIf: { fieldKey: '', equals: '' },
    options: []
  });
};

const removeQSetField = (idx) => {
  if (!editingQuestionSet.value) return;
  editingQuestionSet.value.fields.splice(idx, 1);
};

const moveQSetField = (idx, dir) => {
  if (!editingQuestionSet.value) return;
  const fields = editingQuestionSet.value.fields;
  const next = idx + dir;
  if (next < 0 || next >= fields.length) return;
  const copy = [...fields];
  const [moved] = copy.splice(idx, 1);
  copy.splice(next, 0, moved);
  editingQuestionSet.value.fields = copy;
};

const getQSetConditionalTargets = (idx) => {
  if (!editingQuestionSet.value) return [];
  return editingQuestionSet.value.fields
    .filter((f, fIdx) => f && typeof f === 'object' && fIdx !== idx && f.key)
    .map((f) => ({ key: f.key, label: f.label }));
};

const openQSetPicker = () => {
  showQSetPicker.value = true;
};

const openAddOnPreviewModal = () => {
  selectedAddOnPreviewId.value = '';
  showAddOnPreviewModal.value = true;
};

const closeAddOnPreviewModal = () => {
  showAddOnPreviewModal.value = false;
  selectedAddOnPreviewId.value = '';
};

const openAddOnPreview = (id) => {
  selectedAddOnPreviewId.value = String(id || '').trim();
};

const backToAddOnList = () => {
  selectedAddOnPreviewId.value = '';
};

const insertQuestionSet = (qs) => {
  const clonedFields = JSON.parse(JSON.stringify(qs.fields)).map((f) => ({
    ...f,
    id: createId('field')
  }));
  const step = {
    id: createId('step'),
    type: 'questions',
    fields: clonedFields,
    visibility: 'always',
    label: qs.name || ''
  };
  form.intakeSteps.push(step);
  showQSetPicker.value = false;
  qsetInsertedNotice.value = true;
  setTimeout(() => { qsetInsertedNotice.value = false; }, 6000);
};
// ─────────────────────────────────────────────────────────────────────────────
const openDocumentStepSelectId = ref(null);
const documentStepFilter = ref('');
const documentStepSelectRef = ref(null);
const documentStepFilterInputRef = ref(null);
const jobDescriptionsForForm = ref([]);
const learningClassesByOrganization = ref({});
const loadingLearningClassesForOrganization = reactive({});
const classDetailsById = ref({});
const shiftProgramsByAgencyId = ref({});
/** API error per agency (e.g. shift programs feature off) — empty list alone was silent. */
const shiftProgramsErrorByAgencyId = reactive({});
const loadingShiftProgramsByAgency = reactive({});
const shiftProgramDetailsById = ref({});
const loadingShiftProgramDetailsById = reactive({});
const shiftSlotsBySiteId = ref({});
const loadingShiftSlotsBySite = reactive({});

/** Agency used to load company events for optional `company_event_id` on smart_registration links. */
const companyEventsPickerAgencyId = ref(null);
const companyEventsPickerOptions = ref([]);
const companyEventsPickerLoading = ref(false);
const companyEventsPickerFilteredOptions = computed(() => {
  const all = Array.isArray(companyEventsPickerOptions.value) ? companyEventsPickerOptions.value : [];
  const scope = String(form.scopeType || '').toLowerCase();
  const orgId = Number(form.organizationId || 0) || null;
  if (!orgId || scope === 'agency') return all;
  // Program/school forms: show events tied to this org, plus agency-wide calendar rows
  // (organization_id null) — those are common when events are created without picking a program.
  return all.filter((ev) => {
    const evOrg = Number(ev.organizationId || 0) || null;
    if (!evOrg) return true;
    return evOrg === orgId;
  });
});

const organizationsForScope = computed(() => {
  const type = form.scopeType;
  if (type === 'school') return organizations.value.filter((o) => o.organization_type === 'school');
  if (type === 'program') {
    return organizations.value.filter((o) => {
      const orgType = String(o?.organization_type || '').toLowerCase();
      return ['program', 'learning', 'affiliation'].includes(orgType);
    });
  }
  return organizations.value;
});

const organizationsForQuickScope = computed(() => {
  if (quickScope.value === 'school') return organizations.value.filter((o) => o.organization_type === 'school');
  if (quickScope.value === 'program') return organizations.value.filter((o) => o.organization_type === 'program');
  return agencyList.value;
});

const agencyList = computed(() => {
  const base = organizations.value.filter((o) => String(o.organization_type || 'agency') === 'agency');
  const sid = Number(props.scopedAgencyId || 0);
  if (Number.isFinite(sid) && sid > 0) {
    const only = base.filter((o) => Number(o.id) === sid);
    return only.length ? only : base;
  }
  return base;
});
const organizationLookup = computed(() => {
  const map = new Map();
  for (const org of organizations.value) {
    map.set(Number(org.id), org);
  }
  return map;
});
const completionEmailTemplateOptions = computed(() =>
  (Array.isArray(emailTemplates.value) ? emailTemplates.value : [])
    .filter((t) => t && t.id)
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }))
);
const selectedCompletionEmailTemplate = computed(() =>
  completionEmailTemplateOptions.value.find((t) => Number(t.id) === Number(form.customMessages?.completionEmailTemplateId || 0)) || null
);
const completionEmailDropdownValue = computed(() => {
  const id = Number(form.customMessages?.completionEmailTemplateId || 0);
  if (id) return `template:${id}`;
  if (form.customMessages?.completionEmailPreset === COMPLETION_EMAIL_PRESET_GUARDIAN_PARTNERSHIP) {
    return 'preset:guardian_partnership';
  }
  return '';
});
const programOrganizations = computed(() =>
  organizations.value
    .filter((o) => String(o?.organization_type || '').toLowerCase() === 'program')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }))
);
const learningOrganizations = computed(() =>
  organizations.value
    .filter((o) => String(o?.organization_type || '').toLowerCase() === 'learning')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }))
);

const getStepTypeLabel = (t) => {
  const m = {
    questions: 'Questions',
    registration: 'Registration',
    document: 'Document',
    school_roi: 'School ROI (Programmed)',
    upload: 'Upload',
    references: 'Professional references',
    guardian_waiver: 'Guardian waivers & safety',
    insurance_info: 'Insurance information',
    payment_collection: 'Payment collection',
    communications: 'Communication preferences',
    demographics: 'Demographics',
    clinical_questions: 'Clinical Questions'
  };
  return m[t] || t || 'Step';
};

const guardianWaiverSectionOptions = [
  { value: 'pickup_authorization', label: 'Pickup authorization' },
  { value: 'emergency_contacts', label: 'Emergency contacts' },
  { value: 'allergies_snacks', label: 'Allergies & snacks (always recommended)' },
  { value: 'meal_preferences', label: 'Meal preferences (only if event provides meals)' }
];
const getFormTypeLabel = (t) => {
  const m = {
    intake: 'Intake',
    public_form: 'Public Form',
    smart_school_roi: 'Smart School ROI',
    smart_registration: 'Smart Registration',
    job_application: 'Job Application',
    medical_records_request: 'Medical Records',
    internal_preferences: 'Internal Preferences'
  };
  return m[t] || t || 'Intake';
};
const getScopeTypeLabel = (t) => {
  const m = { agency: 'Agency', school: 'School', program: 'Program / Learning', learning_class: 'Program / Learning' };
  return m[t] || t || '—';
};

const normalizeScopeType = (value) => {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'learning_class') return 'program';
  if (['agency', 'school', 'program'].includes(s)) return s;
  return 'school';
};
const getFormTypeBadgeClass = (t) => {
  if (t === 'public_form') return 'badge-info';
  if (t === 'smart_school_roi') return 'badge-primary';
  if (t === 'smart_registration') return 'badge-info';
  if (t === 'job_application') return 'badge-success';
  if (t === 'medical_records_request') return 'badge-warning';
  if (t === 'internal_preferences') return 'badge-purple';
  return 'badge-secondary';
};
const getLanguageLabel = (code) => {
  const lang = String(code || '').toLowerCase();
  if (lang === 'es' || lang.startsWith('es')) return 'Spanish';
  if (lang === 'en' || lang.startsWith('en')) return 'English';
  return lang ? lang.toUpperCase() : 'English';
};

const fetchJobDescriptions = async () => {
  if (!form.organizationId) {
    jobDescriptionsForForm.value = [];
    return;
  }
  try {
    const r = await api.get('/hiring/job-descriptions', { params: { agencyId: form.organizationId } });
    jobDescriptionsForForm.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    jobDescriptionsForForm.value = [];
  }
};

const formatCompanyEventPickerLabel = (e) => {
  const raw = e?.startsAt || e?.starts_at;
  if (!raw) return '—';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
};

const fetchCompanyEventsForPicker = async () => {
  const aid = Number(companyEventsPickerAgencyId.value || 0) || null;
  if (!aid) {
    companyEventsPickerOptions.value = [];
    return;
  }
  companyEventsPickerLoading.value = true;
  try {
    const r = await api.get(`/agencies/${aid}/company-events`);
    const list = Array.isArray(r.data) ? r.data : [];
    companyEventsPickerOptions.value = list
      .filter((ev) => ev && ev.id)
      .map((ev) => ({
        id: Number(ev.id),
        title: String(ev.title || '').trim(),
        startsAt: ev.startsAt || ev.starts_at || null,
        organizationId: Number(ev.organizationId ?? ev.organization_id ?? 0) || null
      }));
  } catch {
    companyEventsPickerOptions.value = [];
  } finally {
    companyEventsPickerLoading.value = false;
  }
};

/** Resolve which agency owns the event so the picker can load options when editing. */
const hydrateCompanyEventPickerForEdit = async (companyEventId) => {
  const cid = companyEventId ? Number(companyEventId) : null;
  if (!cid) {
    if (!companyEventsPickerAgencyId.value && agencyList.value[0]?.id) {
      companyEventsPickerAgencyId.value = agencyList.value[0].id;
    }
    await fetchCompanyEventsForPicker();
    return;
  }
  let foundAgencyId = null;
  for (const a of agencyList.value) {
    try {
      const r = await api.get(`/agencies/${a.id}/company-events`);
      const list = Array.isArray(r.data) ? r.data : [];
      if (list.some((ev) => Number(ev.id) === cid)) {
        foundAgencyId = a.id;
        break;
      }
    } catch {
      /* try next agency */
    }
  }
  companyEventsPickerAgencyId.value =
    foundAgencyId || companyEventsPickerAgencyId.value || agencyList.value[0]?.id || null;
  await fetchCompanyEventsForPicker();
};

watch(registrationFlowAdmin, (on) => {
  if (!on) return;
  if (!companyEventsPickerAgencyId.value && agencyList.value[0]?.id) {
    companyEventsPickerAgencyId.value = agencyList.value[0].id;
    void fetchCompanyEventsForPicker();
  }
});

watch(
  () => [form.scopeType, form.organizationId, companyEventsPickerOptions.value.length],
  () => {
    const currentEventId = Number(form.companyEventId || 0) || null;
    if (!currentEventId) return;
    const exists = companyEventsPickerFilteredOptions.value.some((ev) => Number(ev.id) === currentEventId);
    if (!exists) {
      form.companyEventId = null;
    }
  }
);

const resetForm = () => {
  form.title = '';
  form.description = '';
  form.languageCode = 'en';
  form.formType = 'intake';
  form.scopeType = 'school';
  form.organizationId = null;
  form.programId = null;
  form.companyEventId = null;
  form.jobDescriptionId = null;
  form.requiresAssignment = true;
  form.isActive = true;
  form.createClient = true;
  form.createGuardian = true;
  form.retentionPolicy = { mode: 'inherit', days: 14 };
  form.customMessages = {
    beginSubtitle: '',
    formTimeLimit: '',
    completionEmailTemplateId: null,
    completionEmailPreset: null,
    completionEmailTemplateType: 'school_full_intake_packet_default',
    completionEmailSubject: '',
    completionEmailBody: ''
  };
  form.allowAllDocuments = false;
  form.allowedDocumentTemplateIds = [];
  form.intakeFieldsText = '';
  form.intakeSteps = [];
  formError.value = '';
  editingId.value = null;
  companyEventsPickerAgencyId.value = null;
  companyEventsPickerOptions.value = [];
  companyEventsPickerLoading.value = false;
};

const draftStorageKey = computed(() =>
  editingId.value ? `intake-link-draft:${editingId.value}` : 'intake-link-draft:new'
);

const serializeDraft = () => ({
  savedAt: Date.now(),
  form: {
    title: form.title,
    description: form.description,
    languageCode: form.languageCode,
    formType: form.formType,
    scopeType: form.scopeType,
    organizationId: form.organizationId,
    programId: form.programId,
    companyEventId: form.companyEventId,
    jobDescriptionId: form.jobDescriptionId,
    requiresAssignment: form.requiresAssignment,
    isActive: form.isActive,
    createClient: form.createClient,
    createGuardian: form.createGuardian,
    retentionPolicy: form.retentionPolicy ? { ...form.retentionPolicy } : null,
    customMessages: form.customMessages ? { ...form.customMessages } : {
      beginSubtitle: '',
      formTimeLimit: '',
      completionEmailTemplateId: null,
      completionEmailPreset: null,
      completionEmailTemplateType: 'school_full_intake_packet_default',
      completionEmailSubject: '',
      completionEmailBody: ''
    },
    allowAllDocuments: form.allowAllDocuments,
    allowedDocumentTemplateIds: Array.isArray(form.allowedDocumentTemplateIds)
      ? [...form.allowedDocumentTemplateIds]
      : [],
    intakeFieldsText: form.intakeFieldsText,
    intakeSteps: Array.isArray(form.intakeSteps) ? JSON.parse(JSON.stringify(form.intakeSteps)) : []
  }
});

const saveDraft = () => {
  if (!showForm.value) return;
  try {
    const payload = serializeDraft();
    localStorage.setItem(draftStorageKey.value, JSON.stringify(payload));
    lastAutosaveAt.value = payload.savedAt;
  } catch {
    // ignore storage errors
  }
};

const applyDraft = (draft) => {
  const data = draft?.form;
  if (!data) return;
  form.title = data.title ?? '';
  form.description = data.description ?? '';
  form.languageCode = data.languageCode || 'en';
  form.formType = data.formType || 'intake';
  form.scopeType = normalizeScopeType(data.scopeType || 'school');
  form.organizationId = data.organizationId ?? null;
  form.programId = data.programId ?? null;
  form.companyEventId = data.companyEventId ?? null;
  form.jobDescriptionId = data.jobDescriptionId ?? null;
  form.requiresAssignment = data.requiresAssignment ?? true;
  form.isActive = data.isActive ?? true;
  form.createClient = data.createClient ?? true;
  form.createGuardian = data.createGuardian ?? true;
  form.retentionPolicy = data.retentionPolicy
    ? { mode: data.retentionPolicy.mode || 'inherit', days: data.retentionPolicy.days ?? 14 }
    : { mode: 'inherit', days: 14 };
  form.customMessages = data.customMessages
    ? {
        beginSubtitle: data.customMessages.beginSubtitle ?? '',
        formTimeLimit: data.customMessages.formTimeLimit ?? '',
        completionEmailTemplateId: data.customMessages.completionEmailTemplateId ?? null,
        completionEmailPreset: data.customMessages.completionEmailPreset ?? null,
        completionEmailTemplateType: data.customMessages.completionEmailTemplateType ?? 'school_full_intake_packet_default',
        completionEmailSubject: data.customMessages.completionEmailSubject ?? '',
        completionEmailBody: data.customMessages.completionEmailBody ?? ''
      }
    : {
        beginSubtitle: '',
        formTimeLimit: '',
        completionEmailTemplateId: null,
        completionEmailPreset: null,
        completionEmailTemplateType: 'school_full_intake_packet_default',
        completionEmailSubject: '',
        completionEmailBody: ''
      };
  form.allowAllDocuments = data.allowAllDocuments ?? false;
  form.allowedDocumentTemplateIds = Array.isArray(data.allowedDocumentTemplateIds)
    ? data.allowedDocumentTemplateIds
    : [];
  form.intakeFieldsText = data.intakeFieldsText || '';
  form.intakeSteps = sanitizeSteps(Array.isArray(data.intakeSteps) ? data.intakeSteps : [], {
    formType: data.formType ?? form.formType
  });
  form.intakeSteps.forEach((step) => {
    if (step?.type !== 'registration') return;
    if (step.sourceType === 'class') {
      const orgId = Number(step?.sourceConfig?.learningOrganizationId || 0) || null;
      if (orgId) {
        loadLearningClassesForOrganization(orgId).then(() => {
          refreshRegistrationStepOptions(step);
          hydrateSelectedClassDetails(step);
        });
      }
    } else if (step.sourceType === 'program_event') {
      const agencyId = Number(step?.sourceConfig?.programEventAgencyId || 0) || null;
      const programId = Number(step?.sourceConfig?.programEventProgramId || 0) || null;
      const siteId = Number(step?.sourceConfig?.programEventSiteId || 0) || null;
      if (agencyId) {
        loadShiftProgramsForAgency(agencyId).then(async () => {
          if (programId) {
            await loadShiftProgramDetail(programId);
            if (siteId) {
              await loadShiftSlotsForSite(programId, siteId);
            }
          }
          refreshRegistrationStepOptions(step);
        });
      }
    } else {
      refreshRegistrationStepOptions(step);
    }
  });
};

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(draftStorageKey.value);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.form) return;
    applyDraft(parsed);
  } catch {
    // ignore bad drafts
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(draftStorageKey.value);
  } catch {
    // ignore
  }
};

const fetchData = async () => {
  try {
    loading.value = true;
    const sid = Number(props.scopedAgencyId || 0);
    const scopedLinks =
      Number.isFinite(sid) && sid > 0
        ? api.get('/intake-links', { params: { scopeType: 'agency', organizationId: sid } })
        : api.get('/intake-links');
    const [linksResp, templatesResp, emailTemplatesResp, orgsResp] = await Promise.all([
      scopedLinks,
      api.get('/document-templates', { params: { limit: 1000 } }),
      api.get('/email-templates'),
      api.get('/agencies')
    ]);
    links.value = linksResp.data || [];
    const rawTemplates =
      templatesResp.data?.data
      || templatesResp.data?.templates
      || templatesResp.data
      || [];
    templates.value = Array.isArray(rawTemplates) ? rawTemplates : [];
    emailTemplates.value = Array.isArray(emailTemplatesResp.data) ? emailTemplatesResp.data : [];
    organizations.value = Array.isArray(orgsResp.data) ? orgsResp.data : [];
    if (Number.isFinite(sid) && sid > 0) {
      selectedAgencyId.value = sid;
    } else {
      const primaryAgency = agencyList.value[0]?.id || null;
      selectedAgencyId.value = selectedAgencyId.value || primaryAgency;
    }
    if (selectedAgencyId.value) {
      const r = await api.get('/intake-field-templates', { params: { agencyId: selectedAgencyId.value } });
      fieldTemplates.value = r.data || [];
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load digital forms';
  } finally {
    loading.value = false;
  }
};

watch(selectedAgencyId, async (next) => {
  if (!next) return;
  const r = await api.get('/intake-field-templates', { params: { agencyId: next } });
  fieldTemplates.value = r.data || [];
  await loadQuestionSets();
});

watch(
  () => props.scopedAgencyId,
  () => {
    fetchData();
  }
);

watch(() => form.formType, (newVal) => {
  if (newVal === 'job_application') {
    form.createClient = false;
    form.createGuardian = false;
  }
  if (newVal === 'smart_registration') {
    // Smart Registration is always agency-scoped (tied to a company event).
    form.scopeType = 'agency';
    form.createClient = true;
    form.createGuardian = true;
    form.requiresAssignment = false;
    (form.intakeSteps || []).forEach((s) => {
      if (s?.type === 'registration') s.visibility = 'always';
    });
  }
  if (newVal === 'smart_school_roi') {
    form.scopeType = 'school';
    form.createClient = false;
    form.createGuardian = false;
    form.requiresAssignment = false;
  }
});

watch(formHasRegistrationStep, (has) => {
  if (!has || form.formType !== 'intake') return;
  (form.intakeSteps || []).forEach((s) => {
    if (s?.type === 'registration') s.visibility = 'always';
  });
});

watch(showForm, (open) => {
  if (open) {
    loadDraft();
    if (autosaveTimer.value) clearInterval(autosaveTimer.value);
    autosaveTimer.value = setInterval(saveDraft, 20000);
  } else if (autosaveTimer.value) {
    clearInterval(autosaveTimer.value);
    autosaveTimer.value = null;
  }
});

const handleBeforeUnload = () => {
  if (showForm.value) saveDraft();
};

const handleDocumentClick = (e) => {
  if (openDocumentStepSelectId.value && documentStepSelectRef.value && !documentStepSelectRef.value.contains(e.target)) {
    closeDocumentStepSelect();
  }
};

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
});

watch(openDocumentStepSelectId, (open) => {
  if (open) {
    nextTick(() => document.addEventListener('click', handleDocumentClick));
  } else {
    document.removeEventListener('click', handleDocumentClick);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  document.removeEventListener('click', handleDocumentClick);
  if (autosaveTimer.value) {
    clearInterval(autosaveTimer.value);
    autosaveTimer.value = null;
  }
});

const openCreate = () => {
  resetForm();
  if (lockAgencyPicker.value) {
    const id = Number(props.scopedAgencyId || 0);
    form.scopeType = 'agency';
    form.organizationId = id;
    companyEventsPickerAgencyId.value = id;
  }
  applyDefaultCompletionEmailCopy();
  showForm.value = true;
};

const duplicateLink = async (link) => {
  try {
    const resp = await api.post(`/intake-links/${link.id}/duplicate`);
    const newLink = resp.data?.link;
    if (newLink) {
      links.value = [newLink, ...links.value];
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to duplicate form';
  }
};

const deleteLink = async (link) => {
  if (!link?.is_active) return;
  if (!window.confirm(`Deactivate "${link.title || `Link ${link.id}`}"? The form will no longer accept submissions and will be removed from use.`)) return;
  try {
    const resp = await api.delete(`/intake-links/${link.id}`);
    const updated = resp.data?.link;
    if (updated) {
      const idx = links.value.findIndex((l) => l.id === link.id);
      if (idx >= 0) links.value[idx] = updated;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete form';
  }
};

const editLink = (link) => {
  resetForm();
  editingId.value = link.id;
  form.title = link.title || '';
  form.description = link.description || '';
  form.languageCode = link.language_code || 'en';
  form.formType = link.form_type || 'intake';
  form.scopeType = normalizeScopeType(link.scope_type || 'school');
  form.organizationId = link.organization_id || null;
  form.programId = link.program_id || null;
  form.companyEventId = link.company_event_id ? Number(link.company_event_id) : null;
  form.jobDescriptionId = link.job_description_id || null;
  form.requiresAssignment = link.requires_assignment !== false;
  form.isActive = !!link.is_active;
  form.createClient = !!link.create_client;
  form.createGuardian = !!link.create_guardian;
  form.retentionPolicy = (() => {
    const raw = link.retention_policy_json || null;
    if (!raw || typeof raw !== 'object') return { mode: 'inherit', days: 14 };
    const mode = ['inherit', 'days', 'never'].includes(String(raw.mode || '').toLowerCase())
      ? String(raw.mode || 'inherit').toLowerCase()
      : 'inherit';
    const days = Number.isFinite(Number(raw.days)) ? Number(raw.days) : 14;
    return { mode, days };
  })();
  form.allowAllDocuments = false;
  form.allowedDocumentTemplateIds = link.allowed_document_template_ids || [];
  form.customMessages = link.custom_messages
    ? {
        beginSubtitle: link.custom_messages.beginSubtitle ?? '',
        formTimeLimit: link.custom_messages.formTimeLimit ?? '',
        completionEmailTemplateId: link.custom_messages.completionEmailTemplateId ?? null,
        completionEmailPreset: link.custom_messages.completionEmailPreset ?? null,
        completionEmailTemplateType: link.custom_messages.completionEmailTemplateType ?? 'school_full_intake_packet_default',
        completionEmailSubject: link.custom_messages.completionEmailSubject ?? '',
        completionEmailBody: link.custom_messages.completionEmailBody ?? ''
      }
    : {
        beginSubtitle: '',
        formTimeLimit: '',
        completionEmailTemplateId: null,
        completionEmailPreset: null,
        completionEmailTemplateType: 'school_full_intake_packet_default',
        completionEmailSubject: '',
        completionEmailBody: ''
      };
  form.intakeFieldsText = link.intake_fields ? JSON.stringify(link.intake_fields, null, 2) : '';
  form.intakeSteps = normalizeIntakeSteps(link);
  form.intakeSteps.forEach((step) => {
    if (step?.type === 'registration' && step?.sourceType === 'class') {
      const orgId = Number(step?.sourceConfig?.learningOrganizationId || 0) || null;
      if (orgId) {
        loadLearningClassesForOrganization(orgId).then(() => {
          refreshRegistrationStepOptions(step);
          hydrateSelectedClassDetails(step);
        });
      }
    } else if (step?.type === 'registration' && step?.sourceType === 'program_event') {
      const agencyId = Number(step?.sourceConfig?.programEventAgencyId || 0) || null;
      const programId = Number(step?.sourceConfig?.programEventProgramId || 0) || null;
      const siteId = Number(step?.sourceConfig?.programEventSiteId || 0) || null;
      if (agencyId) {
        loadShiftProgramsForAgency(agencyId).then(async () => {
          if (programId) {
            await loadShiftProgramDetail(programId);
            if (siteId) {
              await loadShiftSlotsForSite(programId, siteId);
            }
          }
          refreshRegistrationStepOptions(step);
        });
      }
    } else if (step?.type === 'registration') {
      refreshRegistrationStepOptions(step);
    }
  });
  showForm.value = true;
  if (form.formType === 'job_application' && form.organizationId) {
    fetchJobDescriptions();
  }
  void nextTick(() => {
    if (registrationFlowAdmin.value) {
      void hydrateCompanyEventPickerForEdit(link.company_event_id || null);
    }
  });
};

const clearEditorQueryParams = async () => {
  const q = { ...(route.query || {}) };
  let changed = false;
  ['editIntakeLinkId', 'editId', 'jobDescriptionId', 'source', 'companyEventId', 'formType'].forEach((key) => {
    if (key in q) {
      delete q[key];
      changed = true;
    }
  });
  if (!changed) return;
  try {
    await router.replace({ query: q });
  } catch {
    // ignore replace failures
  }
};

const clearCompanyEventEnrollmentQueryParams = async () => {
  const q = { ...(route.query || {}) };
  let changed = false;
  ['companyEventId', 'formType'].forEach((key) => {
    if (key in q) {
      delete q[key];
      changed = true;
    }
  });
  if (!changed) return;
  try {
    await router.replace({ path: route.path, query: q });
  } catch {
    /* ignore */
  }
};

/**
 * Deep-link from company event editor: `?companyEventId=` opens a new draft locked to that event.
 * Optional `&formType=intake` (default from the program event editor) uses Intake + Registration; omit for Smart Registration only.
 */
const openCreateFromCompanyEventQuery = async () => {
  const ce = Number(route.query?.companyEventId || 0) || null;
  if (!ce || showForm.value) return;
  const wantedFormType = String(route.query?.formType || '').trim().toLowerCase();
  const useIntakeEnrollment = wantedFormType === 'intake';

  openCreate();
  if (lockAgencyPicker.value) {
    const id = Number(props.scopedAgencyId || 0);
    form.organizationId = id;
    companyEventsPickerAgencyId.value = id;
  }
  await nextTick();
  // Always load the event list for the picker (Intake has no Registration step until we add one below,
  // so `registrationFlowAdmin` would be false and skip hydration — leaving the dropdown empty).
  await hydrateCompanyEventPickerForEdit(ce);

  const ev = (companyEventsPickerOptions.value || []).find((e) => Number(e.id) === ce) || null;
  const evOrg = ev && Number(ev.organizationId || 0) > 0 ? Number(ev.organizationId) : null;

  if (useIntakeEnrollment) {
    form.formType = 'intake';
    if (evOrg) {
      form.scopeType = 'program';
      form.organizationId = evOrg;
    } else {
      form.scopeType = 'agency';
      if (lockAgencyPicker.value) {
        form.organizationId = Number(props.scopedAgencyId || 0);
      } else {
        form.organizationId = Number(companyEventsPickerAgencyId.value || form.organizationId || 0) || null;
      }
    }
    form.createClient = true;
    form.createGuardian = true;
    form.companyEventId = ce;
    if (!form.intakeSteps.length) {
      addStep('questions');
      addStep('registration');
    }
    form.intakeSteps = sanitizeSteps(form.intakeSteps, { formType: 'intake' });
  } else {
    form.formType = 'smart_registration';
    form.scopeType = 'agency';
    if (lockAgencyPicker.value) {
      const id = Number(props.scopedAgencyId || 0);
      form.organizationId = id;
      companyEventsPickerAgencyId.value = id;
    }
    form.companyEventId = ce;
  }
  await clearCompanyEventEnrollmentQueryParams();
};

const openEditorFromQuery = async () => {
  const editRaw = route.query?.editIntakeLinkId ?? route.query?.editId;
  const jobRaw = route.query?.jobDescriptionId;
  const editId = Number(editRaw || 0) || null;
  const jobDescriptionId = Number(jobRaw || 0) || null;
  if (!editId && !jobDescriptionId) return;

  if (editId) {
    const existing = (links.value || []).find((l) => Number(l.id) === Number(editId));
    if (existing) {
      editLink(existing);
      await clearEditorQueryParams();
      return;
    }
  }

  if (jobDescriptionId) {
    let link = (links.value || []).find(
      (l) =>
        String(l.form_type || '').toLowerCase() === 'job_application'
        && Number(l.job_description_id || 0) === Number(jobDescriptionId)
        && !!l.is_active
    );
    if (!link) {
      try {
        const created = await api.post(`/intake-links/from-job/${jobDescriptionId}`);
        if (created?.data?.link?.id) {
          await fetchData();
          link = (links.value || []).find((l) => Number(l.id) === Number(created.data.link.id));
        }
      } catch {
        // fallback below
      }
    }
    if (link) {
      editLink(link);
      await clearEditorQueryParams();
    }
  }
};

const applyFieldTemplate = (template) => {
  if (!template?.fields_json) return;
  form.intakeFieldsText = JSON.stringify(template.fields_json, null, 2);
  if (!form.intakeSteps.length) {
    form.intakeSteps = sanitizeSteps(
      [
        {
          id: createId('step'),
          type: 'questions',
          visibility: 'always',
          fields: template.fields_json || []
        }
      ],
      { formType: form.formType }
    );
  }
};

const saveFieldTemplate = async () => {
  try {
    formError.value = '';
    if (!selectedAgencyId.value || !fieldTemplateName.value.trim()) {
      formError.value = 'Agency and template name are required.';
      return;
    }
    const parsed = fieldTemplateJson.value.trim() ? JSON.parse(fieldTemplateJson.value) : [];
    await api.post('/intake-field-templates', {
      agencyId: selectedAgencyId.value,
      name: fieldTemplateName.value.trim(),
      fieldsJson: parsed
    });
    const r = await api.get('/intake-field-templates', { params: { agencyId: selectedAgencyId.value } });
    fieldTemplates.value = r.data || [];
    fieldTemplateName.value = '';
    fieldTemplateJson.value = '';
  } catch (e) {
    formError.value = e.response?.data?.error?.message || 'Failed to save field template';
  }
};

const closeForm = () => {
  showForm.value = false;
};

const formatApiError = (e, fallback) => {
  const message = e?.response?.data?.error?.message;
  const errors = e?.response?.data?.error?.errors;
  if (Array.isArray(errors) && errors.length) {
    const details = errors
      .map((err) => err?.msg || (err?.path ? `${err.path}: invalid` : null))
      .filter(Boolean)
      .join(', ');
    if (message && details) return `${message}: ${details}`;
    if (message) return message;
    if (details) return details;
  }
  if (message) return message;
  if (e?.message) return e.message;
  return fallback;
};

const save = async () => {
  try {
    saving.value = true;
    formError.value = '';
    const { intakeSteps, intakeFields, allowedDocumentTemplateIds } = buildPayloadFromSteps();
    const customMessagesPayload = (() => {
      const cm = form.customMessages || {};
      const completionType = String(cm.completionEmailTemplateType || '').trim();
      const hasCustomCompletionType = completionType && completionType !== 'school_full_intake_packet_default';
      const preset = String(cm.completionEmailPreset || '').trim();
      const hasAny = (cm.beginSubtitle || '').trim()
        || (cm.formTimeLimit || '').trim()
        || Number(cm.completionEmailTemplateId || 0)
        || hasCustomCompletionType
        || (cm.completionEmailSubject || '').trim()
        || (cm.completionEmailBody || '').trim()
        || preset === COMPLETION_EMAIL_PRESET_GUARDIAN_PARTNERSHIP;
      if (!hasAny) return null;
      return {
        beginSubtitle: (cm.beginSubtitle || '').trim() || undefined,
        formTimeLimit: (cm.formTimeLimit || '').trim() || undefined,
        completionEmailTemplateId: Number(cm.completionEmailTemplateId || 0) || undefined,
        completionEmailPreset:
          preset === COMPLETION_EMAIL_PRESET_GUARDIAN_PARTNERSHIP
            ? COMPLETION_EMAIL_PRESET_GUARDIAN_PARTNERSHIP
            : undefined,
        completionEmailTemplateType: hasCustomCompletionType ? completionType : undefined,
        completionEmailSubject: (cm.completionEmailSubject || '').trim() || undefined,
        completionEmailBody: (cm.completionEmailBody || '').trim() || undefined
      };
    })();
    const payload = {
      title: form.title,
      description: form.description,
      languageCode: form.languageCode,
      formType: form.formType,
      scopeType: ['job_application', 'medical_records_request', 'smart_registration'].includes(form.formType)
        ? 'agency'
        : (form.formType === 'smart_school_roi' ? 'school' : form.scopeType),
      isActive: form.isActive,
      createClient: ['job_application', 'smart_school_roi'].includes(form.formType) ? false : form.createClient,
      createGuardian: ['job_application', 'smart_school_roi'].includes(form.formType) ? false : form.createGuardian,
      requiresAssignment: form.formType === 'smart_school_roi' ? false : form.requiresAssignment,
      retentionPolicy: form.retentionPolicy ? { ...form.retentionPolicy } : null,
      customMessages: customMessagesPayload,
      allowedDocumentTemplateIds,
      intakeFields,
      intakeSteps
    };
    if (form.formType === 'job_application' && form.jobDescriptionId) {
      payload.jobDescriptionId = form.jobDescriptionId;
    }
    // smart_registration is always agency-scoped — always set organizationId from the picker.
    if (form.formType === 'smart_registration') {
      const pickerAgencyId = Number(companyEventsPickerAgencyId.value || 0) || null;
      if (pickerAgencyId) payload.organizationId = pickerAgencyId;
    } else if (['job_application', 'medical_records_request'].includes(form.formType) && form.organizationId) {
      payload.organizationId = form.organizationId;
    } else if (form.scopeType !== 'agency' && form.organizationId) {
      payload.organizationId = form.organizationId;
    } else if (
      registrationFlowAdmin.value &&
      (payload.scopeType || form.scopeType) === 'agency' &&
      !payload.organizationId
    ) {
      // Intake-with-registration-step fallback
      const pickerAgencyId = Number(companyEventsPickerAgencyId.value || 0) || null;
      if (pickerAgencyId) payload.organizationId = pickerAgencyId;
    }
    if (form.scopeType === 'program' && form.programId) {
      payload.programId = form.programId;
    }
    payload.companyEventId = registrationFlowAdmin.value
      ? (form.companyEventId ? Number(form.companyEventId) : null)
      : null;
    if (editingId.value) {
      await api.put(`/intake-links/${editingId.value}`, payload);
    } else {
      await api.post('/intake-links', payload);
    }
    await fetchData();
    clearDraft();
    showForm.value = false;
  } catch (e) {
    formError.value = formatApiError(e, 'Failed to save digital form');
  } finally {
    saving.value = false;
  }
};

const applyDefaultCompletionEmailCopy = () => {
  if (!form.customMessages) return;
  form.customMessages.completionEmailPreset = null;
  const formLabel = String(form.title || '').trim() || 'Intake Packet';
  form.customMessages.completionEmailSubject = `${formLabel} - Signed Packet Ready`;
  form.customMessages.completionEmailBody = [
    'Hello {{SIGNER_NAME}},',
    '',
    'Your signed intake packet is ready.',
    '{{CLIENT_SUMMARY}}',
    '',
    'Download your signed packet:',
    '{{DOWNLOAD_URL}}',
    '',
    'This link expires in {{LINK_EXPIRES_DAYS}} days.'
  ].join('\n');
};

const applyGuardianPartnershipCompletionEmailCopy = () => {
  if (!form.customMessages) return;
  const formLabel = String(form.title || '').trim() || 'Your program';
  form.customMessages.completionEmailSubject = `${formLabel} — Welcome, your intake is complete`;
  form.customMessages.completionEmailBody = [
    'Hi {{SIGNER_NAME}},',
    '',
    'Thank you for completing your registration and intake. We are glad you are joining us.',
    '{{CLIENT_SUMMARY}}',
    '',
    'Your signed intake packet is ready for your records.',
    '',
    'Download your signed packet:',
    '{{DOWNLOAD_URL}}',
    '',
    'This download link expires in {{LINK_EXPIRES_DAYS}} days.',
    '',
    'We also created a guardian portal account for you. You can access it using the one-time sign-in link below (recommended), or sign in from the main login page with your email and temporary password.',
    '',
    'One-time sign-in link:',
    '{{PORTAL_LOGIN_URL}}',
    '',
    'Username (email): {{REGISTRATION_LOGIN_EMAIL}}',
    'Temporary password: {{REGISTRATION_TEMP_PASSWORD}}',
    '',
    'Main login page (optional): {{REGISTRATION_LOGIN_PAGE_URL}}',
    '',
    'The temporary password is valid for 72 hours. After you sign in, you will be prompted to set a new password.',
    'If it expires before you sign in, use "Forgot password" on the login page to receive a reset link.',
    '',
    '{{REGISTRATION_EVENT_SUMMARY}}',
    '',
    'If you have questions, reply to this email and we will be happy to help.',
    '',
    'Warm regards,',
    '{{SCHOOL_NAME}} team'
  ].join('\n');
};

const onCompletionEmailDropdownChange = (event) => {
  if (!form.customMessages) return;
  const raw = String(event?.target?.value ?? '');
  form.customMessages.completionEmailPreset = null;
  form.customMessages.completionEmailTemplateId = null;
  if (raw.startsWith('template:')) {
    const id = Number(raw.slice('template:'.length));
    if (id) {
      form.customMessages.completionEmailTemplateId = id;
      onCompletionEmailTemplateChange();
    }
    return;
  }
  if (raw === 'preset:guardian_partnership') {
    form.customMessages.completionEmailPreset = COMPLETION_EMAIL_PRESET_GUARDIAN_PARTNERSHIP;
    applyGuardianPartnershipCompletionEmailCopy();
    return;
  }
  form.customMessages.completionEmailSubject = '';
  form.customMessages.completionEmailBody = '';
};

const onCompletionEmailTemplateChange = () => {
  const template = selectedCompletionEmailTemplate.value;
  if (!template) return;
  if (String(template.subject || '').trim()) {
    form.customMessages.completionEmailSubject = String(template.subject || '').trim();
  }
  if (String(template.body || '').trim()) {
    form.customMessages.completionEmailBody = String(template.body || '').trim();
  }
};

const copyLink = async (link) => {
  const key = link.public_key || '';
  if (!key) return;
  const url = buildFormUrl(key, link.form_type);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // ignore
  }
};

const createQuickLink = async () => {
  try {
    quickError.value = '';
    if (quickScope.value !== 'agency' && !quickOrganizationId.value) {
      quickError.value = 'Organization is required.';
      return;
    }
    const payload = {
      title: quickTitle.value || null,
      languageCode: quickLanguageCode.value,
      scopeType: quickScope.value,
      createClient: true,
      createGuardian: true,
      isActive: true
    };
    if (quickScope.value !== 'agency' && quickOrganizationId.value) {
      payload.organizationId = quickOrganizationId.value;
    }
    await api.post('/intake-links', payload);
    await fetchData();
    quickTitle.value = '';
  } catch (e) {
    quickError.value = formatApiError(e, 'Failed to create link');
  }
};

const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const agencyOnlyTemplates = computed(() => {
  const list = Array.isArray(templates.value) ? templates.value : [];
  return list.filter((t) => t && t.agency_id !== null && t.agency_id !== undefined);
});

/** When scope is school, only show school-scoped template types. */
const scopeFilteredTemplates = computed(() => {
  const list = agencyOnlyTemplates.value;
  if (form.formType === 'smart_school_roi') {
    return list.filter((t) => String(t?.document_type || '') === 'school_roi');
  }
  const scope = form.scopeType || 'school';
  if (scope === 'school') {
    return list.filter((t) => ['school', 'school_roi'].includes(String(t?.document_type || '')));
  }
  return list;
});

const documentStepTemplates = computed(() => {
  const list = scopeFilteredTemplates.value;
  const sorted = list.filter((t) => t && t.id);
  sorted.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
  return sorted;
});

const filteredDocumentStepTemplates = computed(() => {
  const list = documentStepTemplates.value;
  const q = String(documentStepFilter.value || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((t) => String(t?.name || '').toLowerCase().includes(q));
});
const schoolRoiStepTemplates = computed(() =>
  documentStepTemplates.value.filter((t) => String(t?.document_type || '').trim().toLowerCase() === 'school_roi')
);
const defaultSchoolRoiTemplateId = computed(() => schoolRoiStepTemplates.value[0]?.id || null);
const canAddSchoolRoiStep = computed(() => form.formType === 'smart_school_roi' || form.scopeType === 'school');

/** Guardian waiver intake step only when this link creates/links a guardian account (flexible for future waiver types). */
const canAddGuardianWaiverStep = computed(() => {
  const ft = String(form.formType || '').toLowerCase();
  if (ft === 'job_application') return false;
  return Boolean(form.createGuardian);
});

/** Hint when builder is visible but guardian waivers can’t be added until Create Guardian is Yes. */
const showGuardianWaiverStepHint = computed(() => {
  const ft = String(form.formType || '').toLowerCase();
  if (ft === 'job_application' || ft === 'smart_school_roi') return false;
  return !canAddGuardianWaiverStep.value;
});

const getSelectedTemplateLabel = (templateId) => {
  if (templateId == null) return '';
  const t = documentStepTemplates.value.find((x) => Number(x.id) === Number(templateId));
  return t ? `${t.name} (${t.document_action_type})` : '';
};

const toggleDocumentStepSelect = (stepId) => {
  if (openDocumentStepSelectId.value === stepId) {
    closeDocumentStepSelect();
  } else {
    openDocumentStepSelectId.value = stepId;
    documentStepFilter.value = '';
    nextTick(() => {
      documentStepFilterInputRef.value?.focus();
    });
  }
};

const closeDocumentStepSelect = () => {
  openDocumentStepSelectId.value = null;
  documentStepFilter.value = '';
};

const selectDocumentTemplate = (step, templateId) => {
  step.templateId = templateId;
  closeDocumentStepSelect();
};

const sanitizeSteps = (steps, { formType } = {}) => {
  const formTypeKey = String(formType || '').trim().toLowerCase();
  const raw = Array.isArray(steps) ? steps : [];
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const next = { ...s };
      if (!next.id) next.id = createId('step');
      if (!next.type) next.type = next.templateId ? 'document' : 'questions';
      if (next.type === 'questions' || next.type === 'clinical_questions') {
        next.visibility = ['always', 'new_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
        const fields = Array.isArray(next.fields) ? next.fields : [];
        next.fields = fields
          .filter((f) => f && typeof f === 'object')
          .map((f) => ({
            id: f.id || createId('field'),
            key: f.key || '',
            label: f.label || '',
            type: f.type || 'text',
            required: !!f.required,
            helperText: f.helperText || '',
            scope: next.type === 'clinical_questions' ? 'clinical' : (f.scope || 'submission'),
            documentKey: f.documentKey || '',
            visibility: ['always', 'new_client_only'].includes(String(f.visibility || '').trim())
              ? String(f.visibility).trim()
              : 'always',
            showIf: {
              fieldKey: f.showIf?.fieldKey || '',
              equals: f.showIf?.equals || ''
            },
            options: Array.isArray(f.options) ? f.options.filter((o) => o && typeof o === 'object') : []
          }));
      } else if (next.type === 'demographics') {
        next.showDob = next.showDob !== false;
        next.showGender = next.showGender !== false;
        next.showEthnicity = next.showEthnicity !== false;
        next.showAddress = next.showAddress !== false;
        next.showPreferredLanguage = next.showPreferredLanguage !== false;
        next.hideForExisting = !!next.hideForExisting;
      } else if (next.type === 'document') {
        if (next.templateId === undefined) next.templateId = null;
        if (next.checkboxDisclaimer === undefined) next.checkboxDisclaimer = '';
        next.visibility = ['always', 'new_client_only', 'existing_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
      } else if (next.type === 'registration') {
        next.label = String(next.label || '').trim() || 'Registration';
        next.description = String(next.description || '').trim();
        const rawHasRegistrationStep = raw.some(
          (x) => String(x?.type || '').trim().toLowerCase() === 'registration'
        );
        const forceRegAlways =
          formTypeKey === 'smart_registration'
          || (formTypeKey === 'intake' && rawHasRegistrationStep);
        next.visibility = forceRegAlways
          ? 'always'
          : (['always', 'new_client_only', 'existing_client_only'].includes(String(next.visibility || '').trim())
            ? String(next.visibility).trim()
            : 'always');
        next.participantMode = ['any', 'existing_only', 'new_only'].includes(String(next.participantMode || ''))
          ? String(next.participantMode)
          : 'any';
        next.existingLookupField = ['email', 'phone', 'client_id'].includes(String(next.existingLookupField || ''))
          ? String(next.existingLookupField)
          : 'email';
        next.defaultVideoUrl = String(next.defaultVideoUrl || '').trim();
        next.providerUserIdsCsv = String(next.providerUserIdsCsv || '').trim();
        next.sourceType = ['manual', 'program', 'program_event', 'class', 'event', 'agency_catalog'].includes(String(next.sourceType || ''))
          ? String(next.sourceType)
          : 'manual';
        const sourceConfig = next.sourceConfig && typeof next.sourceConfig === 'object'
          ? { ...next.sourceConfig }
          : {};
        sourceConfig.selectedProgramOrganizationIds = Array.isArray(sourceConfig.selectedProgramOrganizationIds)
          ? sourceConfig.selectedProgramOrganizationIds.map((id) => Number(id)).filter(Number.isFinite)
          : [];
        sourceConfig.learningOrganizationId = Number(sourceConfig.learningOrganizationId || 0) || null;
        sourceConfig.selectedClassIds = Array.isArray(sourceConfig.selectedClassIds)
          ? sourceConfig.selectedClassIds.map((id) => Number(id)).filter(Number.isFinite)
          : [];
        sourceConfig.programEventAgencyId = Number(sourceConfig.programEventAgencyId || 0) || null;
        sourceConfig.programEventProgramId = Number(sourceConfig.programEventProgramId || 0) || null;
        sourceConfig.programEventSiteId = Number(sourceConfig.programEventSiteId || 0) || null;
        sourceConfig.selectedProgramEventSlotIds = Array.isArray(sourceConfig.selectedProgramEventSlotIds)
          ? sourceConfig.selectedProgramEventSlotIds.map((id) => Number(id)).filter(Number.isFinite)
          : [];
        if (next.sourceType === 'program' && sourceConfig.selectedProgramOrganizationIds.length === 0 && Array.isArray(next.options)) {
          sourceConfig.selectedProgramOrganizationIds = next.options
            .map((opt) => Number(opt?.entityId || 0))
            .filter((id) => id > 0);
        }
        if (next.sourceType === 'class' && sourceConfig.selectedClassIds.length === 0 && Array.isArray(next.options)) {
          sourceConfig.selectedClassIds = next.options
            .map((opt) => Number(opt?.entityId || 0))
            .filter((id) => id > 0);
        }
        next.sourceConfig = sourceConfig;
        const selfPay = next.selfPay && typeof next.selfPay === 'object' ? { ...next.selfPay } : {};
        selfPay.enabled = !!selfPay.enabled;
        selfPay.costDollars = Math.max(0, Number(selfPay.costDollars || 0) || 0);
        selfPay.paymentLinkUrl = String(selfPay.paymentLinkUrl || '').trim();
        selfPay.paymentProvider = 'quickbooks';
        next.selfPay = selfPay;
        next.scheduleBlocks = Array.isArray(next.scheduleBlocks)
          ? next.scheduleBlocks
            .filter((sb) => sb && typeof sb === 'object')
            .map((sb) => ({
              id: sb.id || createId('reg_sched'),
              label: String(sb.label || '').trim(),
              startDate: String(sb.startDate || '').trim(),
              endDate: String(sb.endDate || '').trim(),
              startTime: String(sb.startTime || '').trim(),
              endTime: String(sb.endTime || '').trim(),
              sequenceDays: Math.max(1, Math.trunc(Number(sb.sequenceDays || 1) || 1))
            }))
          : [];
        const allowMultiple = !!next.selectionRules?.allowMultiple;
        const minSelectionsRaw = Number(next.selectionRules?.minSelections ?? 1);
        const maxSelectionsRaw = Number(next.selectionRules?.maxSelections ?? (allowMultiple ? 0 : 1));
        next.selectionRules = {
          allowMultiple,
          minSelections: Math.max(0, Number.isFinite(minSelectionsRaw) ? Math.trunc(minSelectionsRaw) : 1),
          maxSelections: allowMultiple
            ? (Number.isFinite(maxSelectionsRaw) && maxSelectionsRaw > 0 ? Math.trunc(maxSelectionsRaw) : null)
            : 1
        };
        next.options = Array.isArray(next.options)
          ? next.options
            .filter((opt) => opt && typeof opt === 'object')
            .map((opt) => ({
              id: opt.id || createId('reg_opt'),
              label: String(opt.label || '').trim(),
              description: String(opt.description || '').trim(),
              entityType: String(opt.entityType || next.sourceType || 'manual').trim().toLowerCase(),
              entityId: Number(opt.entityId || 0) || null,
              videoJoinUrl: String(opt.videoJoinUrl || '').trim(),
              costDollars: Math.max(0, Number(opt.costDollars || 0) || 0),
              paymentLinkUrl: String(opt.paymentLinkUrl || '').trim(),
              providerUserIdsCsv: String(opt.providerUserIdsCsv || '').trim(),
              scheduleBlocks: Array.isArray(opt.scheduleBlocks)
                ? opt.scheduleBlocks
                  .filter((sb) => sb && typeof sb === 'object')
                  .map((sb) => ({
                    id: sb.id || createId('reg_sched'),
                    label: String(sb.label || '').trim(),
                    startDate: String(sb.startDate || '').trim(),
                    endDate: String(sb.endDate || '').trim(),
                    startTime: String(sb.startTime || '').trim(),
                    endTime: String(sb.endTime || '').trim(),
                    sequenceDays: Math.max(1, Math.trunc(Number(sb.sequenceDays || 1) || 1))
                  }))
                : [],
              frequencyLabel: String(opt.frequencyLabel || '').trim(),
              termsSummary: String(opt.termsSummary || '').trim()
            }))
            .filter((opt) => !!opt.label)
          : [];
      } else if (next.type === 'school_roi') {
        next.templateId = null;
        next.checkboxDisclaimer = '';
        next.visibility = ['always', 'new_client_only', 'existing_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
      } else if (next.type === 'upload') {
        next.label = next.label ?? '';
        next.accept = next.accept ?? '.pdf,.doc,.docx';
        next.maxFiles = Math.max(1, Math.min(10, parseInt(next.maxFiles, 10) || 1));
        next.required = next.required !== false;
        next.allowPasteText = !!next.allowPasteText;
        next.visibility = ['always', 'new_client_only', 'existing_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
      } else if (next.type === 'references') {
        next.label = String(next.label || '').trim() || 'Professional references';
        next.required = next.required !== false;
        next.waivable = next.waivable !== false;
        next.minReferences = Math.max(1, Math.min(5, parseInt(next.minReferences, 10) || 3));
        next.authorizationNotice = String(next.authorizationNotice || '').trim()
          || 'By submitting this information, you authorize [tenant] to contact the individuals listed and obtain information regarding your employment history, educational background, professional conduct, and qualifications for employment.';
        next.visibility = ['always', 'new_client_only', 'existing_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
      } else if (next.type === 'guardian_waiver') {
        next.label = String(next.label || '').trim() || 'Guardian waivers & safety';
        next.visibility = ['always', 'new_client_only', 'existing_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
        const allowed = new Set([
          'pickup_authorization',
          'emergency_contacts',
          'allergies_snacks',
          'meal_preferences'
        ]);
        const raw = Array.isArray(next.sectionKeys) ? next.sectionKeys : [];
        let keys = [...new Set(raw.map((k) => String(k || '').trim()).filter((k) => allowed.has(k)))];
        if (!keys.length) {
          keys = [...allowed];
        }
        next.sectionKeys = keys;
      } else if (next.type === 'communications') {
        next.label = String(next.label || '').trim() || 'Communication preferences';
        next.visibility = ['always', 'new_client_only', 'existing_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
        next.audience = ['auto', 'guardian_client', 'workforce', 'school_staff'].includes(String(next.audience || '').trim())
          ? String(next.audience).trim()
          : 'auto';
        const campaigns = next.campaigns && typeof next.campaigns === 'object' ? { ...next.campaigns } : {};
        next.campaigns = {
          scheduling: campaigns.scheduling !== false,
          providerTexting: !!campaigns.providerTexting,
          programUpdates: !!campaigns.programUpdates,
          internalWorkforce: !!campaigns.internalWorkforce
        };
      } else if (next.type === 'insurance_info') {
        next.label = String(next.label || '').trim() || 'Insurance information';
        next.visibility = ['always', 'new_client_only'].includes(String(next.visibility || '').trim())
          ? String(next.visibility).trim()
          : 'always';
        next.nonMedicaidDisclaimerText = String(next.nonMedicaidDisclaimerText || '').trim();
        next.secondaryInsuranceDisclaimerText = String(next.secondaryInsuranceDisclaimerText || '').trim();
        next.requireSecondaryInsurance = !!next.requireSecondaryInsurance;
      }
      return next;
    });
};

const safeSteps = computed(() => (Array.isArray(form.intakeSteps) ? form.intakeSteps : []));
const hasProgrammedSchoolRoiStep = computed(() =>
  safeSteps.value.some((s) => String(s?.type || '').trim().toLowerCase() === 'school_roi')
);

const getStepFields = (step) => {
  if (!step || !Array.isArray(step.fields)) return [];
  return step.fields.filter((f) => f && typeof f === 'object');
};

const normalizeIntakeSteps = (link) => {
  const ft = link?.form_type || link?.formType;
  if (Array.isArray(link?.intake_steps) && link.intake_steps.length) {
    return sanitizeSteps(link.intake_steps, { formType: ft });
  }
  const steps = [];
  if (Array.isArray(link?.intake_fields) && link.intake_fields.length) {
    steps.push({ id: createId('step'), type: 'questions', fields: link.intake_fields });
  }
  const docIds = Array.isArray(link?.allowed_document_template_ids) ? link.allowed_document_template_ids : [];
  docIds.forEach((id) =>
    steps.push({ id: createId('step'), type: 'document', templateId: id, checkboxDisclaimer: '' })
  );
  return sanitizeSteps(steps, { formType: ft });
};

const addStep = (type, options = {}) => {
  const step = { id: createId('step'), type };
  if (type === 'questions') {
    step.fields = [];
    step.visibility = 'always';
  } else if (type === 'registration') {
    step.label = 'Registration';
    step.description = '';
    step.visibility = 'always';
    // Company event links always have existing attendees (employees/staff who received an invite).
    step.participantMode = registrationFlowAdmin.value && form.companyEventId ? 'existing_only' : 'any';
    step.existingLookupField = 'email';
    step.defaultVideoUrl = '';
    step.providerUserIdsCsv = '';
    step.sourceType = 'manual';
    step.selfPay = {
      enabled: false,
      costDollars: 0,
      paymentLinkUrl: '',
      paymentProvider: 'quickbooks'
    };
    step.scheduleBlocks = [];
    step.sourceConfig = {
      selectedProgramOrganizationIds: [],
      learningOrganizationId: null,
      selectedClassIds: [],
      programEventAgencyId: null,
      programEventProgramId: null,
      programEventSiteId: null,
      selectedProgramEventSlotIds: []
    };
    step.selectionRules = {
      allowMultiple: false,
      minSelections: 1,
      maxSelections: 1
    };
    step.options = [
      {
        id: createId('reg_opt'),
        label: '',
        description: '',
        entityType: 'manual',
        entityId: null,
        videoJoinUrl: '',
        costDollars: 0,
        paymentLinkUrl: '',
        providerUserIdsCsv: ''
      }
    ];
  } else if (type === 'upload') {
    step.label = '';
    step.accept = '.pdf,.doc,.docx';
    step.maxFiles = 1;
    step.required = true;
    step.visibility = 'always';
  } else if (type === 'references') {
    step.label = 'Professional references';
    step.visibility = 'always';
    step.required = true;
    step.waivable = true;
    step.minReferences = 3;
    step.authorizationNotice =
      'Please provide three (3) professional references who can speak to your work experience, professionalism, and role-related competencies. References should be individuals who have directly supervised or worked closely with you in a professional, academic, or clinical setting. Personal or family references are not accepted.\n\nReference Authorization Notice: By submitting this information, you authorize [tenant] to contact the individuals listed below and to obtain information regarding your employment history, educational background, professional conduct, and qualifications for employment.';
  } else if (type === 'school_roi') {
    step.templateId = null;
    step.checkboxDisclaimer = '';
    step.visibility = 'always';
  } else if (type === 'guardian_waiver') {
    step.label = 'Guardian waivers & safety';
    step.visibility = 'always';
    step.sectionKeys = [
      'pickup_authorization',
      'emergency_contacts',
      'allergies_snacks',
      'meal_preferences'
    ];
  } else if (type === 'insurance_info') {
    step.label = 'Insurance information';
    step.visibility = 'always';
    // Text shown to non-Medicaid families explaining why payment info is collected.
    step.nonMedicaidDisclaimerText = '';
    step.secondaryInsuranceDisclaimerText = '';
    step.requireSecondaryInsurance = false;
  } else if (type === 'payment_collection') {
    step.label = 'Payment information';
    step.visibility = 'always';
    // Disclosure text shown above the card form. May include cost details.
    step.costDisclosureText = '';
    // Whether to auto-charge the saved card at session start.
    step.autoChargeDefault = true;
  } else if (type === 'communications') {
    step.label = 'Communication preferences';
    step.visibility = 'always';
    step.audience = 'auto';
    step.campaigns = {
      scheduling: true,
      providerTexting: false,
      programUpdates: false,
      internalWorkforce: false
    };
  } else if (type === 'demographics') {
    step.label = 'Demographics';
    step.visibility = 'always';
    step.showDob = true;
    step.showGender = true;
    step.showEthnicity = true;
    step.showAddress = true;
    step.showPreferredLanguage = true;
    step.hideForExisting = true;
  } else if (type === 'clinical_questions') {
    step.label = 'Clinical questions';
    step.visibility = 'always';
    step.fields = [];
  } else {
    step.templateId = options?.templateId ?? null;
    step.checkboxDisclaimer = '';
    step.visibility = 'always';
  }
  form.intakeSteps.push(step);
  return step;
};

const addJobApplicationStarterSteps = () => {
  const existingTypes = new Set((form.intakeSteps || []).map((s) => String(s?.type || '').trim().toLowerCase()));
  if (!existingTypes.has('upload')) {
    const resumeStep = addStep('upload');
    resumeStep.label = 'Resume';
    resumeStep.required = true;
    resumeStep.allowPasteText = true;
    resumeStep.accept = '.pdf,.doc,.docx,.txt';
  }
  const hasCover = (form.intakeSteps || []).some((s) => String(s?.type || '').trim().toLowerCase() === 'upload' && /cover/i.test(String(s?.label || '')));
  if (!hasCover) {
    const coverStep = addStep('upload');
    coverStep.label = 'Cover Letter';
    coverStep.required = false;
    coverStep.allowPasteText = true;
    coverStep.accept = '.pdf,.doc,.docx,.txt';
  }
  if (!existingTypes.has('references')) {
    addStep('references');
  }
};

const openLinkedJobInCareers = async () => {
  const aid = Number(form.organizationId || 0) || null;
  if (!aid) return;
  try {
    const org = agencyList.value.find((a) => Number(a.id) === aid);
    const slug = String(org?.slug || '').trim();
    if (slug) {
      await router.push({ path: `/${slug}/admin/careers` });
      return;
    }
  } catch {
    // fallback below
  }
  await router.push({ path: '/admin/careers' });
};

const addSchoolRoiStep = () => {
  addStep('school_roi');
};

const removeStep = (idx) => {
  form.intakeSteps.splice(idx, 1);
};

const moveStep = (idx, dir) => {
  form.intakeSteps = sanitizeSteps(form.intakeSteps, { formType: form.formType });
  const next = idx + dir;
  if (next < 0 || next >= form.intakeSteps.length) return;
  const copy = [...form.intakeSteps];
  const [moved] = copy.splice(idx, 1);
  copy.splice(next, 0, moved);
  form.intakeSteps = copy;
};

const addField = (step) => {
  step.fields.push({
    id: createId('field'),
    key: '',
    label: '',
    type: 'text',
    required: false,
    helperText: '',
    scope: 'submission',
    visibility: 'always',
    showIf: { fieldKey: '', equals: '' },
    options: []
  });
};

const addFieldAfter = (step, idx) => {
  if (!step || !Array.isArray(step.fields)) return;
  const next = idx + 1;
  const field = {
    id: createId('field'),
    key: '',
    label: '',
    type: 'text',
    required: false,
    helperText: '',
    scope: 'submission',
    visibility: 'always',
    showIf: { fieldKey: '', equals: '' },
    options: []
  };
  step.fields.splice(next, 0, field);
};

const removeField = (step, idx) => {
  step.fields.splice(idx, 1);
};

const getConditionalTargets = (step, idx) => {
  if (!step || !Array.isArray(step.fields)) return [];
  const base = step.fields
    .filter((f, fIdx) => f && typeof f === 'object' && fIdx !== idx && f.key)
    .map((f) => ({ key: f.key, label: f.label }));
  const registrationContextTargets = [
    { key: 'registration_account_state', label: 'Registration account state (new/existing)' },
    { key: 'registration_has_account', label: 'Registration has account (true/false)' },
    { key: 'registration_client_match', label: 'Client match (new/existing)' }
  ];
  const seen = new Set();
  const merged = [...base, ...registrationContextTargets]
    .filter((t) => {
      const k = String(t?.key || '').trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return merged;
};

const applyRegistrationAccountShowIf = (field, accountState) => {
  if (!field || typeof field !== 'object') return;
  if (!field.showIf || typeof field.showIf !== 'object') {
    field.showIf = { fieldKey: '', equals: '' };
  }
  field.showIf.fieldKey = 'registration_account_state';
  field.showIf.equals = String(accountState || '').trim().toLowerCase() === 'existing' ? 'existing' : 'new';
};

const isRegistrationAccountShowIf = (field) =>
  String(field?.showIf?.fieldKey || '').trim() === 'registration_account_state'
  && ['new', 'existing'].includes(String(field?.showIf?.equals || '').trim().toLowerCase());

const clearFieldShowIf = (field) => {
  if (!field || typeof field !== 'object') return;
  field.showIf = { fieldKey: '', equals: '' };
};

const moveField = (step, idx, dir) => {
  if (!step || !Array.isArray(step.fields)) return;
  const next = idx + dir;
  if (next < 0 || next >= step.fields.length) return;
  const copy = [...step.fields];
  const [moved] = copy.splice(idx, 1);
  copy.splice(next, 0, moved);
  step.fields = copy;
};

const addOption = (field) => {
  if (!Array.isArray(field.options)) field.options = [];
  field.options.push({ id: createId('opt'), label: '', value: '' });
};

const addRegistrationOption = (step) => {
  if (!step || !Array.isArray(step.options)) step.options = [];
  step.options.push({
    id: createId('reg_opt'),
    label: '',
    description: '',
    entityType: step.sourceType || 'manual',
    entityId: null,
    videoJoinUrl: '',
    costDollars: 0,
    paymentLinkUrl: '',
    providerUserIdsCsv: ''
  });
};

const addRegistrationScheduleBlock = (step) => {
  if (!step || !Array.isArray(step.scheduleBlocks)) step.scheduleBlocks = [];
  step.scheduleBlocks.push({
    id: createId('reg_sched'),
    label: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    sequenceDays: 1
  });
};

const removeRegistrationScheduleBlock = (step, idx) => {
  if (!step || !Array.isArray(step.scheduleBlocks)) return;
  step.scheduleBlocks.splice(idx, 1);
};

const removeRegistrationOption = (step, idx) => {
  if (!step || !Array.isArray(step.options)) return;
  step.options.splice(idx, 1);
};

const getLearningClassesForOrganization = (organizationId) => {
  const orgId = Number(organizationId || 0) || null;
  if (!orgId) return [];
  const classes = learningClassesByOrganization.value?.[orgId];
  return Array.isArray(classes) ? classes : [];
};

const loadLearningClassesForOrganization = async (organizationId) => {
  const orgId = Number(organizationId || 0) || null;
  if (!orgId) return [];
  if (Array.isArray(learningClassesByOrganization.value?.[orgId])) {
    return learningClassesByOrganization.value[orgId];
  }
  loadingLearningClassesForOrganization[orgId] = true;
  try {
    const r = await api.get('/learning-program-classes', { params: { organizationId: orgId } });
    const classes = Array.isArray(r.data?.classes) ? r.data.classes : [];
    learningClassesByOrganization.value = {
      ...learningClassesByOrganization.value,
      [orgId]: classes
    };
    return classes;
  } catch {
    learningClassesByOrganization.value = {
      ...learningClassesByOrganization.value,
      [orgId]: []
    };
    return [];
  } finally {
    loadingLearningClassesForOrganization[orgId] = false;
  }
};

const parseProviderIds = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => Number(String(v || '').trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  return [];
};

const loadClassDetail = async (classId) => {
  const id = Number(classId || 0) || null;
  if (!id) return null;
  if (classDetailsById.value[id]) return classDetailsById.value[id];
  try {
    const r = await api.get(`/learning-program-classes/${id}`);
    const detail = {
      class: r.data?.class || null,
      providerMembers: Array.isArray(r.data?.providerMembers) ? r.data.providerMembers : []
    };
    classDetailsById.value = { ...classDetailsById.value, [id]: detail };
    return detail;
  } catch {
    const fallback = { class: null, providerMembers: [] };
    classDetailsById.value = { ...classDetailsById.value, [id]: fallback };
    return fallback;
  }
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatProgramEventSlotLabel = (slot) => {
  const dayIdx = Number(slot?.weekday ?? -1);
  const day = Number.isFinite(dayIdx) && dayIdx >= 0 && dayIdx <= 6 ? WEEKDAY_LABELS[dayIdx] : 'Day';
  const start = String(slot?.start_time || slot?.startTime || '').slice(0, 5);
  const end = String(slot?.end_time || slot?.endTime || '').slice(0, 5);
  const type = String(slot?.slot_type || slot?.slotType || 'scheduled');
  return `${day} ${start || '--:--'}-${end || '--:--'} (${type})`;
};

const getShiftProgramsForAgency = (agencyId) => {
  const id = Number(agencyId || 0) || null;
  if (!id) return [];
  const list = shiftProgramsByAgencyId.value?.[id];
  return Array.isArray(list) ? list : [];
};

const getShiftProgramSites = (programId) => {
  const id = Number(programId || 0) || null;
  if (!id) return [];
  const detail = shiftProgramDetailsById.value?.[id];
  return Array.isArray(detail?.sites) ? detail.sites : [];
};

const getShiftProgramSiteSlots = (siteId) => {
  const id = Number(siteId || 0) || null;
  if (!id) return [];
  const list = shiftSlotsBySiteId.value?.[id];
  return Array.isArray(list) ? list : [];
};

const loadShiftProgramsForAgency = async (agencyId) => {
  const id = Number(agencyId || 0) || null;
  if (!id) return [];
  if (Array.isArray(shiftProgramsByAgencyId.value?.[id])) return shiftProgramsByAgencyId.value[id];
  loadingShiftProgramsByAgency[id] = true;
  shiftProgramsErrorByAgencyId[id] = '';
  try {
    const r = await api.get(`/shift-programs/agencies/${id}/programs`);
    const rows = Array.isArray(r.data) ? r.data : [];
    shiftProgramsByAgencyId.value = { ...shiftProgramsByAgencyId.value, [id]: rows };
    shiftProgramsErrorByAgencyId[id] = '';
    return rows;
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e?.message || '';
    shiftProgramsErrorByAgencyId[id] = msg || 'Could not load shift programs.';
    shiftProgramsByAgencyId.value = { ...shiftProgramsByAgencyId.value, [id]: [] };
    return [];
  } finally {
    loadingShiftProgramsByAgency[id] = false;
  }
};

const loadShiftProgramDetail = async (programId) => {
  const id = Number(programId || 0) || null;
  if (!id) return null;
  if (shiftProgramDetailsById.value?.[id]) return shiftProgramDetailsById.value[id];
  loadingShiftProgramDetailsById[id] = true;
  try {
    const r = await api.get(`/shift-programs/${id}`);
    const detail = {
      ...r.data,
      sites: Array.isArray(r.data?.sites) ? r.data.sites : [],
      staff: Array.isArray(r.data?.staff) ? r.data.staff : [],
      settings: r.data?.settings || {}
    };
    shiftProgramDetailsById.value = { ...shiftProgramDetailsById.value, [id]: detail };
    return detail;
  } catch {
    const fallback = { sites: [], staff: [], settings: {} };
    shiftProgramDetailsById.value = { ...shiftProgramDetailsById.value, [id]: fallback };
    return fallback;
  } finally {
    loadingShiftProgramDetailsById[id] = false;
  }
};

const loadShiftSlotsForSite = async (programId, siteId) => {
  const p = Number(programId || 0) || null;
  const s = Number(siteId || 0) || null;
  if (!p || !s) return [];
  if (Array.isArray(shiftSlotsBySiteId.value?.[s])) return shiftSlotsBySiteId.value[s];
  loadingShiftSlotsBySite[s] = true;
  try {
    const r = await api.get(`/shift-programs/${p}/sites/${s}/slots`);
    const rows = Array.isArray(r.data) ? r.data : [];
    shiftSlotsBySiteId.value = { ...shiftSlotsBySiteId.value, [s]: rows };
    return rows;
  } catch {
    shiftSlotsBySiteId.value = { ...shiftSlotsBySiteId.value, [s]: [] };
    return [];
  } finally {
    loadingShiftSlotsBySite[s] = false;
  }
};

const deriveRegistrationDefaultsFromClass = (klass = null, detail = null) => {
  const meta = klass?.metadata_json && typeof klass.metadata_json === 'object' ? klass.metadata_json : {};
  const reg = meta?.registration && typeof meta.registration === 'object' ? meta.registration : {};
  const providerIdsFromClass = parseProviderIds(reg.providerUserIds || reg.provider_user_ids || meta.providerUserIds || meta.provider_user_ids);
  const providerIdsFromMembers = Array.isArray(detail?.providerMembers)
    ? detail.providerMembers
      .map((p) => Number(p?.provider_user_id || p?.providerUserId || 0))
      .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const providerIds = Array.from(new Set([...providerIdsFromMembers, ...providerIdsFromClass]));
  const startDate = String(klass?.starts_at || '').slice(0, 10);
  const endDate = String(klass?.ends_at || '').slice(0, 10);
  const scheduleBlocks = Array.isArray(reg.scheduleBlocks)
    ? reg.scheduleBlocks
    : (startDate || endDate
      ? [{
          id: createId('reg_sched'),
          label: String(klass?.class_name || klass?.title || 'Class Schedule'),
          startDate: startDate || '',
          endDate: endDate || '',
          startTime: '',
          endTime: '',
          sequenceDays: 1
        }]
      : []);
  return {
    scheduleBlocks,
    videoJoinUrl: String(reg.videoJoinUrl || reg.video_url || meta.videoJoinUrl || meta.video_url || '').trim(),
    costDollars: Math.max(0, Number(reg.costDollars || reg.cost_dollars || meta.costDollars || meta.cost_dollars || 0) || 0),
    paymentLinkUrl: String(reg.paymentLinkUrl || reg.payment_link_url || meta.paymentLinkUrl || meta.payment_link_url || '').trim(),
    providerUserIdsCsv: providerIds.join(','),
    frequencyLabel: String(reg.frequencyLabel || reg.frequency || meta.frequencyLabel || meta.frequency || '').trim(),
    termsSummary: String(reg.termsSummary || reg.terms || meta.termsSummary || meta.terms || '').trim()
  };
};

const hydrateSelectedClassDetails = async (step) => {
  if (!step || step.type !== 'registration' || String(step.sourceType || '') !== 'class') return;
  const selected = Array.isArray(step?.sourceConfig?.selectedClassIds)
    ? step.sourceConfig.selectedClassIds.map((id) => Number(id)).filter(Number.isFinite)
    : [];
  if (!selected.length) return;
  await Promise.all(selected.map((id) => loadClassDetail(id)));
  refreshRegistrationStepOptions(step);
};

const refreshRegistrationStepOptions = (step) => {
  if (!step || step.type !== 'registration') return;
  const sourceType = String(step.sourceType || 'manual');
  if (!step.sourceConfig || typeof step.sourceConfig !== 'object') step.sourceConfig = {};
  if (!step.selectionRules || typeof step.selectionRules !== 'object') {
    step.selectionRules = { allowMultiple: false, minSelections: 1, maxSelections: 1 };
  }
  if (sourceType === 'program') {
    const ids = Array.isArray(step.sourceConfig.selectedProgramOrganizationIds)
      ? step.sourceConfig.selectedProgramOrganizationIds.map((id) => Number(id)).filter(Number.isFinite)
      : [];
    step.sourceConfig.selectedProgramOrganizationIds = ids;
    const existingByEntityId = new Map(
      (Array.isArray(step.options) ? step.options : [])
        .filter((opt) => Number(opt?.entityId || 0))
        .map((opt) => [Number(opt.entityId), opt])
    );
    const options = ids
      .map((id) => programOrganizations.value.find((o) => Number(o.id) === Number(id)))
      .filter(Boolean)
      .map((org) => {
        const existing = existingByEntityId.get(Number(org.id)) || {};
        return {
          id: `reg_program_${org.id}`,
          label: String(org.name || `Program ${org.id}`),
          description: String(existing.description || ''),
          entityType: 'program',
          entityId: Number(org.id),
          videoJoinUrl: String(existing.videoJoinUrl || '').trim(),
          costDollars: Math.max(0, Number(existing.costDollars || 0) || 0),
          paymentLinkUrl: String(existing.paymentLinkUrl || '').trim(),
          providerUserIdsCsv: String(existing.providerUserIdsCsv || '').trim()
        };
      });
    step.options = options;
  } else if (sourceType === 'program_event') {
    const agencyId = Number(step.sourceConfig.programEventAgencyId || 0) || null;
    const programId = Number(step.sourceConfig.programEventProgramId || 0) || null;
    const siteId = Number(step.sourceConfig.programEventSiteId || 0) || null;
    const selectedSlotIds = Array.isArray(step.sourceConfig.selectedProgramEventSlotIds)
      ? step.sourceConfig.selectedProgramEventSlotIds.map((id) => Number(id)).filter(Number.isFinite)
      : [];
    step.sourceConfig.programEventAgencyId = agencyId;
    step.sourceConfig.programEventProgramId = programId;
    step.sourceConfig.programEventSiteId = siteId;
    step.sourceConfig.selectedProgramEventSlotIds = selectedSlotIds;
    const detail = shiftProgramDetailsById.value?.[programId] || null;
    const site = (Array.isArray(detail?.sites) ? detail.sites : [])
      .find((row) => Number(row?.id) === Number(siteId)) || null;
    const slots = getShiftProgramSiteSlots(siteId);
    const existingByEntityId = new Map(
      (Array.isArray(step.options) ? step.options : [])
        .filter((opt) => Number(opt?.entityId || 0))
        .map((opt) => [Number(opt.entityId), opt])
    );
    const providerIdsFromStaff = Array.isArray(detail?.staff)
      ? detail.staff
        .filter((s) => s && (s.is_active === true || s.is_active === 1))
        .map((s) => Number(s.user_id || s.userId || 0))
        .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const providerUserIdsCsv = Array.from(new Set(providerIdsFromStaff)).join(',');
    const options = selectedSlotIds
      .map((slotId) => {
        const slot = slots.find((row) => Number(row?.id) === Number(slotId));
        const existing = existingByEntityId.get(Number(slotId)) || {};
        if (!slot) return null;
        return {
          id: `reg_program_event_${slot.id}`,
          label: `${String(detail?.name || 'Program Event')} - ${formatProgramEventSlotLabel(slot)}`,
          description: String(existing.description || String(site?.name || '').trim()),
          entityType: 'program_event',
          entityId: Number(slot.id),
          sourceProgramId: programId,
          sourceSiteId: siteId,
          videoJoinUrl: String(existing.videoJoinUrl || '').trim(),
          costDollars: Math.max(0, Number(existing.costDollars || 0) || 0),
          paymentLinkUrl: String(existing.paymentLinkUrl || '').trim(),
          providerUserIdsCsv: String(existing.providerUserIdsCsv || step.providerUserIdsCsv || providerUserIdsCsv || '').trim(),
          scheduleBlocks: Array.isArray(existing.scheduleBlocks) && existing.scheduleBlocks.length
            ? existing.scheduleBlocks
            : [{
                id: `sched_program_event_${slot.id}`,
                label: String(site?.name || detail?.name || 'Program Event'),
                startDate: '',
                endDate: '',
                startTime: String(slot?.start_time || '').slice(0, 5),
                endTime: String(slot?.end_time || '').slice(0, 5),
                sequenceDays: 1
              }],
          frequencyLabel: String(existing.frequencyLabel || formatProgramEventSlotLabel(slot)).trim(),
          termsSummary: String(existing.termsSummary || '').trim()
        };
      })
      .filter(Boolean);
    step.options = options;
  } else if (sourceType === 'class') {
    const orgId = Number(step.sourceConfig.learningOrganizationId || 0) || null;
    step.sourceConfig.learningOrganizationId = orgId;
    const selected = Array.isArray(step.sourceConfig.selectedClassIds)
      ? step.sourceConfig.selectedClassIds.map((id) => Number(id)).filter(Number.isFinite)
      : [];
    step.sourceConfig.selectedClassIds = selected;
    const classes = getLearningClassesForOrganization(orgId);
    const existingByEntityId = new Map(
      (Array.isArray(step.options) ? step.options : [])
        .filter((opt) => Number(opt?.entityId || 0))
        .map((opt) => [Number(opt.entityId), opt])
    );
    const options = selected
      .map((id) => {
        const klass = classes.find((row) => Number(row.id) === Number(id));
        const detail = classDetailsById.value?.[Number(id)] || null;
        const defaults = deriveRegistrationDefaultsFromClass(klass, detail);
        if (klass) {
          const existing = existingByEntityId.get(Number(klass.id)) || {};
          return {
            id: `reg_class_${klass.id}`,
            label: String(klass.class_name || klass.title || klass.class_code || `Class ${klass.id}`),
            description: String(existing.description || ''),
            entityType: 'class',
            entityId: Number(klass.id),
            videoJoinUrl: String(existing.videoJoinUrl || defaults.videoJoinUrl || '').trim(),
            costDollars: Math.max(0, Number(existing.costDollars || defaults.costDollars || 0) || 0),
            paymentLinkUrl: String(existing.paymentLinkUrl || defaults.paymentLinkUrl || '').trim(),
            providerUserIdsCsv: String(existing.providerUserIdsCsv || defaults.providerUserIdsCsv || '').trim(),
            scheduleBlocks: Array.isArray(existing.scheduleBlocks) && existing.scheduleBlocks.length
              ? existing.scheduleBlocks
              : (Array.isArray(defaults.scheduleBlocks) ? defaults.scheduleBlocks : []),
            frequencyLabel: String(existing.frequencyLabel || defaults.frequencyLabel || '').trim(),
            termsSummary: String(existing.termsSummary || defaults.termsSummary || '').trim()
          };
        }
        const existing = existingByEntityId.get(Number(id));
        if (!existing) return null;
        return {
          id: existing.id || `reg_class_${id}`,
          label: String(existing.label || `Class ${id}`),
          description: String(existing.description || ''),
          entityType: 'class',
          entityId: Number(id),
          videoJoinUrl: String(existing.videoJoinUrl || '').trim(),
          costDollars: Math.max(0, Number(existing.costDollars || 0) || 0),
          paymentLinkUrl: String(existing.paymentLinkUrl || '').trim(),
          providerUserIdsCsv: String(existing.providerUserIdsCsv || '').trim(),
          scheduleBlocks: Array.isArray(existing.scheduleBlocks) ? existing.scheduleBlocks : [],
          frequencyLabel: String(existing.frequencyLabel || '').trim(),
          termsSummary: String(existing.termsSummary || '').trim()
        };
      })
      .filter(Boolean);
    step.options = options;
  } else if (sourceType === 'agency_catalog') {
    step.options = [];
  } else {
    const entityType = sourceType === 'event' ? 'event' : 'manual';
    step.options = (Array.isArray(step.options) ? step.options : [])
      .map((opt) => ({
        id: opt.id || createId('reg_opt'),
        label: String(opt.label || '').trim(),
        description: String(opt.description || '').trim(),
        entityType,
        entityId: sourceType === 'event' ? (Number(opt.entityId || 0) || null) : null,
        videoJoinUrl: String(opt.videoJoinUrl || '').trim(),
        costDollars: Math.max(0, Number(opt.costDollars || 0) || 0),
        paymentLinkUrl: String(opt.paymentLinkUrl || '').trim(),
        providerUserIdsCsv: String(opt.providerUserIdsCsv || '').trim(),
        scheduleBlocks: Array.isArray(opt.scheduleBlocks) ? opt.scheduleBlocks : [],
        frequencyLabel: String(opt.frequencyLabel || '').trim(),
        termsSummary: String(opt.termsSummary || '').trim()
      }));
  }
};

const onRegistrationSourceTypeChange = (step) => {
  if (!step || step.type !== 'registration') return;
  step.sourceConfig = {
    selectedProgramOrganizationIds: [],
    learningOrganizationId: null,
    selectedClassIds: [],
    programEventAgencyId: null,
    programEventProgramId: null,
    programEventSiteId: null,
    selectedProgramEventSlotIds: []
  };
  step.options = [];
  if (step.sourceType === 'manual' || step.sourceType === 'event') {
    addRegistrationOption(step);
  }
  refreshRegistrationStepOptions(step);
};

const onRegistrationRuleChange = (step) => {
  if (!step || step.type !== 'registration') return;
  if (!step.selectionRules || typeof step.selectionRules !== 'object') {
    step.selectionRules = { allowMultiple: false, minSelections: 1, maxSelections: 1 };
  }
  step.selectionRules.allowMultiple = !!step.selectionRules.allowMultiple;
  const min = Number(step.selectionRules.minSelections || 0);
  step.selectionRules.minSelections = Number.isFinite(min) ? Math.max(0, Math.trunc(min)) : 0;
  if (!step.selectionRules.allowMultiple) {
    step.selectionRules.maxSelections = 1;
    if (step.selectionRules.minSelections > 1) step.selectionRules.minSelections = 1;
  } else {
    const max = Number(step.selectionRules.maxSelections || 0);
    step.selectionRules.maxSelections = Number.isFinite(max) && max > 0 ? Math.trunc(max) : null;
    if (step.selectionRules.maxSelections && step.selectionRules.minSelections > step.selectionRules.maxSelections) {
      step.selectionRules.minSelections = step.selectionRules.maxSelections;
    }
  }
};

const onRegistrationLearningOrganizationChange = async (step) => {
  if (!step || step.type !== 'registration') return;
  const orgId = Number(step.sourceConfig?.learningOrganizationId || 0) || null;
  step.sourceConfig.selectedClassIds = [];
  if (orgId) await loadLearningClassesForOrganization(orgId);
  refreshRegistrationStepOptions(step);
};

const onRegistrationClassSelectionChange = async (step) => {
  if (!step || step.type !== 'registration') return;
  refreshRegistrationStepOptions(step);
  await hydrateSelectedClassDetails(step);
};

const onRegistrationProgramEventAgencyChange = async (step) => {
  if (!step || step.type !== 'registration') return;
  step.sourceConfig.programEventProgramId = null;
  step.sourceConfig.programEventSiteId = null;
  step.sourceConfig.selectedProgramEventSlotIds = [];
  const agencyId = Number(step.sourceConfig.programEventAgencyId || 0) || null;
  if (agencyId) await loadShiftProgramsForAgency(agencyId);
  refreshRegistrationStepOptions(step);
};

const onRegistrationProgramEventProgramChange = async (step) => {
  if (!step || step.type !== 'registration') return;
  step.sourceConfig.programEventSiteId = null;
  step.sourceConfig.selectedProgramEventSlotIds = [];
  const programId = Number(step.sourceConfig.programEventProgramId || 0) || null;
  if (programId) await loadShiftProgramDetail(programId);
  refreshRegistrationStepOptions(step);
};

const onRegistrationProgramEventSiteChange = async (step) => {
  if (!step || step.type !== 'registration') return;
  step.sourceConfig.selectedProgramEventSlotIds = [];
  const programId = Number(step.sourceConfig.programEventProgramId || 0) || null;
  const siteId = Number(step.sourceConfig.programEventSiteId || 0) || null;
  if (programId && siteId) await loadShiftSlotsForSite(programId, siteId);
  refreshRegistrationStepOptions(step);
};

const removeOption = (field, idx) => {
  field.options.splice(idx, 1);
};

const buildPayloadFromSteps = () => {
  const intakeSteps = sanitizeSteps(form.intakeSteps, { formType: form.formType }).map((step) => ({ ...step }));
  intakeSteps.forEach((step) => {
    if (step?.type === 'registration') {
      refreshRegistrationStepOptions(step);
      onRegistrationRuleChange(step);
    }
  });
  const intakeFields = [];
  const allowedDocumentTemplateIds = [];
  intakeSteps.forEach((step) => {
    if (step.type === 'questions' || step.type === 'clinical_questions') {
      (step.fields || []).forEach((f) => {
        if (f.type === 'info') return;
        intakeFields.push({
          key: f.key || f.id,
          label: f.label || f.key,
          type: f.type,
          required: !!f.required,
          options: f.options || [],
          helperText: f.helperText || '',
          showIf: f.showIf || null,
          scope: step.type === 'clinical_questions' ? 'clinical' : (f.scope || 'submission')
        });
      });
    } else if (step.type === 'document' && step.templateId) {
      allowedDocumentTemplateIds.push(step.templateId);
    }
    // upload steps don't add to allowedDocumentTemplateIds
  });
  return { intakeSteps, intakeFields, allowedDocumentTemplateIds };
};

const filterScope = ref('all');
const filterStatus = ref('active');
const filterFormType = ref('all');
const filterOrgId = ref('all');
const filteredLinks = computed(() => {
  let list = links.value;
  if (filterStatus.value === 'active') {
    list = list.filter((l) => !!l.is_active);
  } else if (filterStatus.value === 'inactive') {
    list = list.filter((l) => !l.is_active);
  }
  if (filterScope.value !== 'all') {
    list = list.filter((l) => l.scope_type === filterScope.value);
  }
  if (filterFormType.value !== 'all') {
    list = list.filter((l) => (l.form_type || 'intake') === filterFormType.value);
  }
  if (filterOrgId.value !== 'all') {
    const target = Number(filterOrgId.value);
    list = list.filter((l) => Number(l.organization_id) === target);
  }
  return list;
});

onMounted(async () => {
  await fetchData();
  await openEditorFromQuery();
  if (!showForm.value) {
    await openCreateFromCompanyEventQuery();
  } else {
    await clearCompanyEventEnrollmentQueryParams();
  }
});

watch(
  () => [route.query?.editIntakeLinkId, route.query?.editId, route.query?.jobDescriptionId],
  async () => {
    await openEditorFromQuery();
  }
);

watch(
  () => route.query?.companyEventId,
  async () => {
    if (showForm.value) return;
    await openCreateFromCompanyEventQuery();
  }
);
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.quick-create {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  margin-bottom: 16px;
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 860px;
  max-width: 95vw;
  max-height: 92vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
}
.modal-body {
  padding: 14px;
  overflow: auto;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
}

.step-builder {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: #f9fafb;
}

.step-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.flow-legend-guardian {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #166534;
  margin-bottom: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  line-height: 1.35;
}

.flow-legend-guardian-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #22c55e;
  box-shadow: 0 0 0 2px #dcfce7;
}

.btn-flow-add-guardian {
  background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%) !important;
  border-color: #86efac !important;
  color: #14532d !important;
  font-weight: 600;
}

.btn-flow-add-guardian:hover {
  border-color: #4ade80 !important;
  color: #052e16 !important;
  background: linear-gradient(180deg, #ecfdf5 0%, #bbf7d0 100%) !important;
}

.step-card--guardian-flow {
  border-color: #86efac;
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.12);
}

.step-flow-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin-left: 8px;
}

.step-flow-pill--guardian {
  background: #dcfce7;
  color: #14532d;
  border: 1px solid #86efac;
}

.step-flow-pill--clinical {
  background: #ede9fe;
  color: #4c1d95;
  border: 1px solid #c4b5fd;
}

.step-flow-pill--demographics {
  background: #fef9c3;
  color: #713f12;
  border: 1px solid #fde047;
}

.form-group-guardian-toggle .form-help-guardian {
  margin-top: 6px;
  color: #166534;
}

.programmed-step-pill {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e40af;
  font-size: 12px;
  font-weight: 600;
}

.step-actions-bottom {
  margin-top: 12px;
  margin-bottom: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.step-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  background: #fff;
  margin-bottom: 12px;
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.step-header-start {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.step-controls {
  display: flex;
  gap: 6px;
}

.question-label-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.question-label-input {
  flex: 1;
  min-width: 0;
}
.question-row,
.option-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.question-block {
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}

.question-controls {
  display: flex;
  gap: 6px;
  align-items: center;
}

.question-index {
  flex: 0 0 32px;
  text-align: center;
  font-weight: 600;
  color: var(--text-secondary);
}

.question-row input,
.option-row input,
.question-row select {
  flex: 1;
}

.option-row input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  color: var(--text-primary);
  font-size: 13px;
  min-width: 0;
}

.option-row .btn {
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1;
  height: 28px;
  min-width: 28px;
}

.option-list {
  margin: 8px 0 12px 0;
}
.template-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px;
}
.template-group-title {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 6px;
}
.template-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.subtitle {
  color: var(--text-secondary);
}
.template-panel {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.template-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.template-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}
.muted {
  color: var(--text-secondary);
  font-size: 12px;
}

/* Searchable document template dropdown */
.document-step-select-wrap {
  position: relative;
}
.document-step-trigger {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  font-size: 14px;
  cursor: pointer;
  color: var(--text-primary);
}
.document-step-trigger:hover {
  border-color: var(--primary, #2563eb);
}
.document-step-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
  overflow: hidden;
}
.document-step-filter {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  box-sizing: border-box;
}
.document-step-filter:focus {
  outline: 2px solid var(--primary, #2563eb);
  outline-offset: -2px;
}
.document-step-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}
.document-step-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  border: none;
  background: none;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-primary);
}
.document-step-option:hover {
  background: var(--bg-alt, #f3f4f6);
}
.document-step-option.selected {
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary, #2563eb);
}

/* Question Sets panel */
.question-sets-panel {
  background: #f8fafc;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 24px;
}
.question-sets-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.question-set-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.question-set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 10px 14px;
}
.question-set-editor {
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

/* Question set picker modal — rendered via Teleport so z-index is relative to body */
.qset-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qset-modal-box {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.22);
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}
.question-set-picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border, #f3f4f6);
}
.question-set-picker-row:last-child {
  border-bottom: none;
}
.qset-inserted-notice {
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  color: #065f46;
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 0.9rem;
}
.addon-preview-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 1450;
  display: flex;
  align-items: center;
  justify-content: center;
}
.addon-preview-modal-box {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.22);
  width: 100%;
  max-height: 84vh;
  overflow-y: auto;
}
.addon-preview-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.addon-preview-item {
  text-align: left;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.addon-preview-item:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}
.addon-preview-header-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.addon-preview-form {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
}
.communications-campaign-card {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: #fff;
  padding: 12px;
  margin-bottom: 10px;
}
.communications-disclosure {
  color: #475569;
  font-size: 0.92rem;
}
.communications-provider-terms {
  margin: 8px 0 0 18px;
  padding: 0;
  color: #475569;
  font-size: 0.92rem;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.il-ce-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.il-ce-wrap--warn {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
}
.il-ce-select--warn {
  border-color: #f59e0b;
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.25);
}
.il-ce-warn {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 10px 0 6px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #fbbf24;
  background: #fff7ed;
  color: #9a3412;
  font-size: 13px;
  line-height: 1.45;
}
.il-ce-warn-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f59e0b;
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.il-ce-warn-body strong {
  display: block;
  margin-bottom: 2px;
  color: #7c2d12;
}
</style>
