<template>
  <section class="pu-section">
    <header v-if="!hideHeading" class="pu-section-head">
      <h1>{{ section.meta?.title || section.key }}</h1>
      <p>{{ section.meta?.description }}</p>
    </header>
    <ProviderUpdateTrainingGuides :guides="section.trainingGuides || []" :section-key="section.key" :base="reviewBase" :agency-id="agencyId" />
    <p v-if="localError" class="err" role="alert">{{localError}}</p>
    <fieldset class="preview-fields" :disabled="recipient?.previewOnly && !['pin','office_schedule','public_availability','public_profile_review','office_review','admin_update','handbook','amendments'].includes(section.key)">

    <!-- Handbook -->
    <WorkplaceHandbookReader
      v-if="section.key === 'handbook'"
      :access-mode="mode"
      :token="token"
      :agency-id="agencyId"
      :recipient-id="recipient?.id"
      :push-id="recipient?.pushId"
      :admin-update-id="recipient?.attachedAdminUpdateId"
      :preview-mode="!!recipient?.previewOnly"
      :saving-review="saving"
      :review-error="localError"
      :review-completed="section.completed"
      review-label="Save handbook review and continue"
      @acknowledged="saveHandbookReview"
    />

    <!-- Admin Update — same in-app published page as /admin-update/:token -->
    <ProviderUpdateAdminUpdateEmbed
      v-else-if="section.key === 'admin_update'"
      :mode="mode"
      :token="token"
      :agency-id="agencyId"
      :update-id="recipient?.attachedAdminUpdateId"
      :busy="saving"
      :preview-mode="!!recipient?.previewOnly"
      @complete="markComplete"
    />

    <div v-else-if="section.key === 'pin'" class="pu-panel">
      <p><strong>To complete this step:</strong> create or reset your six-digit Quick View code, save it somewhere safe, then choose the confirmation button below. App-password preparation and optional passkeys do not block this step.</p>
      <template v-if="newPasscode || !quickViewAlreadySet"><button type="button" class="pu-btn" @click="showQuickViewHelp=!showQuickViewHelp">What’s Quick View?</button>
      <div v-if="showQuickViewHelp" class="qv-help"><h3>Your app essentials on your phone</h3><p>Quick View gives you quick access to your assigned work, messages, schedule, and meeting links without opening the full dashboard. Your private six-digit code unlocks your access; it is separate from your account password.</p><p>Save your agency link to your phone’s home screen. Keep your device locked and store your code somewhere safe. Do not share it.</p><button v-if="section.data?.quickViewVideoUrl" type="button" class="pu-btn training-video-button" @click="openTrainingVideo({url:section.data.quickViewVideoUrl,title:'Quick View instructions',trigger:$event.currentTarget})">▶ Watch Quick View instructions</button><p v-else>Video instructions can be added to the Quick View section of the Admin Update. You can create your code now.</p><button type="button" class="pu-btn" @click="showQuickViewHelp=false">Continue without watching a video</button></div>
      <p>Your agency’s Quick View: <a :href="recipient?.quickViewUrl" target="_blank" rel="noopener noreferrer">{{recipient?.quickViewUrl}}</a></p>
      <p>Everyone needs a six-digit Quick View code, including people who sign in with Google. Before continuing, write your code down and keep it in a safe place, or save it in your password manager. It will be displayed only once. Your invitation identifies your account; no extra sign-in is needed to create this code.</p>
      <p v-if="newPasscode" ref="quickViewFeedback" tabindex="-1" role="status" data-search-private>Your new code: <strong>{{newPasscode}}</strong>. Write it down and keep it in a safe place, or save it in your password manager now. It will not be displayed again. Do not share it.</p>
      <button v-if="!newPasscode" type="button" class="pu-btn primary" :disabled="saving || recipient?.previewOnly" @click="setupQuickView">{{ saving ? 'Creating your code…' : 'Create my six-digit Quick View code' }}</button>
      </template><p v-else-if="quickViewResetShown">Your new six-digit Quick View code is shown below. Save it somewhere safe, then confirm this step.</p><p v-else-if="!quickViewLocked">Your six-digit Quick View code is already set and will not be displayed again. If you have it saved, confirm below. If you do not have it, reset it here first. This is separate from your Google or app password.</p>
      <p v-if="quickViewLocked" class="err" role="alert">Your Quick View code is locked. Reset it below before confirming this step.</p>
      <p v-if="quickViewError" ref="quickViewFeedback" tabindex="-1" role="alert" class="err">{{ quickViewError }}</p>
      <div v-if="!newPasscode || quickViewLocked" class="pu-actions">
        <button v-if="quickViewAlreadySet || quickViewError" type="button" class="pu-btn" :disabled="saving || recipient?.previewOnly" @click="showQuickViewReset=true">Reset a forgotten or locked code here</button>
        <button type="button" class="pu-btn" :disabled="saving || checkingQuickView || quickViewResetBusy || recipient?.previewOnly" @click="refreshQuickViewStatus">{{ checkingQuickView ? 'Checking your code…' : 'Check my code status' }}</button>
      </div>
      <div v-if="showQuickViewReset && !recipient?.previewOnly">
        <p>Resetting an existing code requires your own account sign-in. If needed, <a :href="quickViewAccountUrl" target="_blank" rel="noopener noreferrer">sign in to your account</a>, return here, and choose Try again. Google sign-in accounts do not need an app password.</p>
        <QuickViewPrivacyPanel v-if="recipient?.providerUserId" :expected-user-id="recipient.providerUserId" :agency-id="agencyId" passcode-only @passcode-changed="onQuickViewReset" @busy-change="value => quickViewResetBusy=value" />
        <p v-else role="alert">Your account details could not be loaded. Refresh this update before resetting your code.</p>
      </div>
      <button v-if="newPasscode || quickViewAlreadySet" type="button" class="pu-btn primary" :disabled="saving || checkingQuickView || quickViewResetBusy || quickViewLocked || recipient?.previewOnly" @click="markComplete({quickViewConfirmed:true,codeStoredSafely:true})">{{ saving ? 'Saving your code confirmation…' : newPasscode || quickViewResetShown ? 'I saved my code somewhere safe — continue' : 'I have my code saved safely — save and continue' }}</button>
      <p v-if="!newPasscode && !showQuickViewReset">You can also reset your code in <a :href="quickViewAccountUrl" target="_blank" rel="noopener noreferrer">Accounts &amp; access</a>. When you return, choose Check my code status here.</p>
      <p><strong>Add Quick View to your home screen:</strong> On iPhone/iPad, open the agency link in Safari → Share → Add to Home Screen. On Android, open it in Chrome → ⋮ → Add to home screen or Install app. Save your code in your password manager.</p>
      <ProviderUpdateSecuritySetup :user-id="recipient?.providerUserId" :sign-in="recipient?.signIn" :agency-slug="recipient?.agencySlug || route.params.organizationSlug" :preview="!!recipient?.previewOnly" />
    </div>

    <!-- Typical availability -->
    <div v-else-if="section.key === 'work_hours'" class="pu-panel">
      <TypicalAvailabilityInput v-model="typicalAvailability" :disabled="saving || recipient?.previewOnly" />
      <button class="pu-btn primary" :disabled="saving" @click="markComplete({typicalAvailability:typicalAvailability.split(',').map(s=>s.trim()).filter(Boolean)})">Save &amp; confirm typical availability</button>
    </div>

    <ProviderUpdateOfficeReview ref="officeReviewEditor" v-else-if="section.key==='office_review'" :agency-id="agencyId" :mode="mode" :token="token" :data="section.data" :readonly="!!recipient?.previewOnly" @navigate="key => $emit('navigate',key)" @complete="markComplete" />
    <!-- Office schedule -->
    <ProviderUpdateOfficeSchedule
      v-else-if="['office_schedule','public_availability','public_profile_review'].includes(section.key)"
      :view="section.key==='public_availability'?'settings':section.key==='public_profile_review'?'profile':'calendar'"
      :agency-id="agencyId"
      :mode="mode"
      :token="token"
      :data="section.data"
      :readonly="!!recipient?.previewOnly"
      @complete="markComplete"
    />

    <!-- Profile blurb -->
    <div v-else-if="section.key === 'profile_blurb'" class="pu-panel">
      <p class="mode-tag">{{ blurb ? 'Confirm or update your profile blurb' : 'Set your profile blurb' }}</p>
      <p v-if="!blurb" class="hint">Example: “Hi, I’m [name]. I support [people you work with] with [your focus areas]. My approach is [describe how you work]. Together, we [what clients can expect].” Replace brackets with accurate details.</p>
      <button v-if="!blurb" type="button" class="pu-btn" @click="blurb=`Hi, I’m ${recipient?.firstName || '[name]'}. I support [people you work with] with [your focus areas]. My approach is [describe how you work]. Together, we [what clients can expect].`">Use editable example</button>
      <textarea v-model="blurb" rows="5" class="input" placeholder="Short introduction for schools and families…" />
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveBlurb">
          {{ saving ? 'Saving…' : blurb ? 'Save & confirm' : 'Save blurb' }}
        </button>
      </div>
    </div>

    <!-- Specialties -->
    <div v-else-if="section.key === 'specialties'" class="pu-panel">
      <ProviderFocusEditor ref="focusEditor" require-three :show-errors="focusErrors" v-if="section.data?.focusGroups" v-model="clinicalFocus" :groups="section.data.focusGroups" />
      <button class="pu-btn primary" :disabled="saving || !section.data?.focusGroups?.length" @click="saveSpecialties">Save &amp; confirm focus areas</button>
    </div>

    <div v-else-if="section.key === 'supervision_hours'" class="pu-panel">
      <p v-if="reviewLoading">Loading supervision hours…</p>
      <template v-else-if="reviewContext.supervised">
        <table class="hours-table"><thead><tr><th>Source</th><th>Individual</th><th>Group</th><th>Total</th></tr></thead><tbody>
          <tr v-for="row in supervisionRows" :key="row.key"><th>{{ row.label }}</th><td>{{ row.value.individual }}</td><td>{{ row.value.group }}</td><td>{{ row.value.total }}</td></tr>
        </tbody></table>
        <p>Current recorded balance minus calculated total: <strong>{{ section.data?.breakdown?.difference ?? 'Unavailable' }} hours</strong>.</p>
        <p>Starting hours predate app tracking. Imported hours come from billing reports. App-recorded hours come from finalized supervision sessions, not payroll credits. These are separate sources. Request a correction if a prior report includes hours already counted in the app.</p>
        <p>You can suggest a correction below. Submitting a suggestion does not change your recorded hours.</p><div class="pu-actions"><button type="button" class="pu-btn" @click="supervisionReview.decision = 'correction_requested'">Suggest a correction</button></div><label class="field"><span>Review</span><select v-model="supervisionReview.decision" class="input"><option value="confirmed">These hours are correct</option><option value="correction_requested">Request a correction</option></select></label>
        <template v-if="supervisionReview.decision === 'correction_requested'">
          <label class="field"><span>Requested total hours</span><input v-model.number="supervisionReview.requestedHours" type="number" min="0" step="0.01" class="input" /></label>
          <label class="field"><span>Why should the hours change?</span><textarea v-model="supervisionReview.reason" class="input" /></label>
          <label class="field"><span>Supporting record (optional)</span><input type="file" accept="application/pdf,image/*" @change="uploadReviewFile($event, 'supervision')" /></label>
          <p>Submitted corrections are reviewed before the supervision ledger changes.</p>
        </template>
      </template>
      <p v-else-if="!reviewLoading">No supervisor is currently assigned for this agency.</p>
      <p v-if="supervisionReview.documentId">Supporting record saved to your file.</p>
      <p v-if="localError" class="err">{{ localError }}</p>
      <button :disabled="saving || reviewLoading || !!localError" class="pu-btn primary" @click="markComplete({ ...supervisionReview })">{{ supervisionReview.decision === 'correction_requested' ? 'Submit correction for review' : 'Confirm supervision review' }}</button>
    </div>

    <!-- License -->
    <div v-else-if="section.key === 'license'" class="pu-panel">
      <p class="mode-tag">See and update license details</p>
      <label class="field"><span>License type / number</span><input v-model="license.number" class="input" /></label>
      <label class="field"><span>Issue date</span><input v-model="license.issued" type="date" class="input" /></label>
      <label class="field"><span>License document</span><input type="file" accept="application/pdf,image/*" @change="uploadReviewFile($event, 'license')" /></label>
      <p v-if="license.hasUpload"><a class="pu-btn" :href="`/api${reviewBase}/assets/license?open=1&agencyId=${agencyId}`" target="_blank" rel="noopener noreferrer">Open your uploaded license</a></p>
      <p v-if="localError" class="err">{{ localError }}</p>
      <label class="field"><span>Expiration date</span><input v-model="license.expires" type="date" class="input" /></label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveLicense">
          {{ saving ? 'Saving…' : 'Save & confirm license' }}
        </button>
      </div>
    </div>

    <!-- Contact -->
    <div v-else-if="section.key === 'contact_info'" class="pu-panel">
      <p>A personal email address is required to complete this section. Adding it does not change your email notification choices. You can save your progress and return later.</p>
      <label v-for="field in contactFields" :key="field.key" class="field"><span>{{field.label}}{{field.key === 'personalEmail' ? ' (required)' : ''}}</span><input v-model="contact[field.key]" class="input" :type="field.key === 'personalEmail' ? 'email' : 'text'" :required="field.key === 'personalEmail'" :autocomplete="field.autocomplete" /></label>
      <p v-if="localError" class="err" role="alert">{{localError}}</p>
      <button type="button" class="pu-btn primary" :disabled="saving" @click="saveContact">Save &amp; confirm contact</button>
    </div>

    <!-- Credential display -->
    <div v-else-if="section.key === 'credential_display'" class="pu-panel">
      <p>Current role label: <strong>{{ section.data?.displayRole?.currentLabel || 'Not set' }}</strong></p>
      <p v-if="section.data?.displayRole?.fixed">Your display label is <strong>{{ section.data.displayRole.label }}</strong>.</p>
      <label v-else class="field"><span>Public role label</span><select v-model="displayLabel" class="input">
        <option v-if="displayLabel && !['Counselor','Provider','Therapist','Social Worker'].includes(displayLabel)" :value="displayLabel">{{displayLabel}} (current)</option>
        <option v-for="label in ['Counselor','Provider','Therapist','Social Worker']" :key="label">{{label}}</option>
      </select></label>
      <p v-if="section.data?.displayRole?.candidate">Candidate appears on its own line in your email signature and business card.</p>
      <label class="field"><span>Gender on your public profile (optional)</span><select v-model="publicGender" class="input"><option value="">Not shown / prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Nonbinary</option><option v-if="publicGender && !['male','female','nonbinary'].includes(publicGender)" :value="publicGender">{{publicGender}} (current)</option></select><small>This choice is public and helps clients filter for a provider. It is your own selection; no gender is inferred.</small></label>
      <ProviderSessionLanguages v-model="sessionLanguages" :error="languageError" />
      <CredentialPicker v-model="credential" :disabled="saving" />
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="saveCredentialDisplay">
          Confirm credential display
        </button>
      </div>
    </div>

    <ProviderUpdateSchoolSchedule v-else-if="section.key === 'school_availability'" :base="reviewBase" :agency-id="agencyId" :readonly="!!recipient?.previewOnly" @complete="markComplete" />

    <!-- Preferred days -->
    <div v-else-if="section.key === 'preferred_days'" class="pu-panel">
      <div class="days">
        <label v-for="d in weekdays" :key="d" class="day">
          <input v-model="preferredDays" type="checkbox" :value="d" />
          {{ d }}
        </label>
      </div>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ preferredDays })">
          Confirm preferred days
        </button>
      </div>
    </div>

    <!-- Directory photo -->
    <div v-else-if="section.key === 'directory_photo'" class="pu-panel">
      <img v-if="photoUrl" :src="photoUrl" alt="Your current directory photo" class="directory-photo" />
      <p v-else>{{section.data?.hasPhoto?'Loading your current photo…':'No directory photo is saved yet.'}}</p>
      <p>Use a clear, well-lit, professional-looking photo with your face centered and visible. A simple indoor or natural outdoor background is welcome. Avoid other people, heavy filters, sunglasses, and distracting backgrounds.</p>
      <label class="field"><span>Upload a new profile photo</span><input type="file" accept="image/png,image/jpeg,image/webp" :disabled="saving || recipient?.previewOnly" @change="uploadPhoto" /></label><p class="hint">PNG, JPG, or WebP, up to 8 MB. This replaces the photo displayed on your profile.</p>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ photoConfirmed: true })">
          Confirm directory photo
        </button>
      </div>
    </div>

    <!-- Notification prefs -->
    <div v-else-if="section.key === 'notification_prefs'">
      <ProviderPersonalEmailPreferences v-if="showPersonalEmailPreferences" v-model="emailPreference" :readonly="!!recipient?.previewOnly" :transition-planned="!!recipient?.signIn?.transitionPlanned" />
      <ProviderContactHours :base="reviewBase" :agency-id="agencyId" :readonly="!!recipient?.previewOnly" />
      <p v-if="section.data?.hasSchoolAssignments" class="pu-panel">School visits: reminders do not require families to confirm attendance. Appointment-reply alerts below also cover school absences and scheduling concerns. Review those replies in the app; they do not automatically cancel the visit.</p>
      <StaffCommunicationChoices :initial="section.data?.communicationChoices" :agency-id="agencyId" external-save :readonly="!!recipient?.previewOnly" :busy="saving" @save="saveCommunication" />
      <p v-if="localError" role="alert">{{ localError }}</p>
    </div>

    <ProviderUpdateAmendment v-else-if="section.key === 'amendments'" :base="reviewBase" :agency-id="agencyId || recipient?.agencyId" :preview-only="!!recipient?.previewOnly" @complete="markComplete">
      <template #unassigned>
        <p>{{ amendmentPlan?.title || 'Assigned amendment agreement' }}</p>
        <p v-if="resolvedJobDescription?.jobTitle">Your role: {{ resolvedJobDescription.jobTitle }}</p>
        <ul v-if="amendmentTasks.length" class="amendment-task-list"><li v-for="task in amendmentTasks" :key="task.id"><span>{{ task.title }}</span><span class="badge">{{ task.status === 'completed' ? 'Signed' : 'Pending signature' }}</span></li></ul>
        <p v-else>No amendment has been released for this update yet.</p>
        <a v-if="amendmentTasks.length && !recipient?.previewOnly" class="pu-btn" :href="linkHref" target="_blank" rel="noopener">Open My Documents →</a>
        <button class="pu-btn primary" :disabled="saving || recipient?.previewOnly || !allAmendmentsSigned" @click="markComplete({ amendmentPlan })">{{ allAmendmentsSigned ? 'Confirm signed amendment agreement' : 'Assigned amendment signature required' }}</button>
      </template>
    </ProviderUpdateAmendment>

    <!-- Client Fall action items -->
    <div v-else-if="section.key === 'client_fall_update'" class="pu-panel">
      <p class="muted">
        “Mark Being Seen” confirms that a returning client from last fall has actually resumed services this school year. Enter the first completed session date this year—not a planned appointment. This is a temporary manual check during our EHR transition; once the EHR connection is active and verified to update service status, completed sessions will replace this manual step.
      </p>
      <p class="muted">Save the steps you have completed. A client may stay on this list when another step is pending. After reviewing the list, select “Save changes &amp; mark reviewed” to finish this section.</p>
      <p v-if="fallSaveNotice" class="fall-save-notice" role="status">{{ fallSaveNotice }}</p>
      <p v-if="fallLoading" class="muted">Loading action-item clients…</p>
      <ul v-else-if="fallClients.length" class="fall-list">
        <li v-for="c in fallClients" :key="c.id">
          <div>
            <strong>{{ c.preferredName || c.firstName }} {{ c.lastName }}</strong>
            <span class="muted"> · {{ c.schoolName || 'School' }}</span>
            <div class="badge">{{ c.lifecycleAction?.label || 'Action needed' }}</div><ul class="client-action-details"><li v-for="item in c.actionItems||[]" :key="item">{{item}}</li></ul>
          </div>
          <fieldset v-if="['confirm_services_started','provider_intake'].includes(c.lifecycleAction?.actionKey)" class="client-inline-actions preview-fields" :disabled="saving || fallLoading">
            <template v-if="c.lifecycleAction.actionKey === 'provider_intake'">
              <label class="field"><span>Parent / guardian contacted on</span><input v-model="c.checklist.parentsContactedAt" type="date" class="input" :max="today" /></label>
              <label class="field"><span>Was contact successful?</span><select v-model="c.checklist.parentsContactedSuccessful" class="input"><option value="">Choose</option><option :value="true">Yes</option><option :value="false">No — follow-up needed</option></select></label>
            </template>
            <label class="field"><span>{{c.lifecycleAction.actionKey === 'confirm_services_started' ? 'First completed session this school year' : 'First completed service (leave blank if pending)'}}</span><input v-model="c.checklist.firstServiceAt" type="date" class="input" :max="today" /></label>
            <button type="button" class="pu-btn primary" :disabled="saving || recipient?.previewOnly" @click="saveFallClient(c)">{{c.lifecycleAction.actionKey === 'confirm_services_started' ? 'Mark being seen' : 'Save completed steps'}}</button>
            <p v-if="fallSaveMessages[c.id]" class="fall-save-notice">{{ fallSaveMessages[c.id] }}</p>
            <p v-if="fallSaveErrors[c.id]" class="err" role="alert">{{ fallSaveErrors[c.id] }}</p>
          </fieldset>
          <a
            v-else-if="c.schoolOrganizationId"
            class="pu-btn sm"
            :href="orgPath(`/school-portal/${c.schoolOrganizationId}`)"
            target="_blank"
            rel="noopener"
          >
            Open portal →
          </a>
          <ProviderUpdateHelp :base="reviewBase" :agency-id="agencyId" :client="c" :readonly="!!recipient?.previewOnly" />
        </li>
      </ul>
      <p v-else-if="!localError" class="muted">No open Fall action-item clients right now — you can mark this complete.</p>
      <div class="pu-actions">
        <button
          type="button"
          class="pu-btn"
          :disabled="fallLoading || saving"
          @click="loadFallClients"
        >
          Refresh list
        </button>
        <button
          type="button"
          class="pu-btn primary"
          :disabled="saving || fallLoading || fallLoadFailed"
          @click="markFallActionsReviewed"
        >
          Save changes &amp; mark reviewed
        </button>
      </div>
    </div>

    <!-- Link-out stubs -->
    <div v-else-if="isLink" class="pu-panel">
      <p class="muted">{{ section.meta?.previewHint || 'Open the linked tool, then mark this section complete.' }}</p>
      <a class="pu-btn" :href="linkHref" target="_blank" rel="noopener">Open →</a>
      <label class="field">
        <span>Notes (optional)</span>
        <textarea v-model="linkNote" rows="2" class="input" />
      </label>
      <div class="pu-actions">
        <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({ note: linkNote })">
          Mark complete
        </button>
      </div>
    </div>

    <div v-else-if="section.key === 'spanish_intake'" class="pu-panel"><div v-html="DOMPurify.sanitize(section.data?.bodyHtml || '')" /><button class="pu-btn primary" :disabled="saving || recipient?.previewOnly" @click="markComplete({reviewed:true})">I reviewed the intake handoff procedure</button></div>

    <!-- Fallback -->
    <div v-else class="pu-panel">
      <p class="muted">Complete this section, then mark it done.</p>
      <button type="button" class="pu-btn primary" :disabled="saving" @click="markComplete({})">Mark complete</button>
    </div>
    </fieldset>
  </section>
