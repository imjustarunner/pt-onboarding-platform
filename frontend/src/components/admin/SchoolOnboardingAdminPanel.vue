<template>
  <div class="so-admin" :class="{ embedded: embedded }">
    <header v-if="!embedded" class="so-admin__head">
      <router-link class="muted back" :to="hubTo">← School Portals</router-link>
      <h1>School Onboarding</h1>
      <p class="muted">
        Invite a school contact to complete onboarding, or print a QR code so schools can start themselves.
        New schools automatically get English and Spanish digital intake forms copied from your most recent school.
      </p>
    </header>
    <p v-else class="muted so-embed-intro">
      Invite a school to complete onboarding, or print a QR for self-serve setup. New schools get English + Spanish digital intake forms
      duplicated from your most recent school’s active forms.
    </p>

    <p v-if="!ready" class="muted">Loading agency context…</p>
    <template v-else-if="resolvedAgencyId">
      <section class="so-card">
        <div class="so-card__row">
          <h2>Self-serve QR code</h2>
          <div class="so-actions" style="margin:0;">
            <button type="button" class="btn ghost" :disabled="qrBusy" @click="loadQr">Refresh</button>
            <button type="button" class="btn ghost" :disabled="qrBusy || !qr?.url" @click="rotateQr">Rotate</button>
          </div>
        </div>
        <p class="muted">
          Schools scan this code, enter their own contact + school name, and complete onboarding without an emailed invite.
        </p>
        <div v-if="qrLoading" class="muted">Loading QR…</div>
        <div v-else-if="qr?.url" class="so-qr-box">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="School onboarding QR code" class="so-qr-img" />
          <div class="so-qr-meta">
            <div class="mono tiny">{{ qr.url }}</div>
            <div class="so-actions">
              <button type="button" class="btn primary" @click="printQr">Print QR</button>
              <button type="button" class="btn ghost" @click="copyLink(qr.url)">Copy link</button>
            </div>
          </div>
        </div>
        <p v-else class="muted">No active QR link yet.</p>
        <p v-if="qrError" class="error">{{ qrError }}</p>
      </section>

      <section class="so-card">
        <h2>Demo link only</h2>
        <p class="muted">
          Use this at initial meetings to show the school portal without login or onboarding.
          Share the live link, or download a zip you can email / copy to a laptop. Unzip it,
          double-click start, and the demo runs with no Wi‑Fi.
        </p>
        <div v-if="demoOnlyUrl" class="so-qr-box">
          <img v-if="demoQrDataUrl" :src="demoQrDataUrl" alt="School portal demo QR code" class="so-qr-img" />
          <div class="so-qr-meta">
            <div class="mono tiny">{{ demoOnlyUrl }}</div>
            <div class="so-actions">
              <a class="btn primary" :href="demoOnlyUrl" target="_blank" rel="noopener noreferrer">Open demo</a>
              <button type="button" class="btn ghost" @click="printDemoQr">Print QR</button>
              <button type="button" class="btn ghost" @click="copyLink(demoOnlyUrl)">Copy link</button>
              <button type="button" class="btn ghost" :disabled="demoZipBusy" @click="downloadOfflineDemo">
                {{ demoZipBusy ? 'Building zip…' : 'Download offline bundle' }}
              </button>
            </div>
            <p v-if="demoZipError" class="error">{{ demoZipError }}</p>
            <p v-else class="muted tiny">
              The zip can be larger than a typical email attachment. If send fails, put it on Drive or WeTransfer and email the link.
            </p>
          </div>
        </div>
      </section>

      <section v-if="!pendingInvite" class="so-card">
        <h2>Create onboarding</h2>
        <form class="so-form" @submit.prevent="createOnboarding">
          <div class="so-grid">
            <label>
              Contact first name
              <input v-model.trim="form.contactFirstName" required autocomplete="given-name" />
            </label>
            <label>
              Contact last name
              <input v-model.trim="form.contactLastName" required autocomplete="family-name" />
            </label>
            <label class="span-2">
              Contact email
              <input v-model.trim="form.contactEmail" type="email" required autocomplete="email" />
            </label>
            <label class="span-2">
              School name
              <input v-model.trim="form.schoolName" required />
            </label>
          </div>
          <div v-if="affiliationConflict" class="so-conflict">
            <p><strong>Email already has a school staff account</strong>
              <span v-if="priorSchoolNames"> at {{ priorSchoolNames }}</span>.
            </p>
            <label class="so-radio">
              <input v-model="priorSchoolDecision" type="radio" value="leave_prior" />
              Only at this new school (remove prior school access)
            </label>
            <label class="so-radio">
              <input v-model="priorSchoolDecision" type="radio" value="stay_at_both" />
              Keep prior school(s) and add this one
            </label>
            <label class="so-check">
              <input v-model="resetPassword" type="checkbox" />
              Reset password for this person (they can use a new temp password)
            </label>
          </div>
          <p v-if="formError" class="error">{{ formError }}</p>
          <div class="so-actions">
            <button
              type="submit"
              class="btn primary"
              :disabled="creating || (affiliationConflict && !priorSchoolDecision)"
            >
              {{ creating ? 'Creating…' : (affiliationConflict ? 'Continue with choice' : 'Create onboarding') }}
            </button>
          </div>
        </form>
      </section>

      <section v-else class="so-card so-share-card">
        <h2>Share onboarding invite</h2>
        <p class="muted">
          Onboarding is ready for <strong>{{ pendingInvite.schoolName }}</strong>.
          Share the link directly or send it by email to {{ pendingInvite.contactEmail }}.
        </p>
        <p v-if="pendingInvite.temporaryPassword" class="success">
          Temporary password (share once): <code>{{ pendingInvite.temporaryPassword }}</code>
        </p>
        <p v-if="pendingInvite.intakeNote" class="success">{{ pendingInvite.intakeNote }}</p>
        <p v-if="shareError" class="error">{{ shareError }}</p>
        <p v-if="shareSuccess" class="success">{{ shareSuccess }}</p>
        <div class="so-actions">
          <button type="button" class="btn primary" @click="copyPendingLink">
            Copy invite link
          </button>
          <button
            type="button"
            class="btn ghost"
            :disabled="emailingInvite"
            @click="emailPendingInvite"
          >
            {{ emailingInvite ? 'Sending…' : 'Email invite' }}
          </button>
        </div>
      </section>

      <section class="so-card">
        <div class="so-card__row">
          <h2>Invites</h2>
          <button type="button" class="btn ghost" :disabled="loading" @click="loadInvites">
            Refresh
          </button>
        </div>
        <p v-if="listMessage" class="success">{{ listMessage }}</p>
        <p class="muted tiny so-actions-legend">
          <strong>Revoke</strong> only disables the invite link.
          <strong class="nuke-label">☢ Nuke</strong> permanently deletes the school organization, its school-staff users, clients, and this invite — for test cleanup only.
        </p>
        <p v-if="loading" class="muted">Loading invites…</p>
        <p v-else-if="!invites.length" class="muted">No school onboarding invites yet.</p>
        <div v-else class="so-table-wrap">
          <table class="so-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Contact</th>
                <th>Source</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Materials</th>
                <th>Invited</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in invites"
                :key="inv.id"
                class="so-invite-row"
                tabindex="0"
                @click="openInviteDetails(inv)"
                @keydown.enter.prevent="openInviteDetails(inv)"
              >
                <td>
                  <strong>{{ inv.schoolName }}</strong>
                  <div class="muted tiny">{{ inv.schoolSlug }}</div>
                </td>
                <td>
                  {{ inv.contactFirstName }} {{ inv.contactLastName }}
                  <div class="muted tiny">{{ inv.contactEmail }}</div>
                </td>
                <td><span class="pill">{{ inv.source || 'invite' }}</span></td>
                <td><span class="pill" :data-status="inviteDisplayStatus(inv)">{{ inviteDisplayLabel(inv) }}</span></td>
                <td>{{ inv.completedSteps }}/{{ inv.totalSteps }}</td>
                <td>
                  <div class="so-materials-summary" :title="materialsRequestTitle(inv)">
                    {{ materialsRequestSummary(inv) }}
                  </div>
                </td>
                <td class="muted tiny">{{ formatDate(inv.createdAt) }}</td>
                <td class="so-row-actions" @click.stop>
                  <button type="button" class="linkish" @click="openInviteDetails(inv)">Details</button>
                  <button type="button" class="linkish" @click="copyLink(inv.link)">Copy link</button>
                  <button
                    type="button"
                    class="linkish"
                    :disabled="inv.status === 'revoked' || inv.status === 'submitted' || busyId === inv.id"
                    @click="emailInvite(inv)"
                  >
                    Email invite
                  </button>
                  <button
                    type="button"
                    class="linkish danger"
                    :disabled="inv.status === 'revoked' || inv.status === 'submitted' || busyId === inv.id"
                    @click="revoke(inv)"
                  >
                    Revoke
                  </button>
                  <button
                    type="button"
                    class="linkish danger nuke"
                    :disabled="busyId === inv.id"
                    title="Permanently delete this test school, its staff users, clients, and invite. Cannot be undone."
                    @click="nuke(inv)"
                  >
                    ☢ Nuke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <Teleport to="body">
        <div
          v-if="selectedInvite"
          class="so-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="so-invite-detail-title"
          @click.self="closeInviteDetails"
        >
          <aside class="so-detail-panel">
            <header class="so-detail-panel__head">
              <div>
                <p class="muted tiny">Onboarding receipt · Invite #{{ selectedInvite.id }}</p>
                <h2 id="so-invite-detail-title">{{ selectedInvite.schoolName || 'School invite' }}</h2>
              </div>
              <div class="so-detail-panel__head-actions">
                <button type="button" class="btn ghost" @click="downloadInviteReceipt(selectedInvite)">
                  Download
                </button>
                <button type="button" class="btn ghost" @click="printInviteReceipt(selectedInvite)">
                  Print
                </button>
                <button type="button" class="btn ghost" @click="closeInviteDetails">Close</button>
              </div>
            </header>

            <div class="so-receipt">
              <div class="so-receipt__brand">
                <div>
                  <p class="so-receipt__eyebrow">{{ receiptAgencyName }}</p>
                  <h3 class="so-receipt__title">School Onboarding Summary</h3>
                </div>
                <span class="pill" :data-status="inviteDisplayStatus(selectedInvite)">
                  {{ inviteDisplayLabel(selectedInvite) }}
                </span>
              </div>

              <p class="so-receipt__meta">
                {{ selectedInvite.completedSteps }}/{{ selectedInvite.totalSteps }} steps
                · Source: {{ selectedInvite.source || 'invite' }}
                <template v-if="selectedInvite.submittedAt">
                  · Submitted {{ formatDate(selectedInvite.submittedAt) }}
                </template>
              </p>

              <section class="so-receipt__block">
                <h4>School information</h4>
                <div class="so-receipt-lines">
                  <div
                    v-for="row in schoolInfoReceiptRows(selectedInvite)"
                    :key="row.label"
                    class="so-receipt-line"
                  >
                    <span class="so-receipt-line__label">{{ row.label }}</span>
                    <span class="so-receipt-line__value">{{ row.value }}</span>
                  </div>
                </div>
              </section>

              <section class="so-receipt__block">
                <h4>Primary contact</h4>
                <div class="so-receipt-lines">
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Name</span>
                    <span class="so-receipt-line__value">
                      {{ selectedInvite.contactFirstName }} {{ selectedInvite.contactLastName }}
                    </span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Email</span>
                    <span class="so-receipt-line__value">{{ selectedInvite.contactEmail || '—' }}</span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Password set</span>
                    <span class="so-receipt-line__value">{{ selectedInvite.passwordSet ? 'Yes' : 'No' }}</span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Invited by</span>
                    <span class="so-receipt-line__value">{{ selectedInvite.invitedByName || '—' }}</span>
                  </div>
                </div>
              </section>

              <section class="so-receipt__block">
                <h4>School staff</h4>
                <p v-if="!staffReceiptRows(selectedInvite).length" class="muted tiny">No staff listed yet.</p>
                <div v-else class="so-receipt-staff">
                  <div
                    v-for="(member, idx) in staffReceiptRows(selectedInvite)"
                    :key="`${member.email}-${idx}`"
                    class="so-receipt-staff__card"
                  >
                    <div class="so-receipt-staff__name">{{ member.name }}</div>
                    <div class="so-receipt-line">
                      <span class="so-receipt-line__label">Email</span>
                      <span class="so-receipt-line__value">{{ member.email }}</span>
                    </div>
                    <div class="so-receipt-line">
                      <span class="so-receipt-line__label">Role</span>
                      <span class="so-receipt-line__value">{{ member.role }}</span>
                    </div>
                    <div v-if="member.jobTitle" class="so-receipt-line">
                      <span class="so-receipt-line__label">Job title</span>
                      <span class="so-receipt-line__value">{{ member.jobTitle }}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section class="so-receipt__block">
                <h4>Preferred days</h4>
                <div class="so-receipt-lines">
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Days</span>
                    <span class="so-receipt-line__value">{{ preferredDaysReceipt(selectedInvite) }}</span>
                  </div>
                  <div v-if="preferredNotesReceipt(selectedInvite)" class="so-receipt-line">
                    <span class="so-receipt-line__label">Notes</span>
                    <span class="so-receipt-line__value">{{ preferredNotesReceipt(selectedInvite) }}</span>
                  </div>
                </div>
              </section>

              <section class="so-receipt__block">
                <h4>Welcome materials</h4>
                <div class="so-receipt-lines">
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Request</span>
                    <span class="so-receipt-line__value">{{ materialsRequestSummary(selectedInvite) }}</span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Welcome package</span>
                    <span class="so-receipt-line__value">
                      {{
                        selectedInvite.stepPayload?.welcome_materials?.welcomePackageAcknowledged
                          ? 'Acknowledged'
                          : '—'
                      }}
                    </span>
                  </div>
                </div>
              </section>

              <section class="so-receipt__block">
                <h4>Step checklist</h4>
                <ul class="so-step-list">
                  <li v-for="step in inviteStepEntries(selectedInvite)" :key="step.key">
                    <span class="so-step-key">{{ step.label }}</span>
                    <span class="pill" :data-status="step.statusKey">{{ step.status }}</span>
                  </li>
                </ul>
              </section>

              <section class="so-receipt__block">
                <h4>Activity timeline</h4>
                <p v-if="!selectedInvite.activity?.length" class="muted tiny">
                  No activity yet — the contact has not opened the link or saved any steps.
                </p>
                <ol v-else class="so-activity-list">
                  <li v-for="(event, idx) in selectedInvite.activity" :key="`${event.at}-${idx}`">
                    <div class="so-activity-row">
                      <span class="so-activity-label">{{ event.label }}</span>
                      <span class="so-activity-time muted tiny">{{ formatDate(event.at) }}</span>
                    </div>
                    <p v-if="event.detail" class="muted tiny so-activity-detail">{{ event.detail }}</p>
                  </li>
                </ol>
              </section>

              <section class="so-receipt__block">
                <h4>Record details</h4>
                <div class="so-receipt-lines">
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Created</span>
                    <span class="so-receipt-line__value">{{ formatDate(selectedInvite.createdAt) }}</span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Last viewed</span>
                    <span class="so-receipt-line__value">{{ formatDate(selectedInvite.lastViewedAt) }}</span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Expires</span>
                    <span class="so-receipt-line__value">{{ formatDate(selectedInvite.expiresAt) }}</span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">School org ID</span>
                    <span class="so-receipt-line__value">{{ selectedInvite.schoolOrganizationId || '—' }}</span>
                  </div>
                  <div class="so-receipt-line">
                    <span class="so-receipt-line__label">Slug</span>
                    <span class="so-receipt-line__value">{{ selectedInvite.schoolSlug || '—' }}</span>
                  </div>
                  <div v-if="selectedInvite.link" class="so-receipt-line so-receipt-line--stack">
                    <span class="so-receipt-line__label">Onboarding link</span>
                    <span class="so-receipt-line__value so-link-wrap">
                      <a :href="selectedInvite.link" target="_blank" rel="noopener">{{ selectedInvite.link }}</a>
                      <button type="button" class="linkish" @click="copyLink(selectedInvite.link)">Copy</button>
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <footer class="so-detail-panel__foot">
              <button
                type="button"
                class="btn ghost"
                :disabled="selectedInvite.status === 'revoked' || selectedInvite.status === 'submitted' || busyId === selectedInvite.id"
                @click="emailInvite(selectedInvite)"
              >
                Email invite
              </button>
              <button
                type="button"
                class="btn ghost"
                :disabled="selectedInvite.status === 'revoked' || selectedInvite.status === 'submitted' || busyId === selectedInvite.id"
                @click="revoke(selectedInvite)"
              >
                Revoke
              </button>
              <button type="button" class="btn ghost" @click="closeInviteDetails">Close</button>
            </footer>
          </aside>
        </div>
      </Teleport>
    </template>
    <p v-else class="muted">Select an agency context to manage school onboarding.</p>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import QRCode from 'qrcode';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { buildSchoolOnboardingStandaloneDemoPath } from '../../utils/schoolOnboardingDemoContext.js';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  organizationSlug: { type: String, default: '' },
  embedded: { type: Boolean, default: false }
});

