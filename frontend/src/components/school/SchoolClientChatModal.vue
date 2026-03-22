<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop data-tour="school-client-modal">
      <div class="modal-header">
        <div class="modal-header-left">
          <h2>Student: {{ client.initials }}</h2>
          <div class="modal-header-sub">
            <span class="sub-k">Status</span>
            <span class="sub-v">
              <span
                v-if="isWaitlist"
                class="waitlist-badge waitlist-badge-compact"
                role="button"
                tabindex="0"
                @mouseenter="onWaitlistHover"
                @mouseleave="hoveringWaitlist = false"
                @focus="onWaitlistHover"
                @click.stop="openWaitlistNote"
                @keydown.enter.stop.prevent="openWaitlistNote"
                @keydown.space.stop.prevent="openWaitlistNote"
                :title="waitlistTitle"
              >
                {{ formatKey(props.client?.client_status_label || props.client?.status || props.client?.client_status_key) }}
                <div v-if="hoveringWaitlist" class="waitlist-tooltip" role="tooltip">
                  <div class="waitlist-tooltip-title">Waitlist reason</div>
                  <div class="waitlist-tooltip-body">{{ waitlistTooltipBody }}</div>
                </div>
              </span>
              <span
                v-else
                :title="isTerminated && (props.client?.termination_reason || fullClient?.termination_reason) ? (props.client?.termination_reason || fullClient?.termination_reason) : undefined"
              >
                {{ formatKey(props.client?.client_status_label || props.client?.status || props.client?.client_status_key) }}
              </span>
            </span>
          </div>
        </div>
        <button class="close" @click="$emit('close')">×</button>
      </div>

      <div v-if="isTerminated && (props.client?.termination_reason || fullClient?.termination_reason)" class="termination-reason-banner">
        <strong>Termination reason:</strong> {{ props.client?.termination_reason || fullClient?.termination_reason }}
      </div>

      <div v-if="showActionBar" class="modal-actions-bar">
        <button
          v-if="subView !== 'default'"
          class="btn btn-secondary btn-sm"
          type="button"
          @click="subView = 'default'; activePane = null"
        >
          View & Comment
        </button>
        <button
          v-if="showSkillBuildersEntry"
          class="btn btn-secondary btn-sm"
          :class="{ 'action-btn-active': subView === 'skill_builders' }"
          type="button"
          @click="openSkillBuildersTab"
        >
          Skill Builders
        </button>
        <button
          v-if="props.showChecklistAction"
          class="btn btn-primary btn-sm"
          type="button"
          @click="emit('open-checklist', props.client)"
        >
          Checklist
        </button>
        <button
          v-if="props.canEditAction"
          class="btn btn-primary btn-sm"
          type="button"
          @click="emit('open-edit', props.client)"
        >
          More Info
        </button>
      </div>

      <div v-if="canToggleSkillsYes" class="skills-yes-bar">
        <label class="skills-yes-label">
          <input type="checkbox" :checked="!!skillsYesLocal" :disabled="skillsYesSaving" @change="onSkillsYesChange($event)" />
          <span>Skill Builders (Skills Yes)</span>
        </label>
        <span v-if="skillsYesError" class="error">{{ skillsYesError }}</span>
      </div>

      <div class="phi-warning">
        <strong>Reminder:</strong> Use initials only. Do not include PHI. This is not Therapy Notes.
      </div>

      <div class="status-bar">
        <div class="pill">
          <div class="k">Status</div>
          <div class="v">
            <span
              v-if="isWaitlist"
              class="waitlist-badge"
              role="button"
              tabindex="0"
              @mouseenter="onWaitlistHover"
              @mouseleave="hoveringWaitlist = false"
              @focus="onWaitlistHover"
              @click.stop="openWaitlistNote"
              @keydown.enter.stop.prevent="openWaitlistNote"
              @keydown.space.stop.prevent="openWaitlistNote"
              :title="waitlistTitle"
            >
              {{ formatKey(props.client?.client_status_label || props.client?.status || props.client?.client_status_key) }}
              <div v-if="hoveringWaitlist" class="waitlist-tooltip" role="tooltip">
                <div class="waitlist-tooltip-title">Waitlist reason</div>
                <div class="waitlist-tooltip-body">{{ waitlistTooltipBody }}</div>
              </div>
            </span>
            <span
              v-else
              :title="isTerminated && (props.client?.termination_reason || fullClient?.termination_reason) ? (props.client?.termination_reason || fullClient?.termination_reason) : undefined"
            >
              {{ formatKey(props.client?.client_status_label || props.client?.status || props.client?.client_status_key) }}
            </span>
          </div>
        </div>
        <div class="pill">
          <div class="k">Doc status</div>
          <div class="v">
            {{ formatKey(normalizeDocStatusLabel(props.client)) }}
            <span v-if="props.client?.paperwork_delivery_method_label"> · {{ formatKey(props.client?.paperwork_delivery_method_label) }}</span>
            <span v-if="props.client?.doc_date"> · {{ formatDateOnly(props.client?.doc_date) }}</span>
          </div>
        </div>
        <div class="pill">
          <div class="k">Assigned day</div>
          <div class="v">{{ props.client?.service_day || '—' }}</div>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="body">
        <div v-if="subView === 'skill_builders' && showSkillBuildersEntry" class="sb-tab-panel">
          <div class="sb-tab-head">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="selectedSkillEvent ? (selectedSkillEvent = null) : (subView = 'default')"
            >
              ← {{ selectedSkillEvent ? 'Events list' : 'Back' }}
            </button>
            <h3 class="sb-tab-title">Skill Builders</h3>
          </div>
          <div v-if="builderLoading" class="muted">Loading…</div>
          <div v-else-if="builderError" class="error">{{ builderError }}</div>
          <template v-else-if="selectedSkillEvent">
            <section class="sb-section">
              <h4>{{ selectedSkillEvent.eventTitle || selectedSkillEvent.skillsGroupName }}</h4>
              <p class="muted">
                {{ selectedSkillEvent.schoolName || '' }}
                <span v-if="formatSbRange(selectedSkillEvent)"> · {{ formatSbRange(selectedSkillEvent) }}</span>
              </p>
              <p
                v-if="selectedSkillEvent.eventDescription && !(selectedSkillEvent.meetings || []).length"
                class="sb-desc"
              >
                {{ selectedSkillEvent.eventDescription }}
              </p>
              <template v-if="(selectedSkillEvent.meetings || []).length">
                <p class="sb-subh sb-meetings-heading">Weekly meetings</p>
                <ul class="sb-list">
                  <li v-for="(m, idx) in selectedSkillEvent.meetings" :key="idx">
                    {{ m.weekday }} · {{ formatSbClock(m.startTime) }}–{{ formatSbClock(m.endTime) }}
                  </li>
                </ul>
              </template>
              <p v-else class="muted small">No weekly meeting pattern on file.</p>
            </section>
            <section class="sb-section">
              <h4>Providers</h4>
              <ul v-if="(selectedSkillEvent.providers || []).length" class="sb-list">
                <li v-for="p in selectedSkillEvent.providers" :key="p.id">{{ p.firstName }} {{ p.lastName }}</li>
              </ul>
              <p v-else class="muted">No providers listed yet.</p>
            </section>
            <section class="sb-section">
              <h4>This student</h4>
              <ul class="sb-list sb-flat">
                <li v-if="builderClientSummary?.initials">Initials: {{ builderClientSummary.initials }}</li>
                <li v-if="builderClientSummary?.grade">Grade: {{ builderClientSummary.grade }}</li>
                <li v-if="builderClientSummary?.ageYears != null">Age: {{ builderClientSummary.ageYears }}</li>
                <li v-else-if="builderClientSummary?.dateOfBirth">Date of birth: {{ builderClientSummary.dateOfBirth }}</li>
                <li>
                  Documents / paperwork:
                  {{ builderClientSummary?.paperworkStatusLabel || builderClientSummary?.documentStatus || '—' }}
                </li>
                <li v-if="builderClientSummary?.clientStatusLabel">Status: {{ builderClientSummary.clientStatusLabel }}</li>
              </ul>
              <p class="muted small">More document links and resources will appear here as we wire them in.</p>
            </section>
            <div class="sb-portal-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="!organizationSlugForPortal"
                :title="!organizationSlugForPortal ? 'Organization slug missing for portal link' : ''"
                @click="goSkillBuilderEventPortal(selectedSkillEvent)"
              >
                Event portal
              </button>
              <button type="button" class="btn btn-secondary btn-sm" @click="selectedSkillEvent = null">More events</button>
            </div>
            <div v-if="canCoordinatorConfirm && selectedSkillEvent.companyEventId && !selectedSkillEvent.activeForProviders" class="sb-row-actions" style="margin-top: 10px;">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="confirmBusyId === selectedSkillEvent.companyEventId"
                @click="confirmEventForClient(selectedSkillEvent.companyEventId)"
              >
                Confirm active for event
              </button>
            </div>
          </template>
          <template v-else>
            <section class="sb-section">
              <div class="sb-events-toolbar">
                <h4 class="sb-events-title">Events</h4>
                <label class="sb-past-toggle">
                  <input v-model="showPastSkillEvents" type="checkbox" />
                  Show past events
                </label>
              </div>
              <p v-if="upcomingSbEvents.length" class="sb-subh">Upcoming &amp; current</p>
              <ul v-if="upcomingSbEvents.length" class="sb-event-pick">
                <li v-for="ev in upcomingSbEvents" :key="`u-${ev.skillsGroupId}`">
                  <button type="button" class="sb-event-btn" @click="selectedSkillEvent = ev">
                    <span class="sb-event-name">{{ ev.eventTitle || ev.skillsGroupName }}</span>
                    <span class="muted sb-event-when">{{ formatSbRange(ev) }}</span>
                    <span class="muted sb-event-school">{{ ev.schoolName }}</span>
                  </button>
                </li>
              </ul>
              <p v-else class="muted">No current or upcoming events.</p>
              <template v-if="showPastSkillEvents && pastSbEvents.length">
                <p class="sb-subh">Past</p>
                <ul class="sb-event-pick">
                  <li v-for="ev in pastSbEvents" :key="`p-${ev.skillsGroupId}`">
                    <button type="button" class="sb-event-btn" @click="selectedSkillEvent = ev">
                      <span class="sb-event-name">{{ ev.eventTitle || ev.skillsGroupName }}</span>
                      <span class="muted sb-event-when">{{ formatSbRange(ev) }}</span>
                      <span class="muted sb-event-school">{{ ev.schoolName }}</span>
                    </button>
                  </li>
                </ul>
              </template>
            </section>
            <section v-if="!selectedSkillEvent" class="sb-section">
              <h4>Approved non-guardian pickups</h4>
              <ul v-if="builderPickups.length" class="sb-list">
                <li v-for="p in builderPickups" :key="p.id">
                  {{ p.display_name || p.displayName }}
                  <span v-if="p.relationship" class="muted"> · {{ p.relationship }}</span>
                  <span v-if="p.phone" class="muted"> · {{ p.phone }}</span>
                </li>
              </ul>
              <p v-else class="muted">None recorded.</p>
              <div v-if="canEditSkillBuilderExtras" class="sb-mini-form">
                <input v-model="pickupDraft.name" class="input" placeholder="Name" />
                <input v-model="pickupDraft.relationship" class="input" placeholder="Relationship" />
                <input v-model="pickupDraft.phone" class="input" placeholder="Phone" />
                <button type="button" class="btn btn-primary btn-sm" :disabled="pickupSaving" @click="savePickup">
                  {{ pickupSaving ? 'Saving…' : 'Add pickup' }}
                </button>
              </div>
            </section>
            <section v-if="!selectedSkillEvent" class="sb-section">
              <h4>Program notes</h4>
              <p class="muted small">
                Event-scoped discussion and notes live in the <strong>Event portal</strong> (open an event above). School portal users do not see program-only threads.
              </p>
            </section>
          </template>
        </div>

        <div v-if="subView === 'default' && checklist" class="checklist-roi-split">
          <div class="checklist checklist-half">
            <div class="checklist-title">Compliance checklist (read-only)</div>
            <div class="checklist-grid">
              <div class="check-item">
                <div class="k">Parents Contacted</div>
                <div class="v">{{ formatDateOnly(checklist.parents_contacted_at) }}</div>
              </div>
              <div class="check-item">
                <div class="k">Successful?</div>
                <div class="v">
                  {{ checklist.parents_contacted_successful === null ? '—' : (checklist.parents_contacted_successful ? 'Yes' : 'No') }}
                </div>
              </div>
              <div class="check-item">
                <div class="k">First Service</div>
                <div class="v">{{ formatDateOnly(checklist.first_service_at) }}</div>
              </div>
            </div>
            <div v-if="checklistAudit" class="checklist-audit">{{ checklistAudit }}</div>
          </div>

          <div class="staff-roi-card checklist-half">
            <div class="checklist-title">School staff & ROI (read-only)</div>
            <p class="staff-roi-hint muted">
              Each row is a school portal account. Status is that person’s access level for this student; ROI expiration is this student’s school ROI date (same for all rows).
            </p>
            <div v-if="!props.schoolOrganizationId" class="muted staff-roi-body">School context missing — roster unavailable.</div>
            <div v-else-if="staffRoiError" class="error staff-roi-body">{{ staffRoiError }}</div>
            <div v-else-if="loading && !staffRoiSummary" class="muted staff-roi-body">Loading…</div>
            <div v-else-if="staffRoiSummary && (!staffRoiSummary.staff || staffRoiSummary.staff.length === 0)" class="muted staff-roi-body">
              No school staff users found for this school.
            </div>
            <div v-else-if="staffRoiSummary" class="staff-roi-table-wrap">
              <table class="staff-roi-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>ROI status</th>
                    <th>ROI expires</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in staffRoiSummary.staff" :key="`staff-roi-${s.school_staff_user_id}`">
                    <td class="staff-roi-name">{{ s.name }}</td>
                    <td>
                      <span class="staff-roi-status" :class="`staff-roi-${String(s.effective_access_state || '').toLowerCase()}`">
                        {{ s.status_label }}
                      </span>
                    </td>
                    <td class="mono staff-roi-exp">{{ s.roi_expires_at || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div v-if="subView === 'default'" class="dual" :class="dualClass">
          <section
            class="pane pane-comments"
            :class="paneClass('comments')"
            data-tour="school-client-modal-comments"
            @click="activatePane('comments')"
            @focusin="activatePane('comments')"
          >
            <div class="pane-header">
              <div class="pane-title">Comments</div>
              <button v-if="activePane" class="btn-link" type="button" @click.stop="activePane = null">Show both</button>
            </div>

            <div v-if="isSchoolStaff" class="comment-guidance">
              <strong>If you have a question about the client, please send us a message.</strong>
              Comments are meant to inform everyone of any info (non clinical and no PHI) that may be beneficial for all parties to be aware (e.g., the client is on vacation).
            </div>

            <div class="comments pane-scroll">
              <div v-if="comments.length === 0" class="empty">No comments yet.</div>
              <table v-else class="comments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Note</th>
                    <th>Author</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in comments" :key="c.id">
                    <td class="mono">{{ formatDateTime(c.created_at) }}</td>
                    <td class="note">{{ c.message }}</td>
                    <td>{{ c.author_name || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="comment-composer">
              <textarea v-model="commentDraft" rows="3" placeholder="Add a brief comment (no PHI)..." />
              <div class="comment-actions">
                <button class="btn btn-primary" type="button" @click="sendComment" :disabled="commentSending || !commentDraft.trim()">
                  {{ commentSending ? 'Saving…' : 'Save comment' }}
                </button>
                <div v-if="commentError" class="error">{{ commentError }}</div>
              </div>
            </div>
          </section>

          <section
            class="pane pane-messages"
            :class="paneClass('messages')"
            data-tour="school-client-modal-messages"
            @click="activatePane('messages')"
            @focusin="activatePane('messages')"
          >
            <div class="pane-header">
              <div class="pane-title">Messages (ticketed)</div>
              <button v-if="activePane" class="btn-link" type="button" @click.stop="activePane = null">Show both</button>
            </div>

            <div class="message-guidance">
              Messages are for questions/inquiries and are tracked as tickets (no PHI).
            </div>

            <div class="pane-scroll">
              <ClientTicketThreadPanel
                v-if="props.schoolOrganizationId"
                :client="props.client"
                :school-organization-id="props.schoolOrganizationId"
              />
              <div v-else class="muted" style="padding: 10px 2px;">
                Messages are not available (missing organization context).
              </div>
            </div>
          </section>
        </div>

        <template v-if="subView === 'default'">
        <div v-if="canLaunchSmartRoi" class="documents-section">
          <div class="documents-section-title">Direct sign</div>
          <div class="muted">
            Launch the client-specific Smart ROI while the guardian is sitting with you. This opens the live signing flow in a new tab.
          </div>
          <div class="documents-actions">
            <button
              class="btn btn-primary btn-sm"
              type="button"
              :disabled="smartRoiLaunching"
              @click="launchSmartRoi"
            >
              {{ smartRoiLaunching ? 'Preparing…' : 'Launch Smart ROI' }}
            </button>
            <div v-if="smartRoiError" class="error">{{ smartRoiError }}</div>
          </div>
        </div>

        <div v-if="canViewClientDocuments" class="documents-section">
          <div class="documents-section-title">Documents</div>
          <div v-if="schoolStaffIsLimited" class="muted" style="margin-bottom: 8px;">
            Limited access: you can upload and open documents you uploaded.
          </div>
          <PhiDocumentsPanel :client-id="Number(client.id)" />
        </div>

        <div class="packet-audit">
          <div class="packet-audit-title">Packet audit (read-only)</div>
          <div v-if="!canViewPacketAudit && isSchoolStaff" class="muted">
            Packet audit is only available when this client is set to `ROI and Doc Access`.
          </div>
          <div v-else-if="auditLoading" class="muted">Loading…</div>
          <div v-else-if="auditError" class="error">{{ auditError }}</div>
          <div v-else-if="auditStatements.length === 0" class="muted">No packet history yet.</div>
          <div v-else class="packet-audit-list">
            <div v-for="s in auditStatements" :key="s.documentId" class="packet-audit-item">
              <div class="packet-audit-name">{{ s.originalName || `Document ${s.documentId}` }}</div>
              <div class="packet-audit-line">Uploaded: {{ formatDateTime(s.uploadedAt) }}{{ s.uploadedBy ? ` by ${s.uploadedBy}` : '' }}</div>
              <div class="packet-audit-line">Downloaded: {{ s.downloadedAt ? formatDateTime(s.downloadedAt) : '—' }}{{ s.downloadedBy ? ` by ${s.downloadedBy}` : '' }}</div>
              <div class="packet-audit-line">Exported to Therapy Notes: {{ s.exportedToEhrAt ? formatDateTime(s.exportedToEhrAt) : '—' }}{{ s.exportedToEhrBy ? ` by ${s.exportedToEhrBy}` : '' }}</div>
              <div class="packet-audit-line">
                Removed: {{ s.removedAt ? formatDateTime(s.removedAt) : '—' }}{{ s.removedBy ? ` by ${s.removedBy}` : '' }}
                <span v-if="s.removedReason"> · {{ s.removedReason }}</span>
              </div>
            </div>
          </div>
        </div>
        </template>
      </div>
    </div>
  </div>

  <WaitlistNoteModal
    v-if="showWaitlistModal"
    :org-key="String(props.schoolOrganizationId || '')"
    :client="props.client"
    @close="showWaitlistModal = false"
  />
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import WaitlistNoteModal from './WaitlistNoteModal.vue';
import ClientTicketThreadPanel from './ClientTicketThreadPanel.vue';
import PhiDocumentsPanel from '../admin/PhiDocumentsPanel.vue';
import { useAuthStore } from '../../store/auth';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import { formatSkillBuilderWallTime12h } from '../../utils/skillBuildersDisplay.js';

const props = defineProps({
  client: { type: Object, required: true },
  schoolOrganizationId: { type: Number, default: null },
  /** Parent agency id (affiliated agency) for Skill Builders APIs */
  parentAgencyId: { type: Number, default: null },
  /** School portal org slug (for Event portal link) */
  organizationSlug: { type: String, default: '' },
  initialPane: { type: String, default: null }, // null | 'comments' | 'messages' | 'skill_builders'
  canEditAction: { type: Boolean, default: false },
  showChecklistAction: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'open-edit', 'open-checklist', 'client-updated']);

const router = useRouter();
const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSchoolStaff = computed(() => roleNorm.value === 'school_staff');
const schoolStaffAccessLevel = computed(() => String(props.client?.school_staff_access_level || '').trim().toLowerCase());
const schoolStaffIsLimited = computed(() => isSchoolStaff.value && schoolStaffAccessLevel.value === 'limited');
const canViewClientDocuments = computed(() => {
  if (isSchoolStaff.value) return schoolStaffAccessLevel.value === 'roi_docs' || schoolStaffAccessLevel.value === 'limited';
  return ['provider', 'admin', 'staff', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value);
});
const canViewPacketAudit = computed(() => {
  if (isSchoolStaff.value) return schoolStaffAccessLevel.value === 'roi_docs';
  return canViewClientDocuments.value;
});
const showSkillBuildersEntry = computed(() => {
  const aid = Number(props.parentAgencyId || 0);
  return !!props.client?.skills && Number.isFinite(aid) && aid > 0;
});

const showActionBar = computed(
  () =>
    !isSchoolStaff.value &&
    (props.canEditAction || props.showChecklistAction || showSkillBuildersEntry.value)
);
const canLaunchSmartRoi = computed(() => Number(props.schoolOrganizationId || 0) > 0 && Number(props.client?.id || 0) > 0);

const isWaitlist = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase().trim();
  const status = String(props.client?.status || '').toLowerCase().trim();
  const label = String(props.client?.client_status_label || '').toLowerCase().trim();
  return key === 'waitlist' || status === 'waitlist' || label === 'waitlist';
});
const isTerminated = computed(() => {
  const key = String(props.client?.client_status_key || '').toLowerCase().trim();
  const label = String(props.client?.client_status_label || '').toLowerCase().trim();
  return key === 'terminated' || label.includes('terminated');
});
const showWaitlistModal = ref(false);
const hoveringWaitlist = ref(false);
const waitlistLoading = ref(false);
const waitlistNote = ref(''); // singleton shared note message

const waitlistTitle = computed(() => (isWaitlist.value ? 'Click to view/edit waitlist note' : ''));
const waitlistTooltipBody = computed(() => {
  if (!hoveringWaitlist.value) return '';
  if (waitlistLoading.value) return 'Loading…';
  return waitlistNote.value || '(no note yet)';
});

const loadWaitlistNote = async () => {
  try {
    if (!isWaitlist.value) return;
    const orgId = Number(props.schoolOrganizationId || 0);
    const clientId = Number(props.client?.id || 0);
    if (!orgId || !clientId) return;
    waitlistLoading.value = true;
    const r = await api.get(
      `/school-portal/${encodeURIComponent(String(orgId))}/clients/${clientId}/waitlist-note`,
      { skipGlobalLoading: true, timeout: 8000 }
    );
    waitlistNote.value = String(r.data?.note?.message || '').trim();
  } catch {
    // best-effort; tooltip should not block UI
    waitlistNote.value = '';
  } finally {
    waitlistLoading.value = false;
  }
};

const onWaitlistHover = () => {
  if (!isWaitlist.value) return;
  hoveringWaitlist.value = true;
  if (!waitlistNote.value && !waitlistLoading.value) loadWaitlistNote();
};

const openWaitlistNote = () => {
  if (!isWaitlist.value) return;
  if (!props.schoolOrganizationId) return;
  showWaitlistModal.value = true;
};

const normalizeDocStatusLabel = (c) => {
  const key = String(c?.paperwork_status_key || '').toLowerCase();
  const base = String(c?.paperwork_status_label || c?.document_status || '').trim();
  if (key === 'new_docs') return 'Docs Needed';
  if (key === 'all_needed') return base || 'All Needed';
  if (key === 'completed') return 'Received';
  return base || '—';
};

const loading = ref(false);
const error = ref('');
const fullClient = ref(null);
const checklist = ref(null);
const checklistAudit = ref('');
const staffRoiSummary = ref(null);
const staffRoiError = ref('');

const activePane = ref(null); // null | 'comments' | 'messages'
const subView = ref('default'); // 'default' | 'skill_builders'

const skillsYesLocal = ref(false);
const skillsYesSaving = ref(false);
const skillsYesError = ref('');

const builderLoading = ref(false);
const builderError = ref('');
const builderEvents = ref([]);
const builderClientSummary = ref(null);
const selectedSkillEvent = ref(null);
const showPastSkillEvents = ref(false);
const builderPickups = ref([]);
const pickupDraft = ref({ name: '', relationship: '', phone: '' });
const pickupSaving = ref(false);
const confirmBusyId = ref(null);

const canToggleSkillsYes = computed(() => {
  if (isSchoolStaff.value) return false;
  const orgOk = Number(props.schoolOrganizationId || 0) > 0;
  if (!orgOk) return false;
  return !!(props.client?.user_is_assigned_provider || props.canEditAction);
});

const canCoordinatorConfirm = computed(() =>
  ['admin', 'staff', 'support', 'super_admin'].includes(roleNorm.value)
);

const canEditSkillBuilderExtras = computed(
  () => !isSchoolStaff.value && (props.client?.user_is_assigned_provider || props.canEditAction || canCoordinatorConfirm.value)
);

function sbEventEndMs(ev) {
  const raw = ev?.eventEndsAt || ev?.groupEndDate;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

const organizationSlugForPortal = computed(() => String(props.organizationSlug || '').trim());

const upcomingSbEvents = computed(() => {
  const now = Date.now();
  return (builderEvents.value || []).filter((ev) => sbEventEndMs(ev) >= now || !sbEventEndMs(ev));
});

const pastSbEvents = computed(() => {
  const now = Date.now();
  return (builderEvents.value || []).filter((ev) => sbEventEndMs(ev) > 0 && sbEventEndMs(ev) < now);
});

function formatSbRange(ev) {
  const a = ev?.eventStartsAt ? new Date(ev.eventStartsAt) : null;
  const b = ev?.eventEndsAt ? new Date(ev.eventEndsAt) : null;
  if (a && Number.isFinite(a.getTime())) {
    try {
      const opt = { dateStyle: 'medium' };
      const end = b && Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, opt) : '';
      return end ? `${a.toLocaleDateString(undefined, opt)} – ${end}` : a.toLocaleDateString(undefined, opt);
    } catch {
      return '';
    }
  }
  if (ev?.groupStartDate || ev?.groupEndDate) {
    return `${formatDateShort(ev.groupStartDate)} – ${formatDateShort(ev.groupEndDate)}`;
  }
  return '';
}

function formatSbClock(t) {
  return formatSkillBuilderWallTime12h(t);
}

function formatDateShort(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function goSkillBuilderEventPortal(ev) {
  const id = Number(ev?.companyEventId || 0);
  if (!id || !organizationSlugForPortal.value) return;
  router.push(`/${organizationSlugForPortal.value}/skill-builders/event/${id}`);
}
const dualClass = computed(() => (activePane.value ? `dual-active-${activePane.value}` : 'dual-active-both'));
const paneClass = (pane) => {
  const active = activePane.value;
  return {
    active: active === pane,
    inactive: !!active && active !== pane
  };
};

const activatePane = (pane) => {
  if (activePane.value === pane) return;
  activePane.value = pane;
};

const comments = ref([]);
const commentDraft = ref('');
const commentSending = ref(false);
const commentError = ref('');
const auditLoading = ref(false);
const auditError = ref('');
const auditStatements = ref([]);
const smartRoiLaunching = ref(false);
const smartRoiError = ref('');

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    staffRoiSummary.value = null;
    staffRoiError.value = '';
    // Comments (non-ticket notes) from school portal endpoint.
    if (props.schoolOrganizationId) {
      try {
        const r = await api.get(`/school-portal/${props.schoolOrganizationId}/clients/${props.client.id}/comments`);
        comments.value = Array.isArray(r.data) ? r.data : [];
      } catch {
        comments.value = [];
      }
    } else {
      comments.value = [];
    }

    // Compliance checklist (read-only for school staff) + full client for termination_reason etc.
    try {
      const c = (await api.get(`/clients/${props.client.id}`)).data || {};
      fullClient.value = c;
      checklist.value = {
        parents_contacted_at: c.parents_contacted_at || null,
        parents_contacted_successful: c.parents_contacted_successful === null || c.parents_contacted_successful === undefined ? null : !!c.parents_contacted_successful,
        first_service_at: c.first_service_at || null
      };
      const who = c.checklist_updated_by_name || null;
      const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
      checklistAudit.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
      syncSkillsLocal();
    } catch {
      checklist.value = null;
      checklistAudit.value = '';
      syncSkillsLocal();
    }

    if (props.schoolOrganizationId && checklist.value) {
      try {
        const r = await api.get(
          `/school-portal/${props.schoolOrganizationId}/clients/${props.client.id}/school-staff-roi-summary`,
          { skipGlobalLoading: true }
        );
        staffRoiSummary.value = r.data || null;
      } catch (e) {
        staffRoiSummary.value = null;
        staffRoiError.value =
          e.response?.data?.error?.message || e.message || 'Failed to load school staff ROI summary';
      }
    }

    if (canViewPacketAudit.value) {
      try {
        auditLoading.value = true;
        auditError.value = '';
        const r = await api.get(`/phi-documents/clients/${props.client.id}/audit`);
        auditStatements.value = r.data?.documents || [];
      } catch (e) {
        auditStatements.value = [];
        auditError.value = e.response?.data?.error?.message || 'Failed to load packet audit';
      } finally {
        auditLoading.value = false;
      }
    } else {
      auditLoading.value = false;
      auditError.value = '';
      auditStatements.value = [];
    }
    // Mark as read (best-effort).
    try {
      await api.post(`/clients/${props.client.id}/notes/read`);
    } catch {
      // ignore
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    loading.value = false;
  }
};

const sendComment = async () => {
  try {
    if (!props.schoolOrganizationId) return;
    const body = String(commentDraft.value || '').trim();
    if (!body) return;
    commentSending.value = true;
    commentError.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/clients/${props.client.id}/comments`, {
      message: body
    });
    commentDraft.value = '';
    await load();
  } catch (e) {
    commentError.value = e.response?.data?.error?.message || 'Failed to save comment';
  } finally {
    commentSending.value = false;
  }
};

const launchSmartRoi = async () => {
  try {
    const orgId = Number(props.schoolOrganizationId || 0);
    const clientId = Number(props.client?.id || 0);
    if (!orgId || !clientId) return;
    smartRoiLaunching.value = true;
    smartRoiError.value = '';
    const resp = await api.post(`/school-portal/${orgId}/clients/${clientId}/smart-roi-link`);
    const publicKey = String(resp.data?.issued_link?.public_key || '').trim();
    const launchUrl = buildPublicIntakeUrl(publicKey);
    if (!launchUrl) {
      smartRoiError.value = 'Unable to prepare Smart ROI link.';
      return;
    }
    window.open(launchUrl, '_blank', 'noopener');
  } catch (e) {
    smartRoiError.value = e.response?.data?.error?.message || 'Failed to launch Smart ROI';
  } finally {
    smartRoiLaunching.value = false;
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');

const formatDateOnly = (d) => (d ? String(d).slice(0, 10) : '—');

function syncSkillsLocal() {
  skillsYesLocal.value = !!(props.client?.skills ?? fullClient.value?.skills);
}

async function onSkillsYesChange(ev) {
  const next = !!ev?.target?.checked;
  const orgId = Number(props.schoolOrganizationId || 0);
  const clientId = Number(props.client?.id || 0);
  if (!orgId || !clientId) return;
  skillsYesSaving.value = true;
  skillsYesError.value = '';
  try {
    await api.put(`/school-portal/${orgId}/clients/${clientId}/skills`, { skills: next });
    skillsYesLocal.value = next;
    emit('client-updated', { clientId, skills: next });
  } catch (e) {
    skillsYesError.value = e.response?.data?.error?.message || e.message || 'Failed to update';
    ev.target.checked = !next;
  } finally {
    skillsYesSaving.value = false;
  }
}

async function loadBuilderDetail() {
  const aid = Number(props.parentAgencyId || 0);
  const cid = Number(props.client?.id || 0);
  const sid = Number(props.schoolOrganizationId || 0);
  if (!aid || !cid) return;
  builderLoading.value = true;
  builderError.value = '';
  try {
    const res = await api.get(`/skill-builders/clients/${cid}/builder-detail`, {
      params: { agencyId: aid, schoolOrganizationId: sid || undefined },
      skipGlobalLoading: true
    });
    builderClientSummary.value = res.data?.clientSummary || null;
    builderEvents.value = Array.isArray(res.data?.events) ? res.data.events : [];
    builderPickups.value = Array.isArray(res.data?.transportPickups) ? res.data.transportPickups : [];
    selectedSkillEvent.value = null;
  } catch (e) {
    builderError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    builderEvents.value = [];
    builderPickups.value = [];
  } finally {
    builderLoading.value = false;
  }
}

function openSkillBuildersTab() {
  subView.value = 'skill_builders';
  loadBuilderDetail();
}

async function savePickup() {
  const aid = Number(props.parentAgencyId || 0);
  const cid = Number(props.client?.id || 0);
  const displayName = String(pickupDraft.value.name || '').trim();
  if (!aid || !cid || !displayName) return;
  pickupSaving.value = true;
  try {
    await api.post(`/skill-builders/clients/${cid}/transport-pickups`, {
      agencyId: aid,
      displayName,
      relationship: pickupDraft.value.relationship || '',
      phone: pickupDraft.value.phone || ''
    });
    pickupDraft.value = { name: '', relationship: '', phone: '' };
    await loadBuilderDetail();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to save');
  } finally {
    pickupSaving.value = false;
  }
}

async function confirmEventForClient(eventId) {
  const aid = Number(props.parentAgencyId || 0);
  const cid = Number(props.client?.id || 0);
  if (!aid || !cid || !eventId) return;
  confirmBusyId.value = eventId;
  try {
    await api.post(`/skill-builders/events/${eventId}/clients/${cid}/confirm-active`, { agencyId: aid });
    await loadBuilderDetail();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to confirm');
  } finally {
    confirmBusyId.value = null;
  }
}

const formatKey = (v) => {
  const s = String(v || '').trim();
  if (!s) return '—';
  return s.replace(/_/g, ' ');
};

onMounted(() => {
  const p = String(props.initialPane || '').trim().toLowerCase();
  if (p === 'comments' || p === 'messages') {
    activePane.value = p;
  }
  if (p === 'skill_builders') {
    openSkillBuildersTab();
  }
  load();
});

watch(
  () => [props.client?.id, props.client?.client_status_key],
  () => {
    showWaitlistModal.value = false;
    hoveringWaitlist.value = false;
    waitlistLoading.value = false;
    waitlistNote.value = '';
    {
      const p = String(props.initialPane || '').trim().toLowerCase();
      activePane.value = p === 'comments' || p === 'messages' ? p : null;
      subView.value = p === 'skill_builders' ? 'skill_builders' : 'default';
      if (p === 'skill_builders') {
        openSkillBuildersTab();
      }
    }
    comments.value = [];
    commentDraft.value = '';
    commentError.value = '';
    smartRoiError.value = '';
    staffRoiSummary.value = null;
    staffRoiError.value = '';
  }
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 1100px;
  max-width: 95vw;
  max-height: 90vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header-left {
  display: grid;
  gap: 4px;
}
.modal-header-sub {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 800;
}
.sub-k {
  color: var(--text-secondary);
  font-weight: 900;
}
.sub-v {
  color: var(--text-primary);
  font-weight: 900;
}
.waitlist-badge-compact {
  font-size: 12px;
}
.checklist-roi-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
  margin-bottom: 12px;
}
@media (max-width: 768px) {
  .checklist-roi-split {
    grid-template-columns: 1fr;
  }
}
.checklist-half {
  margin-bottom: 0;
  min-width: 0;
}
.checklist {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
  margin-bottom: 12px;
}
.checklist-roi-split .checklist {
  margin-bottom: 0;
}
.staff-roi-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
}
.staff-roi-hint {
  font-size: 12px;
  line-height: 1.35;
  margin: 0 0 10px;
}
.staff-roi-body {
  font-size: 13px;
}
.staff-roi-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.staff-roi-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.staff-roi-table th,
.staff-roi-table td {
  text-align: left;
  padding: 8px 6px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.staff-roi-table th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}
.staff-roi-name {
  font-weight: 700;
}
.staff-roi-exp {
  white-space: nowrap;
}
.staff-roi-status.staff-roi-expired {
  color: #991b1b;
  font-weight: 700;
}
.staff-roi-status.staff-roi-none {
  color: var(--text-secondary);
}
.checklist-title {
  font-weight: 700;
  margin-bottom: 8px;
}
.checklist-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.check-item .k {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.check-item .v {
  margin-top: 2px;
}
.checklist-audit {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.close { border: none; background: none; font-size: 28px; cursor: pointer; }
.termination-reason-banner {
  margin: 12px 16px 0 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}
.phi-warning {
  margin: 12px 16px 0 16px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}
.modal-actions-bar {
  margin: 12px 16px 0 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.action-btn-active {
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}
.status-bar {
  margin: 10px 16px 0 16px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.documents-section {
  margin: 0 0 12px 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
}
.documents-section-title {
  font-weight: 700;
  margin-bottom: 10px;
}
.documents-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 10px;
}
.packet-audit {
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--bg-alt);
}

.packet-audit-title {
  font-weight: 700;
  margin-bottom: 6px;
}

.packet-audit-list {
  display: grid;
  gap: 8px;
}

.packet-audit-item {
  border-top: 1px dashed var(--border);
  padding-top: 8px;
}

.packet-audit-item:first-child {
  border-top: none;
  padding-top: 0;
}

.packet-audit-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.packet-audit-line {
  font-size: 12px;
  color: var(--text-secondary);
}
.pill {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px 12px;
}
.pill .k {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 800;
}
.pill .v {
  margin-top: 2px;
  font-weight: 800;
  color: var(--text-primary);
}

.waitlist-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.waitlist-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  max-width: 60vw;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 50;
}

.waitlist-tooltip-title {
  font-weight: 900;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.waitlist-tooltip-body {
  font-size: 13px;
  line-height: 1.25;
  white-space: pre-wrap;
}
.body {
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  overflow: visible;
}

.dual {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: stretch;
  min-height: 0;
  min-width: 0;
  transition: grid-template-columns 160ms ease;
}
.dual.dual-active-comments {
  grid-template-columns: minmax(0, 4fr) minmax(0, 1fr);
}
.dual.dual-active-messages {
  grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
}

.pane {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.pane-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.pane-title {
  font-weight: 1000;
  color: var(--text-primary);
}

.pane.inactive {
  opacity: 0.92;
}

.pane-comments {
  background: rgba(59, 130, 246, 0.03);
  border-color: rgba(59, 130, 246, 0.16);
}
.pane-messages {
  background: rgba(16, 185, 129, 0.03);
  border-color: rgba(16, 185, 129, 0.18);
}
.comment-guidance,
.message-guidance {
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
}

.comments {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  padding: 10px;
}

.pane-scroll {
  overflow: visible;
}
.comments-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}
.comments-table th,
.comments-table td {
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.comments-table th {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 900;
  background: rgba(255, 255, 255, 0.6);
  position: sticky;
  top: 0;
}
.comments-table td.note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}

.comment-composer textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.comment-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

textarea, select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.loading, .empty { color: var(--text-secondary); }
.error { color: #c33; }
@media (max-width: 900px) {
  .status-bar { grid-template-columns: 1fr; }
  .dual { grid-template-columns: 1fr; }
  .dual.dual-active-comments,
  .dual.dual-active-messages {
    grid-template-columns: 1fr;
  }
}

.skills-yes-bar {
  margin: 8px 16px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.skills-yes-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.sb-tab-panel {
  margin-bottom: 12px;
}
.sb-tab-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.sb-tab-title {
  margin: 0;
  font-size: 1.1rem;
}
.sb-section {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg, #fff);
}
.sb-section h4 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.sb-list {
  margin: 0;
  padding-left: 1.2rem;
}
.sb-row-actions {
  margin-top: 6px;
}
.sb-mini-form {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  max-width: 420px;
}
.sb-notes {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
}
.sb-note-meta {
  font-size: 0.75rem;
  color: var(--text-secondary, #64748b);
}
.sb-note-body {
  margin-top: 4px;
  white-space: pre-wrap;
}
.sb-events-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.sb-events-title {
  margin: 0;
  font-size: 1rem;
}
.sb-past-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
}
.sb-subh {
  margin: 12px 0 6px;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
}
.sb-event-pick {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sb-event-btn {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.sb-event-btn:hover {
  border-color: var(--primary, #4f46e5);
}
.sb-event-name {
  display: block;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}
.sb-event-when,
.sb-event-school {
  display: block;
  font-size: 0.82rem;
  margin-top: 2px;
}
.sb-portal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.sb-desc {
  margin: 8px 0 0;
  font-size: 0.9rem;
  white-space: pre-wrap;
}
.sb-flat {
  list-style: none;
  padding-left: 0;
}
.small {
  font-size: 0.82rem;
}
</style>