</template>

<script setup>
import {isValidPersonalEmail} from '../../navigation/providerUpdateContact.js';
import CredentialPicker from '../CredentialPicker.vue';
import ProviderUpdateTrainingGuides from './ProviderUpdateTrainingGuides.vue';
import ProviderSessionLanguages from './ProviderSessionLanguages.vue';
import {openTrainingVideo} from '../../utils/trainingVideo';
import {validateSessionLanguages} from '../../navigation/providerLanguages';
import DOMPurify from 'dompurify';
import ProviderUpdateAmendment from './ProviderUpdateAmendment.vue';
import ProviderUpdateSchoolSchedule from './ProviderUpdateSchoolSchedule.vue';
import ProviderFocusEditor from './ProviderFocusEditor.vue';
import {missingFocusGroups} from '../../navigation/providerFocus';
import ProviderUpdateHelp from './ProviderUpdateHelp.vue';
import StaffCommunicationChoices from '../communications/StaffCommunicationChoices.vue';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import TypicalAvailabilityInput from '../publicServices/TypicalAvailabilityInput.vue';
import WorkplaceHandbookReader from '../handbook/WorkplaceHandbookReader.vue';
import ProviderUpdateOfficeReview from './ProviderUpdateOfficeReview.vue';

import ProviderPersonalEmailPreferences from './ProviderPersonalEmailPreferences.vue';
import ProviderUpdateSecuritySetup from './ProviderUpdateSecuritySetup.vue';
import QuickViewPrivacyPanel from '../account/QuickViewPrivacyPanel.vue';
import ProviderContactHours from './ProviderContactHours.vue';
import ProviderUpdateOfficeSchedule from './ProviderUpdateOfficeSchedule.vue';
import ProviderUpdateAdminUpdateEmbed from './ProviderUpdateAdminUpdateEmbed.vue';