const emit = defineEmits(['school-created']);

const route = useRoute();
const agencyStore = useAgencyStore();
const ready = ref(false);
const loading = ref(false);
const creating = ref(false);
const emailingInvite = ref(false);
const busyId = ref(null);
const invites = ref([]);
const selectedInvite = ref(null);
const formError = ref('');
const listMessage = ref('');
const shareError = ref('');
const shareSuccess = ref('');
const pendingInvite = ref(null);
const affiliationConflict = ref(false);
const priorSchools = ref([]);
const priorSchoolDecision = ref('');
const resetPassword = ref(true);
const issuedTempPassword = ref('');
const priorSchoolNames = computed(() =>
  (priorSchools.value || []).map((s) => s.name).filter(Boolean).join(', ')
);
const qr = ref(null);
const qrDataUrl = ref('');
const qrLoading = ref(false);
const qrBusy = ref(false);
const qrError = ref('');
const demoQrDataUrl = ref('');
const demoZipBusy = ref(false);
const demoZipError = ref('');

const demoOnlyUrl = computed(() => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${buildSchoolOnboardingStandaloneDemoPath()}`;
});

const form = reactive({
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  schoolName: ''
});

const organizationSlug = computed(() => {
  if (props.organizationSlug) return String(props.organizationSlug).trim();
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug || '';
});

const resolvedAgencyId = computed(() => {
  const fromProp = Number(props.agencyId || 0);
  if (fromProp > 0) return fromProp;
  const fromQuery = Number(route.query.agencyId || 0);
  if (fromQuery > 0) return fromQuery;
  const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const fromCurrent = Number(current?.id || agencyStore.currentAgencyId || 0);
  if (fromCurrent > 0) return fromCurrent;
  const list = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
  const firstAgency = (list || []).find(
    (a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'
  );
  return firstAgency?.id ? Number(firstAgency.id) : null;
});

const hubTo = computed(() => {
  const slug = organizationSlug.value;
  return slug ? `/${slug}/admin/school-portals-hub` : '/admin/school-portals-hub';
});

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

const STEP_LABELS = {
  school_information: 'School information',
  school_staff: 'School staff',
  preferred_days: 'Preferred days',
  welcome_materials: 'Welcome materials',
  explore_demo: 'Explore demo',
  review_submit: 'Review & submit'
};

function inviteDisplayStatus(inv) {
  return inv?.displayStatus || inv?.status || 'created';
}

function inviteDisplayLabel(inv) {
  return inv?.displayStatusLabel || String(inv?.status || 'created').replace(/_/g, ' ');
}

function inviteStepEntries(inv) {
  const progress = inv?.stepProgress && typeof inv.stepProgress === 'object' ? inv.stepProgress : {};
  const keys = Object.keys(STEP_LABELS);
  const extra = Object.keys(progress).filter((k) => !keys.includes(k));
  return [...keys, ...extra].map((key) => {
    const status = String(progress[key] || 'not_started').replace(/_/g, ' ');
    return {
      key,
      label: STEP_LABELS[key] || key.replace(/_/g, ' '),
      status,
      statusKey: String(progress[key] || 'not_started')
    };
  });
}

const receiptAgencyName = computed(
  () =>
    selectedInvite.value?.agencyName ||
    agencyStore.currentAgency?.name ||
    'School portal'
);

const SCHOOL_INFO_RECEIPT_FIELDS = [
  { key: 'schoolName', label: 'School name' },
  { key: 'itscoEmail', label: 'School group email' },
  { key: 'districtName', label: 'District' },
  { key: 'schoolNumber', label: 'School number' },
  { key: 'schoolAddress', label: 'Address' },
  { key: 'academicYear', label: 'Academic year' },
  { key: 'gradeLevels', label: 'Grade levels' },
  { key: 'primaryContactName', label: 'Listed primary contact' },
  { key: 'primaryContactEmail', label: 'Listed primary email' },
  { key: 'primaryContactRole', label: 'Contact role' },
  { key: 'secondaryContactText', label: 'Secondary contact' },
  { key: 'schoolDaysTimes', label: 'School days / times' }
];

const ACCESS_ROLE_LABELS = {
  school_admin: 'School Admin',
  scheduler: 'Scheduler',
  school_admin_scheduler: 'School Admin + Scheduler',
  standard: 'Standard (ROI-eligible)',
  primary: 'School Admin (Primary Contact)',
  primary_contact: 'School Admin (Primary Contact)'
};

function displayOrDash(value) {
  const s = String(value ?? '').trim();
  return s || '—';
}

function schoolInfoReceiptRows(inv) {
  const info = inv?.stepPayload?.school_information || {};
  const rows = SCHOOL_INFO_RECEIPT_FIELDS.map((field) => ({
    label: field.label,
    value: displayOrDash(info[field.key] || (field.key === 'schoolName' ? inv?.schoolName : ''))
  }));
  // Always show school name even if step payload empty
  if (!info.schoolName && inv?.schoolName) {
    const nameRow = rows.find((r) => r.label === 'School name');
    if (nameRow) nameRow.value = inv.schoolName;
  }
  return rows.filter((r) => r.value !== '—' || ['School name', 'School group email'].includes(r.label));
}

function staffReceiptRows(inv) {
  const staff = inv?.stepPayload?.school_staff?.staff;
  if (!Array.isArray(staff) || !staff.length) return [];
  return staff.map((row) => {
    const roleKey = String(row.accessRole || row.role || '').trim().toLowerCase();
    return {
      name: displayOrDash(row.fullName || row.name),
      email: displayOrDash(row.email),
      jobTitle: String(row.jobTitle || row.roleTitle || row.title || '').trim(),
      role: ACCESS_ROLE_LABELS[roleKey] || (roleKey ? roleKey.replace(/_/g, ' ') : '—')
    };
  });
}

function preferredDaysReceipt(inv) {
  const days = inv?.stepPayload?.preferred_days?.preferredDays;
  if (!Array.isArray(days) || !days.length) return '—';
  return days.join(', ');
}

function preferredNotesReceipt(inv) {
  return String(inv?.stepPayload?.preferred_days?.notes || '').trim();
}

function openInviteDetails(inv) {
  selectedInvite.value = inv || null;
}

function closeInviteDetails() {
  selectedInvite.value = null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInviteReceiptHtml(inv) {
  const agency = escapeHtml(inv?.agencyName || agencyStore.currentAgency?.name || 'School portal');
  const school = escapeHtml(inv?.schoolName || 'School');
  const status = escapeHtml(inviteDisplayLabel(inv));
  const schoolRows = schoolInfoReceiptRows(inv)
    .map(
      (r) =>
        `<div class="line"><span class="lbl">${escapeHtml(r.label)}</span><span class="val">${escapeHtml(r.value)}</span></div>`
    )
    .join('');
  const staff = staffReceiptRows(inv);
  const staffHtml = staff.length
    ? staff
        .map(
          (m) =>
            `<div class="staff"><div class="staff-name">${escapeHtml(m.name)}</div>` +
            `<div class="line"><span class="lbl">Email</span><span class="val">${escapeHtml(m.email)}</span></div>` +
            `<div class="line"><span class="lbl">Role</span><span class="val">${escapeHtml(m.role)}</span></div>` +
            (m.jobTitle
              ? `<div class="line"><span class="lbl">Job title</span><span class="val">${escapeHtml(m.jobTitle)}</span></div>`
              : '') +
            `</div>`
        )
        .join('')
    : '<p class="muted">No staff listed.</p>';
  const activity = Array.isArray(inv?.activity) ? inv.activity : [];
  const activityHtml = activity.length
    ? `<ol class="activity">${activity
        .map(
          (e) =>
            `<li><div class="act-row"><strong>${escapeHtml(e.label)}</strong><span>${escapeHtml(formatDate(e.at))}</span></div>` +
            (e.detail ? `<div class="muted">${escapeHtml(e.detail)}</div>` : '') +
            `</li>`
        )
        .join('')}</ol>`
    : '<p class="muted">No activity yet.</p>';
  const stepsHtml = inviteStepEntries(inv)
    .map(
      (s) =>
        `<div class="line"><span class="lbl">${escapeHtml(s.label)}</span><span class="val">${escapeHtml(s.status)}</span></div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${agency} — ${school} onboarding</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
    .sheet { max-width: 720px; margin: 24px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px 32px; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
    .eyebrow { margin: 0; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: #64748b; font-weight: 700; }
    h1 { margin: 4px 0 0; font-size: 22px; }
    .status { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-size: 12px; font-weight: 700; text-transform: capitalize; }
    .meta { color: #64748b; font-size: 13px; margin: 0 0 22px; }
    h2 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .block { margin: 0 0 22px; padding-bottom: 16px; border-bottom: 1px dashed #cbd5e1; }
    .block:last-child { border-bottom: none; }
    .line { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px dotted #e2e8f0; font-size: 14px; }
    .line:last-child { border-bottom: none; }
    .lbl { color: #64748b; flex: 0 0 42%; }
    .val { text-align: right; font-weight: 600; word-break: break-word; }
    .staff { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .staff-name { font-weight: 700; margin-bottom: 4px; }
    .activity { margin: 0; padding: 0; list-style: none; }
    .activity li { margin: 0 0 10px; }
    .act-row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
    .muted { color: #64748b; font-size: 13px; }
    .foot { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
    @media print {
      body { background: #fff; }
      .sheet { margin: 0; border: none; border-radius: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <div>
        <p class="eyebrow">${agency}</p>
        <h1>School Onboarding Summary</h1>
        <div style="margin-top:6px;font-size:16px;font-weight:600;">${school}</div>
      </div>
      <span class="status">${status}</span>
    </div>
    <p class="meta">Invite #${escapeHtml(inv?.id)} · ${escapeHtml(inv?.completedSteps)}/${escapeHtml(inv?.totalSteps)} steps · Source: ${escapeHtml(inv?.source || 'invite')}${
      inv?.submittedAt ? ` · Submitted ${escapeHtml(formatDate(inv.submittedAt))}` : ''
    }</p>
    <section class="block"><h2>School information</h2>${schoolRows}</section>
    <section class="block"><h2>Primary contact</h2>
      <div class="line"><span class="lbl">Name</span><span class="val">${escapeHtml(`${inv?.contactFirstName || ''} ${inv?.contactLastName || ''}`.trim())}</span></div>
      <div class="line"><span class="lbl">Email</span><span class="val">${escapeHtml(inv?.contactEmail || '—')}</span></div>
      <div class="line"><span class="lbl">Password set</span><span class="val">${inv?.passwordSet ? 'Yes' : 'No'}</span></div>
      <div class="line"><span class="lbl">Invited by</span><span class="val">${escapeHtml(inv?.invitedByName || '—')}</span></div>
    </section>
    <section class="block"><h2>School staff</h2>${staffHtml}</section>
    <section class="block"><h2>Preferred days</h2>
      <div class="line"><span class="lbl">Days</span><span class="val">${escapeHtml(preferredDaysReceipt(inv))}</span></div>
      ${
        preferredNotesReceipt(inv)
          ? `<div class="line"><span class="lbl">Notes</span><span class="val">${escapeHtml(preferredNotesReceipt(inv))}</span></div>`
          : ''
      }
    </section>
    <section class="block"><h2>Welcome materials</h2>
      <div class="line"><span class="lbl">Request</span><span class="val">${escapeHtml(materialsRequestSummary(inv))}</span></div>
    </section>
    <section class="block"><h2>Step checklist</h2>${stepsHtml}</section>
    <section class="block"><h2>Activity timeline</h2>${activityHtml}</section>
    <p class="foot">${agency} · Generated ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
</body>
</html>`;
}

function openReceiptWindow(inv, { print = false } = {}) {
  if (!inv) return;
  const html = buildInviteReceiptHtml(inv);
  const win = window.open('', '_blank', 'noopener,noreferrer,width=820,height=960');
  if (!win) {
    listMessage.value = 'Allow pop-ups to download or print the onboarding receipt.';
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (print) {
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch {
        // ignore
      }
    }, 250);
  }
}

function downloadInviteReceipt(inv) {
  if (!inv) return;
  const html = buildInviteReceiptHtml(inv);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = String(inv.schoolSlug || inv.schoolName || 'school')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  a.href = url;
  a.download = `school-onboarding-${slug || 'invite'}-${inv.id}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  listMessage.value = 'Onboarding receipt downloaded.';
}

function printInviteReceipt(inv) {
  openReceiptWindow(inv, { print: true });
}

const MATERIAL_LABELS = {
  trifolds: 'Trifolds',
  stress_balls: 'Stress balls',
  pens: 'Pens',
  other: 'Other'
};

function materialsRequestSummary(inv) {
  const req = inv?.materialsRequest;
  if (!req) return '—';
  const parts = [];
  if (req.requestPaperPackets === true) parts.push('Paper packets');
  else if (req.requestPaperPackets === false) parts.push('No paper');
  const mats = Array.isArray(req.materials) ? req.materials : [];
  const labels = mats
    .map((key) => {
      if (key === 'other' && req.materialsOther) return `Other: ${req.materialsOther}`;
      return MATERIAL_LABELS[key] || key;
    })
    .filter(Boolean);
  if (labels.length) parts.push(labels.join(', '));
  return parts.length ? parts.join(' · ') : '—';
}

function materialsRequestTitle(inv) {
  const summary = materialsRequestSummary(inv);
  return summary === '—' ? '' : summary;
}

async function copyLink(link) {
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    listMessage.value = 'Link copied to clipboard.';
  } catch {
    listMessage.value = link;
  }
}

async function downloadOfflineDemo() {
  demoZipBusy.value = true;
  demoZipError.value = '';
  try {
    const response = await api.get('/school-onboarding/demo/offline-zip', {
      responseType: 'blob',
      timeout: 180000,
      skipGlobalLoading: true
    });
    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: 'application/zip' });
    if (blob.type && blob.type.includes('json')) {
      const text = await blob.text();
      try {
        const parsed = JSON.parse(text);
        throw new Error(parsed?.error?.message || 'Failed to build the offline demo zip');
      } catch (e) {
        if (e.message && !e.message.includes('JSON')) throw e;
        throw new Error('Failed to build the offline demo zip');
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hogwarts-school-portal-demo.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    const data = e?.response?.data;
    if (data instanceof Blob) {
      try {
        const parsed = JSON.parse(await data.text());
        demoZipError.value = parsed?.error?.message || 'Failed to build the offline demo zip';
      } catch {
        demoZipError.value = 'Failed to build the offline demo zip';
      }
    } else {
      demoZipError.value = e?.response?.data?.error?.message || e?.message || 'Failed to build the offline demo zip';
    }
  } finally {
    demoZipBusy.value = false;
  }
}

function intakeBootstrapNote(bootstrap) {
  const formsOk = bootstrap?.en && bootstrap?.es;
  const formsPartial = bootstrap?.en || bootstrap?.es;
  if (formsOk) return 'English + Spanish digital intake forms were copied and activated.';
  if (formsPartial) return 'Some digital intake forms were copied (check Digital Forms if one language is missing).';
  return 'No source digital intake forms were found to copy yet.';
}

function clearPendingInvite() {
  pendingInvite.value = null;
  shareError.value = '';
  shareSuccess.value = '';
}

async function createOnboarding() {
  formError.value = '';
  listMessage.value = '';
  creating.value = true;
  try {
    const payload = {
      agencyId: resolvedAgencyId.value,
      contactFirstName: form.contactFirstName,
      contactLastName: form.contactLastName,
      contactEmail: form.contactEmail,
      schoolName: form.schoolName,
      sendEmail: false
    };
    if (affiliationConflict.value) {
      payload.confirmExistingSchoolStaff = true;
      payload.priorSchoolDecision = priorSchoolDecision.value;
      payload.resetPassword = resetPassword.value === true;
    }
    const res = await api.post('/school-onboarding/invites', payload);
    issuedTempPassword.value = res.data?.temporaryPassword || '';
    pendingInvite.value = {
      id: res.data?.invite?.id,
      schoolName: form.schoolName,
      contactEmail: form.contactEmail,
      link: res.data?.link || res.data?.invite?.link || '',
      temporaryPassword: res.data?.temporaryPassword || '',
      intakeNote: intakeBootstrapNote(res.data?.intakeBootstrap)
    };
    form.contactFirstName = '';
    form.contactLastName = '';
    form.contactEmail = '';
    form.schoolName = '';
    affiliationConflict.value = false;
    priorSchools.value = [];
    priorSchoolDecision.value = '';
    emit('school-created', res.data?.school || null);
    await loadInvites();
  } catch (e) {
    const err = e?.response?.data?.error || {};
    if (err.code === 'SCHOOL_STAFF_ALREADY_AFFILIATED') {
      affiliationConflict.value = true;
      priorSchools.value = Array.isArray(err.details?.currentSchools) ? err.details.currentSchools : [];
      if (!priorSchoolDecision.value) priorSchoolDecision.value = 'leave_prior';
      formError.value = 'Confirm prior-school choice, then continue.';
    } else {
      formError.value = err.message || e?.message || 'Failed to create onboarding';
    }
  } finally {
    creating.value = false;
  }
}

async function copyPendingLink() {
  if (!pendingInvite.value?.link) return;
  shareError.value = '';
  shareSuccess.value = '';
  try {
    await navigator.clipboard.writeText(pendingInvite.value.link);
    shareSuccess.value = 'Invite link copied.';
    clearPendingInvite();
  } catch {
    shareError.value = 'Could not copy automatically. Copy this link manually:';
    shareSuccess.value = pendingInvite.value.link;
  }
}

async function emailPendingInvite() {
  if (!pendingInvite.value?.id) return;
  shareError.value = '';
  shareSuccess.value = '';
  emailingInvite.value = true;
  try {
    const res = await api.post(`/school-onboarding/invites/${pendingInvite.value.id}/send-email`, {
      agencyId: resolvedAgencyId.value
    });
    if (res.data?.emailSent) {
      listMessage.value = `Invite emailed to ${pendingInvite.value.contactEmail}.`;
    } else {
      listMessage.value = 'Email could not be sent — use Copy link in the invites list below.';
    }
    clearPendingInvite();
    await loadInvites();
  } catch (e) {
    shareError.value = e?.response?.data?.error?.message || 'Failed to send invite email';
  } finally {
    emailingInvite.value = false;
  }
}

async function emailInvite(inv) {
  busyId.value = inv.id;
  listMessage.value = '';
  formError.value = '';
  try {
    const res = await api.post(`/school-onboarding/invites/${inv.id}/send-email`, {
      agencyId: resolvedAgencyId.value
    });
    listMessage.value = res.data?.emailSent
      ? `Invite emailed to ${inv.contactEmail}.`
      : 'Email could not be sent — copy the link instead.';
    await loadInvites();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to send invite email';
  } finally {
    busyId.value = null;
  }
}

async function loadInvites() {
  if (!resolvedAgencyId.value) return;
  loading.value = true;
  try {
    const res = await api.get('/school-onboarding/invites', { params: { agencyId: resolvedAgencyId.value } });
    invites.value = Array.isArray(res.data?.invites) ? res.data.invites : [];
    if (selectedInvite.value?.id) {
      selectedInvite.value =
        invites.value.find((inv) => Number(inv.id) === Number(selectedInvite.value.id)) || null;
    }
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to load invites';
  } finally {
    loading.value = false;
  }
}


async function revoke(inv) {
  if (!confirm(`Revoke invite for ${inv.schoolName}?`)) return;
  busyId.value = inv.id;
    formError.value = '';
    listMessage.value = '';
    try {
      await api.post(`/school-onboarding/invites/${inv.id}/revoke`, { agencyId: resolvedAgencyId.value });
      listMessage.value = 'Invite revoked.';
    await loadInvites();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to revoke';
  } finally {
    busyId.value = null;
  }
}

async function nuke(inv) {
  const schoolName = inv.schoolName || 'this school';
  const warning = [
    `☢ NUKE "${schoolName}"?`,
    '',
    'This PERMANENTLY deletes:',
    '• The school organization (portal, profile, contacts)',
    '• School-staff users created for this school',
    '• All clients at this school',
    '• This onboarding invite',
    '',
    'This cannot be undone. Use only for test/demo cleanup.',
    '',
    'Type NUKE below to confirm.'
  ].join('\n');
  if (!confirm(warning)) return;
  const typed = window.prompt(`Type NUKE to permanently delete "${schoolName}":`);
  if (String(typed || '').trim().toUpperCase() !== 'NUKE') {
    formError.value = 'Nuke cancelled — confirmation did not match.';
    return;
  }
  busyId.value = inv.id;
  formError.value = '';
  listMessage.value = '';
  try {
    const res = await api.post(`/school-onboarding/invites/${inv.id}/nuke`, {
      agencyId: resolvedAgencyId.value,
      confirm: 'NUKE'
    });
    const parts = [];
    if (res.data?.deletedClients) parts.push(`${res.data.deletedClients} client(s)`);
    if (res.data?.deletedUsers) parts.push(`${res.data.deletedUsers} user(s)`);
    listMessage.value = parts.length
      ? `Nuked ${schoolName} (removed ${parts.join(', ')}).`
      : `Nuked ${schoolName}.`;
    await loadInvites();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to nuke school';
  } finally {
    busyId.value = null;
  }
}

async function renderDemoQr() {
  const url = demoOnlyUrl.value;
  if (!url) {
    demoQrDataUrl.value = '';
    return;
  }
  try {
    demoQrDataUrl.value = await QRCode.toDataURL(url, { width: 280, margin: 1 });
  } catch {
    demoQrDataUrl.value = '';
  }
}

async function renderQr(url) {
  if (!url) {
    qrDataUrl.value = '';
    return;
  }
  try {
    qrDataUrl.value = await QRCode.toDataURL(url, { width: 280, margin: 1 });
  } catch {
    qrDataUrl.value = '';
  }
}

async function loadQr() {
  if (!resolvedAgencyId.value) return;
  qrLoading.value = true;
  qrError.value = '';
  try {
    const res = await api.get('/school-onboarding/qr-link', { params: { agencyId: resolvedAgencyId.value } });
    qr.value = res.data?.qr || null;
    await renderQr(qr.value?.url);
  } catch (e) {
    qrError.value = e?.response?.data?.error?.message || 'Failed to load QR link';
  } finally {
    qrLoading.value = false;
  }
}

async function rotateQr() {
  if (!confirm('Rotate the QR code? The old printed code will stop working.')) return;
  qrBusy.value = true;
  qrError.value = '';
  try {
    const res = await api.post('/school-onboarding/qr-link/rotate', { agencyId: resolvedAgencyId.value });
    qr.value = res.data?.qr || null;
    await renderQr(qr.value?.url);
    listMessage.value = 'QR code rotated.';
  } catch (e) {
    qrError.value = e?.response?.data?.error?.message || 'Failed to rotate QR';
  } finally {
    qrBusy.value = false;
  }
}

function printDemoQr() {
  if (!demoQrDataUrl.value || !demoOnlyUrl.value) return;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=840');
  if (!w) return;
  const agencyName =
    agencyStore.currentAgency?.name ||
    agencyStore.currentAgency?.value?.name ||
    'School portal demo';
  const doc = w.document;
  doc.open();
  doc.title = 'School portal demo QR';
  doc.body.innerHTML = `
    <div style="font-family:Segoe UI,system-ui,sans-serif;text-align:center;padding:32px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 8px"></h1>
      <p style="margin:0;color:#475569">Scan to preview the school portal (no login)</p>
      <img style="width:280px;height:280px;margin:16px auto;display:block" alt="QR code" />
      <div class="url" style="font-size:12px;color:#64748b;word-break:break-all;margin-top:12px"></div>
    </div>`;
  doc.querySelector('h1').textContent = agencyName;
  doc.querySelector('img').src = demoQrDataUrl.value;
  doc.querySelector('.url').textContent = demoOnlyUrl.value;
  doc.close();
  w.focus();
  setTimeout(() => {
    try { w.print(); } catch { /* ignore */ }
  }, 250);
}

function printQr() {
  if (!qrDataUrl.value || !qr.value?.url) return;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=840');
  if (!w) return;
  const agencyName =
    agencyStore.currentAgency?.name ||
    agencyStore.currentAgency?.value?.name ||
    'School onboarding';
  const doc = w.document;
  doc.open();
  doc.title = 'School onboarding QR';
  doc.body.innerHTML = `
    <div style="font-family:Segoe UI,system-ui,sans-serif;text-align:center;padding:32px;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 8px"></h1>
      <p style="margin:0;color:#475569">Scan to start school portal onboarding</p>
      <img style="width:280px;height:280px;margin:16px auto;display:block" alt="QR code" />
      <div class="url" style="font-size:12px;color:#64748b;word-break:break-all;margin-top:12px"></div>
    </div>`;
  doc.querySelector('h1').textContent = agencyName;
  doc.querySelector('img').src = qrDataUrl.value;
  doc.querySelector('.url').textContent = qr.value.url;
  doc.close();
  w.focus();
  setTimeout(() => {
    try { w.print(); } catch { /* ignore */ }
  }, 250);
}

watch(resolvedAgencyId, (id) => {
  if (id) {
    loadInvites();
    loadQr();
  }
});

onMounted(async () => {
  try {
    await agencyStore.fetchUserAgencies?.();
  } catch {
    // ignore
  } finally {
    ready.value = true;
  }
  await renderDemoQr();
  if (resolvedAgencyId.value) {
    await Promise.all([loadInvites(), loadQr()]);
  }
});
</script>

<style scoped>
.so-admin {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem clamp(12px, 1.5vw, 28px) 2.5rem;
}
.so-admin.embedded {
  max-width: none;
  margin: 0;
  padding: 0 0 1.5rem;
}
.so-embed-intro {
  margin: 0 0 1rem;
}
.so-admin__head h1 {
  margin: 4px 0 8px;
  color: var(--primary, #1d4ed8);
}
.back {
  text-decoration: none;
  font-size: 0.9rem;
}
.muted { color: #64748b; }
.tiny { font-size: 0.8rem; margin-top: 2px; }
.error { color: #b91c1c; margin: 0.5rem 0 0; }
.success { color: #047857; margin: 0.5rem 0 0; }
.so-conflict {
  margin-top: 0.85rem;
  padding: 0.75rem;
  border: 1px solid #fde68a;
  background: #fffbeb;
  border-radius: 8px;
}
.so-radio,
.so-check {
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
  margin: 0.4rem 0;
  font-size: 0.9rem;
}
.so-materials-summary {
  font-size: 0.8rem;
  color: #334155;
  max-width: 220px;
  line-height: 1.35;
}
.so-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.25rem 1.35rem;
  margin-top: 1.25rem;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}
.so-card h2 {
  margin: 0 0 1rem;
  font-size: 1.15rem;
}
.so-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 0.75rem;
}
.so-card__row h2 { margin: 0; }
.so-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}
.so-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
  color: #334155;
}
.so-grid .span-2 { grid-column: span 2; }
.so-grid input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}
.so-actions {
  display: flex;
  gap: 10px;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 0.55rem 1rem;
  font: inherit;
  cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.primary {
  background: var(--primary, #1d4ed8);
  color: #fff;
}
.btn.ghost {
  background: #f1f5f9;
  color: #0f172a;
}
a.btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.so-table-wrap { overflow-x: auto; }
.so-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}
.so-table th,
.so-table td {
  text-align: left;
  padding: 0.65rem 0.5rem;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
}
.so-table th { color: #64748b; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.02em; }
.so-invite-row { cursor: pointer; }
.so-invite-row:hover { background: #f8fafc; }
.so-invite-row:focus-visible { outline: 2px solid var(--primary, #1d4ed8); outline-offset: -2px; }
.pill {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #f1f5f9;
  font-size: 0.78rem;
  text-transform: capitalize;
}
.pill[data-status='submitted'],
.pill[data-status='complete'] { background: #dcfce7; color: #166534; }
.pill[data-status='in_progress'] { background: #dbeafe; color: #1d4ed8; }
.pill[data-status='sent'] { background: #e0e7ff; color: #3730a3; }
.pill[data-status='created'],
.pill[data-status='invited'] { background: #f1f5f9; color: #475569; }
.pill[data-status='revoked'],
.pill[data-status='expired'] { background: #fee2e2; color: #991b1b; }
.pill[data-status='not_started'] { background: #f1f5f9; color: #475569; }
.so-activity-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.so-activity-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}
.so-activity-label { font-weight: 600; color: #0f172a; }
.so-activity-detail { margin: 0.2rem 0 0; }
.so-row-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.linkish {
  background: none;
  border: none;
  padding: 0;
  color: var(--primary, #1d4ed8);
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
}
.linkish.danger { color: #b91c1c; }
.linkish.nuke { font-weight: 600; }
.so-actions-legend { margin: 0 0 0.75rem; line-height: 1.45; }
.so-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  justify-content: flex-end;
}
.so-detail-panel {
  width: min(640px, 100%);
  height: 100%;
  background: #f1f5f9;
  box-shadow: -12px 0 40px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.so-detail-panel__head,
.so-detail-panel__foot {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.so-detail-panel__head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.so-detail-panel__head h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #0f172a;
}
.so-detail-panel__foot {
  border-bottom: none;
  border-top: 1px solid #e2e8f0;
  margin-top: auto;
  flex-wrap: wrap;
}
.so-receipt {
  margin: 1rem 1.15rem 1.5rem;
  padding: 1.25rem 1.35rem 1.5rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  overflow: auto;
  flex: 1;
}
.so-receipt__brand {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 0.85rem;
  margin-bottom: 0.65rem;
  border-bottom: 2px solid #0f172a;
}
.so-receipt__eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
}
.so-receipt__title {
  margin: 0.2rem 0 0;
  font-size: 1.15rem;
  color: #0f172a;
}
.so-receipt__meta {
  margin: 0 0 1.15rem;
  font-size: 0.82rem;
  color: #64748b;
}
.so-receipt__block {
  margin: 0 0 1.15rem;
  padding-bottom: 0.95rem;
  border-bottom: 1px dashed #cbd5e1;
}
.so-receipt__block:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.so-receipt__block h4 {
  margin: 0 0 0.55rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}
.so-receipt-lines {
  display: flex;
  flex-direction: column;
}
.so-receipt-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.4rem 0;
  border-bottom: 1px dotted #e2e8f0;
  font-size: 0.92rem;
}
.so-receipt-line:last-child {
  border-bottom: none;
}
.so-receipt-line--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
}
.so-receipt-line__label {
  color: #64748b;
  flex: 0 1 42%;
}
.so-receipt-line__value {
  text-align: right;
  font-weight: 600;
  color: #0f172a;
  word-break: break-word;
}
.so-receipt-line--stack .so-receipt-line__value {
  text-align: left;
  font-weight: 500;
}
.so-receipt-staff {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.so-receipt-staff__card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.65rem 0.8rem;
}
.so-receipt-staff__name {
  font-weight: 700;
  margin-bottom: 0.25rem;
  color: #0f172a;
}
.so-receipt-staff__card .so-receipt-line {
  padding: 0.25rem 0;
}
.so-dl > div {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.5rem;
}
.so-dl dt {
  color: #64748b;
  font-size: 0.85rem;
}
.so-dl dd {
  margin: 0;
  word-break: break-word;
}
.so-step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.so-step-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}
.so-step-key { text-transform: capitalize; }
.so-link-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}
.so-pre {
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.75rem;
  overflow: auto;
  max-height: 240px;
  white-space: pre-wrap;
  word-break: break-word;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  word-break: break-all;
}
.so-actions-legend .nuke-label { color: #b91c1c; }
.linkish:disabled { opacity: 0.45; cursor: not-allowed; }
.so-qr-box {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.75rem;
}
.so-qr-img {
  width: 180px;
  height: 180px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.so-share-card strong {
  color: #0f172a;
}
.so-qr-meta { display: flex; flex-direction: column; gap: 0.75rem; min-width: 220px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
@media (max-width: 720px) {
  .so-grid { grid-template-columns: 1fr; }
  .so-grid .span-2 { grid-column: span 1; }
}
</style>