const props = defineProps({
  section: { type: Object, required: true },
  hideHeading: { type: Boolean, default: false },
  mode: { type: String, default: 'token' },
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  recipient: { type: Object, default: null }
});
const emit = defineEmits(['saved', 'close', 'navigate']);
const route = useRoute();

const saving = ref(false);
const localError = ref('');
const hasWorkHours = ref(true);
const blurb = ref('');
const specialties=reactive({});
const showPersonalEmailPreferences=computed(()=>props.recipient?.signIn?.retainsGoogle===false);
function saveCommunication(data){
 if(!showPersonalEmailPreferences.value)return markComplete(data);
 if(emailPreference.value.personalEmailNotify&&!['business_day','immediate'].includes(emailPreference.value.personalEmailDelayMode)){localError.value='Choose Right away or After 24 business hours for personal email reminders.';return;}
 return markComplete({...data,emailReminderPreferences:emailPreference.value});
}
const clinicalFocus=ref({top:{},excluded:{}});
const typicalAvailability=ref('');
const schoolChanges=ref('');
const photoUrl=ref('');

const newPasscode=ref('');
const quickViewCodeAcknowledged=ref(false);
const quickViewFeedback=ref(null),quickViewError=ref(''),quickViewConflict=ref(false);
const quickViewLocalStatus=ref(null),checkingQuickView=ref(false),showQuickViewReset=ref(false),quickViewResetShown=ref(false);
const quickViewResetBusy=ref(false);
const quickViewAlreadySet=computed(()=>quickViewConflict.value || !!(quickViewLocalStatus.value || props.section.data?.quickView)?.hasPasscode);
const quickViewLocked=computed(()=>!!(quickViewLocalStatus.value || props.section.data?.quickView)?.isLocked);
const quickViewAccountUrl=computed(()=>{
 const slug=props.recipient?.agencySlug || route.params.organizationSlug;
 return `${slug ? `/${encodeURIComponent(slug)}` : ''}/dashboard?tab=my&my=access`;
});
const showQuickViewHelp=ref(false);
const license = reactive({ number: '', issued: '', expires: '', hasUpload: false });
const reviewContext = ref({});
const reviewLoading = ref(false);
const supervisionReview = reactive({ decision: 'confirmed', requestedHours: null, reason: '', documentId: null, ...(props.section.key === 'supervision_hours' ? props.section.data : {}) });
const reviewBase = computed(() => props.mode === 'token' ? `/public/provider-update/${encodeURIComponent(props.token)}` : '/provider-update/me');
const contact = reactive({personalEmail:'',phone:'',street:'',line2:'',city:'',state:'',postalCode:'',emergency:''});
const contactFields=[{key:'personalEmail',label:'Personal email',autocomplete:'email'},{key:'phone',label:'Personal mobile phone',autocomplete:'tel'},{key:'street',label:'Street address',autocomplete:'address-line1'},{key:'line2',label:'Address line 2',autocomplete:'address-line2'},{key:'city',label:'City',autocomplete:'address-level2'},{key:'state',label:'State',autocomplete:'address-level1'},{key:'postalCode',label:'ZIP code',autocomplete:'postal-code'},{key:'emergency',label:'Emergency contact',autocomplete:'off'}];
const supervisionRows=computed(()=>Object.entries({baseline:'Starting hours — before app tracking',period:'Imported billing-report hours',app:'App-recorded supervision hours',calculated:'Calculated total',current:'Current recorded balance'}).map(([key,label])=>({key,label,value:props.section.data?.breakdown?.[key]||{individual:'—',group:'—',total:'—'}})));
function formatTime(value){if(!value)return 'Not set';const [h,m='00']=String(value).split(':');return `${Number(h)%12||12}:${m} ${Number(h)<12?'AM':'PM'}`;}
async function openAsset(kind){try{const {data}=await api.get(`${reviewBase.value}/assets/${kind}`,{params:{agencyId:props.agencyId}});if(kind==='photo')photoUrl.value=data.url;else window.open(data.url,'_blank','noopener,noreferrer');}catch(e){localError.value=e.response?.data?.error?.message||'Could not open the saved document.';}}
async function setupQuickView(){
 if(props.recipient?.previewOnly || saving.value)return;
 saving.value=true;quickViewError.value='';localError.value='';
 try{
  const {data}=await api.post(`${reviewBase.value}/quick-view-setup`,{agencyId:props.agencyId},{skipGlobalLoading:true,timeout:30000});
  if(!/^\d{6}$/.test(String(data?.passcode||'')))throw new Error('The code could not be displayed. Open Accounts & access to check or reset it.');
  newPasscode.value=String(data.passcode);
  quickViewLocalStatus.value={hasPasscode:true,isLocked:false};
 }catch(e){
  if(e.response?.status===409)quickViewConflict.value=true;
  quickViewError.value=e.response?.data?.error?.message || (e.code==='ECONNABORTED' ? 'The request timed out. Your code may have been created. Choose Check my code status, then reset it here if you did not receive it.' : e.message || 'Could not create the code. Please try again.');
 }finally{
  saving.value=false;await nextTick();quickViewFeedback.value?.scrollIntoView?.({behavior:'smooth',block:'center'});quickViewFeedback.value?.focus?.({preventScroll:true});
 }
}

async function refreshQuickViewStatus(){
 if(props.recipient?.previewOnly || checkingQuickView.value)return;
 checkingQuickView.value=true;quickViewError.value='';
 try{
  const {data}=await api.get(`${reviewBase.value}/quick-view-status`,{params:{agencyId:props.agencyId},skipGlobalLoading:true,timeout:30000});
  quickViewLocalStatus.value={hasPasscode:!!data.hasPasscode,isLocked:!!data.isLocked};
  quickViewConflict.value=false;
 }catch(e){quickViewError.value=e.response?.data?.error?.message || 'Could not check your code. Try again before confirming this step.';}
 finally{checkingQuickView.value=false;}
}
function onQuickViewReset(){
 newPasscode.value='';quickViewResetShown.value=true;quickViewCodeAcknowledged.value=false;
 quickViewLocalStatus.value={hasPasscode:true,isLocked:false};quickViewConflict.value=false;quickViewError.value='';
}

const credential = ref('');
const displayLabel = ref('');
const publicGender = ref('');
const sessionLanguages=ref([]),languageError=ref('');
function saveContact(){
 if(!isValidPersonalEmail(contact.personalEmail)){
  localError.value='Enter a valid personal email address to complete Contact & Address.';
  return;
 }
 return markComplete({contact:{...contact,personalEmail:contact.personalEmail.trim()}});
}
function saveCredentialDisplay(){languageError.value='';try{validateSessionLanguages(sessionLanguages.value);}catch(e){languageError.value=e.message;return;}markComplete({credential:credential.value,displayLabel:displayLabel.value,publicGender:publicGender.value,sessionLanguages:sessionLanguages.value});}
const emailPreference=ref({});
const preferredDays = ref([]);
const notify = reactive({ email: true, sms: false });
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const linkNote = ref('');
const fallClients = ref([]);
const fallBaselines = new Map();
const fallSaveNotice = ref('');
const fallSaveErrors = reactive({});
const fallSaveMessages = reactive({});
const fallLoadFailed = ref(false);
const today=new Intl.DateTimeFormat('en-CA').format(new Date());
const fallLoading = ref(false);

const amendmentPlan = computed(() => props.recipient?.amendmentPlan || props.section?.data?.amendmentPlan || null);
const amendmentTasks = computed(() => props.recipient?.amendmentTasks || []);
const resolvedJobDescription = computed(() => props.recipient?.resolvedJobDescription || null);
const allAmendmentsSigned = computed(() => {
  const tasks = amendmentTasks.value || [];
  if (!tasks.length) return false;
  return tasks.every((t) => String(t.status || '').toLowerCase() === 'completed');
});

const isLink = computed(() =>
  ['training_ack', 'pay_portal'].includes(props.section.key)
);

const linkHref = computed(() => {
  const slug = route.params.organizationSlug;
  const prefix = slug ? `/${slug}` : '';
  const map = {
    amendments: `${prefix}/dashboard?tab=my&my=documents`,
    client_fall_update: `${prefix}/provider/year-update/flow`,
    training_ack: `${prefix}/dashboard?tab=my`,
    pay_portal: `${prefix}/dashboard?tab=my&my=payroll`
  };
  return map[props.section.key] || '#';
});

function orgPath(path) {
  const slug = route.params.organizationSlug;
  return slug ? `/${slug}${path}` : path;
}

async function saveSectionPayload(payload) {
  if (props.recipient?.previewOnly) return;
  const savedDraft = JSON.stringify(currentDraft());
  saving.value = true;
  localError.value = '';
  try {
    let res;
    if (props.mode === 'token') {
      res = await api.put(
        `/public/provider-update/${encodeURIComponent(props.token)}/sections/${props.section.key}`,
        payload
      );
    } else {
      res = await api.put(`/provider-update/me/sections/${props.section.key}`, {
        agencyId: Number(props.agencyId),
        ...payload
      });
    }
    if(props.section.key==='pin'&&payload.completed&&payload.data?.codeStoredSafely){quickViewCodeAcknowledged.value=true;quickViewError.value='';}
    // Navigating or submitting must not rewrite this successful confirmation as
    // an incomplete draft. Edits made during the request still remain dirty.
    draftBaseline = savedDraft;
    emit('saved', res.data);
    return true;
  } catch (e) {
    localError.value = e?.response?.data?.error?.message || 'Save failed';
    if(props.section.key==='pin')quickViewError.value=localError.value;
    return false;
  } finally {
    saving.value = false;
  }
}

const officeReviewEditor=ref(null);
let draftBaseline=null;
function currentDraft(){
 const drafts={contact_info:{contact:{...contact}},profile_blurb:{blurb:blurb.value},specialties:{clinicalFocus:clinicalFocus.value,specialties:{...specialties}},license:{license:{...license}},credential_display:{credential:credential.value,displayLabel:displayLabel.value,publicGender:publicGender.value,sessionLanguages:sessionLanguages.value},work_hours:{typicalAvailability:typicalAvailability.value.split(',').map(s=>s.trim()).filter(Boolean)},preferred_days:{preferredDays:preferredDays.value},office_review:officeReviewEditor.value?.draft(),supervision_hours:{...supervisionReview}};
 return drafts[props.section.key];
}
async function saveDraft(){
 if(props.recipient?.previewOnly)return true;
 if(saving.value||reviewLoading.value||quickViewResetBusy.value){localError.value='Please wait for the current save, code reset, or upload to finish.';return false;}
 if(props.section.key==='client_fall_update')return saveFallChanges();
 if(props.section.key==='pin'&&(newPasscode.value||quickViewResetShown.value)&&!quickViewCodeAcknowledged.value){
  quickViewError.value='Save your new code somewhere safe, then choose “I saved my code somewhere safe — continue” before leaving this step.';
  return false;
 }
 const data=currentDraft();if(!data)return true;
 if(JSON.stringify(data)===draftBaseline)return true;
 const saved=await saveSectionPayload({completed:false,status:'in_progress',data:{...(props.section.data||{}),...data}});
 return saved;
}
defineExpose({saveDraft});

function markComplete(data = {}) {
  const rawMode = props.section.meta?.mode || 'ack';
  const modeMap = {
    link: 'link',
    embedded: 'ack',
    set_confirm_update: data.blurb || data.license ? 'update' : 'confirm',
    ack: 'ack'
  };
  return saveSectionPayload({
    completed: true,
    mode: modeMap[rawMode] || 'ack',
    status: 'completed',
    data: { ...(props.section.data || {}), ...data }
  });
}

function saveHandbookReview(review) {
  if (saving.value || props.section.completed) return;
  return markComplete({ ...review, handbookAcknowledged: true });
}

async function saveBlurb() {
  if (props.recipient?.previewOnly) return;
  saving.value = true;
  try {
    await markComplete({ blurb: blurb.value });
  } finally {
    saving.value = false;
  }
}

const focusEditor=ref(null),focusErrors=ref(false);
async function saveSpecialties() {
  focusErrors.value=true;
  const missing=missingFocusGroups(clinicalFocus.value,props.section.data?.focusGroups||[]);
  if(missing.length){localError.value='Select three top choices or waive each highlighted category before continuing.';await nextTick();const group=focusEditor.value?.$el?.querySelector('[data-focus-group="'+missing[0].key+'"]');group?.scrollIntoView?.({behavior:'smooth',block:'start'});group?.focus({preventScroll:true});return;}
  await markComplete({clinicalFocus:clinicalFocus.value});
}

async function uploadPhoto(event) {
  if (props.recipient?.previewOnly) return;
  const file=event.target.files?.[0];if(!file)return;
  saving.value=true;localError.value='';
  try {const body=new FormData();body.append('agencyId',String(props.agencyId));body.append('photo',file);
    const {data}=await api.post(`${reviewBase.value}/photo`,body);photoUrl.value=data.url;
  }catch(e){localError.value=e.response?.data?.error?.message||'Could not upload your photo.';}finally{saving.value=false;event.target.value='';}
}
async function uploadReviewFile(event, kind) {
  if (props.recipient?.previewOnly) return;
  const file = event.target.files?.[0];
  if (!file) return;
  saving.value = true; localError.value = '';
  try {
    const body = new FormData(); body.append('file', file); body.append('agencyId', String(props.agencyId));
    if (kind === 'license' && license.expires) body.append('expirationDate', license.expires);
    const { data } = await api.post(`${reviewBase.value}/documents/${kind}`, body);
    if (kind === 'license') license.hasUpload = true;
    else supervisionReview.documentId = data.documentId;
  } catch(e) { localError.value = e.response?.data?.error?.message || 'Could not upload this document.'; }
  finally { saving.value = false; }
}
onMounted(async () => {
  if (!['license', 'supervision_hours'].includes(props.section.key)) return;
  reviewLoading.value = true;
  try {
    const { data } = await api.get(`${reviewBase.value}/review-context`, { params: { agencyId: props.agencyId } });
    reviewContext.value = data;
    Object.assign(license, data.license, props.section.data?.license || {});
  } catch(e) { localError.value = e.response?.data?.error?.message || 'Could not load your current records.'; }
  finally { reviewLoading.value = false; }
});

async function saveLicense() {
  await markComplete({ license: { ...license } });
}

function fallChecklistChanged(client) {
  return fallBaselines.has(client.id) && JSON.stringify(client.checklist) !== fallBaselines.get(client.id);
}
async function saveFallClient(client) {
  if (props.recipient?.previewOnly || saving.value || fallLoading.value) return false;
  saving.value = true; localError.value = ''; fallSaveNotice.value = ''; delete fallSaveErrors[client.id]; delete fallSaveMessages[client.id];
  const checklist = { ...client.checklist };
  try {
    const { data } = await api.put(`${reviewBase.value}/fall-actions/${client.id}`, { agencyId: props.agencyId, ...checklist, serviceDate: checklist.firstServiceAt });
    fallBaselines.set(client.id, JSON.stringify(checklist));
    const name = [client.preferredName || client.firstName, client.lastName].filter(Boolean).join(' ');
    fallSaveMessages[client.id] = data?.serviceConfirmation?.message || data?.message || 'Client changes saved.';
    fallSaveNotice.value = `${name}: ${fallSaveMessages[client.id]}`;
    return await loadFallClients();
  } catch (e) {
    const message = e.response?.data?.error?.message || 'Could not save the client steps. Please retry.';
    fallSaveErrors[client.id] = message;
    localError.value = message;
    return false;
  } finally { saving.value = false; }
}
async function saveFallChanges() {
  if (saving.value || fallLoading.value) return false;
  // These edits belong to client records, not to the Provider Update draft.
  // Save them through the same scoped endpoint before navigation or completion.
  const pendingIds = fallClients.value.filter(fallChecklistChanged).map(c => c.id);
  for (const id of pendingIds) {
    const client = fallClients.value.find(c => c.id === id);
    if (client && !(await saveFallClient(client))) return false;
  }
  return !localError.value;
}
async function markFallActionsReviewed() {
  if (props.recipient?.previewOnly || !(await saveFallChanges())) return;
  await markComplete({ fallClientCount: fallClients.value.length });
}
async function loadFallClients() {
  if (props.section.key !== 'client_fall_update') return;
  const pending = new Map(fallClients.value.filter(fallChecklistChanged).map(c => [c.id, { ...c.checklist }]));
  fallLoading.value = true;localError.value='';
  try {
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.get(`/public/provider-update/${encodeURIComponent(props.token)}/fall-actions`);
    } else {
      res = await api.get('/provider-update/me/fall-actions', {
        params: { agencyId: props.agencyId }
      });
    }
    fallClients.value = (res.data?.clients || []).map(c => {
      const checklist = { ...c.checklist, parentsContactedAt: String(c.checklist?.parentsContactedAt || '').slice(0, 10), firstServiceAt: c.lifecycleAction?.actionKey === 'confirm_services_started' ? '' : String(c.checklist?.firstServiceAt || '').slice(0, 10) };
      fallBaselines.set(c.id, JSON.stringify(checklist));
      return { ...c, checklist: pending.get(c.id) || checklist };
    });
    fallLoadFailed.value = false;
    return true;
  } catch {
    fallLoadFailed.value = true;
    localError.value='Could not refresh assigned client actions. Your entered values are still here. Retry Refresh list before confirming this section.';
    return false;
  } finally {
    fallLoading.value = false;
  }
}

onMounted(async () => {
  const data = props.section.data || {};
  blurb.value = data.blurb || '';
  Object.assign(specialties,data.specialties||{});
  clinicalFocus.value=JSON.parse(JSON.stringify(data.clinicalFocus||{top:{},excluded:{}}));
  typicalAvailability.value=(data.typicalAvailability||[]).join(', ');
  schoolChanges.value=data.requestedChanges||'';
  if(props.section.key==='directory_photo'&&data.hasPhoto)await openAsset('photo');
  if (data.license) Object.assign(license, data.license);
  if (data.contact) Object.assign(contact, data.contact);
  publicGender.value = data.publicGender || '';
  sessionLanguages.value=(data.sessionLanguages||[]).map(row=>({...row}));languageError.value='';
  credential.value = data.credential || '';
  displayLabel.value = data.displayRole?.label || data.displayLabel || '';
  emailPreference.value = {personalEmailNotify:data.appEmail?.personalEmailNotify !== false,personalEmailDeliveryMode:data.appEmail?.personalEmailDeliveryMode || 'notification',personalEmailDelayMode:data.appEmail?.personalEmailDelayMode || 'business_day',personalEmailDelayHours:data.appEmail?.personalEmailDelayHours ?? 24};
  preferredDays.value = data.preferredDays || [];
  if (data.notify) Object.assign(notify, data.notify);
  draftBaseline=JSON.stringify(currentDraft());
  if (props.section.key === 'client_fall_update') await loadFallClients();
});
</script>

<style scoped>
.fall-save-notice{padding:12px 16px;border:1px solid #86bfa5;border-radius:8px;background:#edf8f1;color:#20543d}
.directory-photo{width:180px;height:180px;object-fit:cover;border-radius:16px}.focus-group{display:flex;flex-wrap:wrap;gap:12px}.hours-table{border-collapse:collapse;width:100%}.hours-table th,.hours-table td{text-align:left;padding:10px;border-bottom:1px solid #e5e7eb}.school-list li{display:grid;gap:6px;padding:12px}.preview-fields{border:0;margin:0;padding:0;min-width:0}
.pu-section-head h1 { margin: 0 0 0.25rem; }
.pu-section-head p { color: #6b7280; margin: 0 0 1rem; }
.pu-panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem 1.1rem;
  display: grid;
  gap: 0.75rem;
}
.mode-tag {
  display: inline-block;
  background: #e8f0eb;
  color: #3d6b4f;
  padding: 0.25rem 0.6rem;
  border-radius: 99px;
  font-size: 0.8rem;
  font-weight: 600;
  width: fit-content;
}
.field { display: grid; gap: 0.3rem; font-size: 0.9rem; }
.input, textarea.input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  font: inherit;
}
.pu-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.fall-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
.amendment-task-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.amendment-task-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
}
.badge.pending { background: #fef3c7; color: #92400e; }
.badge.ok { background: #dcfce7; color: #166534; }
.client-inline-actions{display:grid;gap:10px;min-width:260px}.fall-list > li {
  flex-wrap:wrap;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}
.badge {
  display: inline-block;
  margin-top: 0.25rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.pu-btn.sm { padding: 0.25rem 0.55rem; font-size: 0.8rem; }
.plan { margin: 0; }
.pu-btn {
  border-radius: 8px;
  padding: 0.5rem 0.85rem;
  border: 1px solid #3d6b4f;
  background: #fff;
  color: #3d6b4f;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.pu-btn.primary { background: #3d6b4f; color: #fff; }
.pu-btn.ghost { border-color: #d1d5db; color: #6b7280; }
.muted { color: #6b7280; }
.err { color: #b91c1c; }
.days { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.day, .check { display: flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; }
</style>
