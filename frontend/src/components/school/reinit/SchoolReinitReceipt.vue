<template>
  <div class="rcpt" :style="brandStyle">
    <header class="rcpt__top no-print">
      <div class="rcpt__brand">
        <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" class="rcpt__logo" />
        <div v-else class="rcpt__tenant-name">{{ tenantName }}</div>
      </div>
      <div class="rcpt__school-title">{{ schoolName }}</div>
      <div class="rcpt__user-block">
        <a v-if="helpHref" class="rcpt__help" :href="helpHref">Need help?</a>
        <div v-if="finalizedByLabel" class="rcpt__user-chip">
          <span class="rcpt__avatar">{{ userInitials }}</span>
          <span>{{ finalizedByLabel }}</span>
        </div>
      </div>
    </header>

    <!-- Celebration banner -->
    <section class="rcpt__hero">
      <div class="rcpt__hero-actions no-print">
        <button type="button" class="rcpt__btn-outline" @click="printReceipt">Download PDF</button>
        <button type="button" class="rcpt__btn-outline" @click="printReceipt">Print Summary</button>
      </div>
      <div class="rcpt__check-wrap" aria-hidden="true">
        <div class="rcpt__check">✓</div>
      </div>
      <h1 class="rcpt__hero-title">All Set! Updates Finalized.</h1>
      <p class="rcpt__hero-sub">
        Thank you for collaborating with {{ tenantName }} for the {{ schoolYearLabel }} school year.
      </p>
      <div class="rcpt__meta">
        <div class="rcpt__meta-item">
          <span class="rcpt__meta-label">Finalized on</span>
          <strong>{{ finalizedOnLabel }}</strong>
        </div>
        <div class="rcpt__meta-item">
          <span class="rcpt__meta-label">Finalized by</span>
          <strong>{{ finalizedByLabel || '—' }}</strong>
        </div>
        <div class="rcpt__meta-item">
          <span class="rcpt__meta-label">Reference ID</span>
          <strong>{{ referenceId }}</strong>
        </div>
        <div class="rcpt__meta-item">
          <span class="rcpt__meta-label">Status</span>
          <strong class="rcpt__status">🔒 Finalized</strong>
        </div>
      </div>
      <p class="rcpt__disclaimer">
        This is a summary of the information you reviewed and confirmed. No client information is included.
      </p>
    </section>

    <!-- Summary grid -->
    <section class="rcpt__summary">
      <h2 class="rcpt__summary-title">Your Summary</h2>
      <div class="rcpt__grid">
        <article v-for="card in summaryCards" :key="card.key" class="rcpt__card">
          <div class="rcpt__card-head">
            <span class="rcpt__card-num">{{ card.num }}</span>
            <span class="rcpt__card-icon" v-html="card.icon" />
          </div>
          <h3 class="rcpt__card-title">{{ card.title }}</h3>
          <div class="rcpt__card-body" v-html="card.html" />
        </article>
      </div>
    </section>

    <!-- Addendums list -->
    <section v-if="(addendums || []).length" class="rcpt__addenda-list">
      <h3>Addendums submitted</h3>
      <ul>
        <li v-for="a in addendums" :key="a.id">
          <strong>{{ formatDateTime(a.submitted_at) }}</strong>
          — {{ a.summary_text }}
          <span class="muted">({{ a.submitted_by_display_name || 'Unknown' }})</span>
        </li>
      </ul>
    </section>

    <!-- Finalized notice + addendum CTA -->
    <section class="rcpt__final-bar">
      <div class="rcpt__final-left">
        <span class="rcpt__final-lock" aria-hidden="true">🔒</span>
        <div>
          <strong>This Process is Finalized.</strong>
          <p>
            The token used to access this workflow is now locked. You can no longer make changes to the finalized data.
            <span v-if="pendingChangeCount"> {{ pendingChangeCount }} change request(s) may still be pending admin review.</span>
          </p>
        </div>
      </div>
      <div v-if="!readOnly" class="rcpt__final-right no-print">
        <button
          v-if="!showAddendumForm"
          type="button"
          class="rcpt__btn-addendum"
          @click="openAddendum"
        >
          ✎ Request an Update / Addendum
        </button>
        <p v-if="!showAddendumForm" class="rcpt__addendum-caption">
          Need to make a change? Submit an update. It will be saved as a separate addendum and will not overwrite this finalized information.
        </p>
        <div v-else class="rcpt__addendum-form">
          <label>
            Describe your update
            <textarea v-model="addendumDraft" rows="3" placeholder="What needs to change?" />
          </label>
          <div class="rcpt__addendum-actions">
            <button type="button" class="rcpt__btn-outline" :disabled="submitting" @click="cancelAddendum">Cancel</button>
            <button
              type="button"
              class="rcpt__btn-solid"
              :disabled="submitting || !addendumDraft.trim()"
              @click="submitAddendum"
            >
              {{ submitting ? 'Submitting…' : 'Submit addendum' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <footer class="rcpt__footer no-print">
      <button type="button" class="rcpt__btn-outline" @click="$emit('return-portal')">
        ← Return to Portal
      </button>
      <p class="rcpt__footer-note">
        You can access this summary from your portal until {{ receiptUntilLabel }}.
      </p>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import {
  logoSrc,
  parseAgencyPalette,
  agencyDisplayName,
} from '../../../utils/schoolReinit';

const props = defineProps({
  cycle: { type: Object, default: null },
  agency: { type: Object, default: null },
  school: { type: Object, default: null },
  addendums: { type: Array, default: () => [] },
  pendingChangeCount: { type: Number, default: 0 },
  identityLabel: { type: String, default: '' },
  readOnly: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
});

const emit = defineEmits(['request-addendum', 'submit-addendum', 'return-portal']);

const showAddendumForm = ref(false);
const addendumDraft = ref('');

const snap = computed(() => {
  const c = props.cycle;
  if (!c) return null;
  if (c.snapshot) return c.snapshot;
  if (c.snapshot_json) {
    try {
      return typeof c.snapshot_json === 'string' ? JSON.parse(c.snapshot_json) : c.snapshot_json;
    } catch {
      return null;
    }
  }
  return null;
});

const schoolName = computed(() => props.school?.name || 'School');
const tenantName = computed(() => agencyDisplayName(props.agency, 'Partner'));
const tenantLogo = computed(() => logoSrc(props.agency));
const brandStyle = computed(() => {
  const p = parseAgencyPalette(props.agency);
  return {
    '--rcpt-primary': p.primary,
    '--rcpt-secondary': p.secondary,
    '--rcpt-accent': p.accent,
  };
});

const schoolYearRaw = computed(() => props.cycle?.school_year || snap.value?.schoolYear || '');
const schoolYearLabel = computed(() => {
  const y = String(schoolYearRaw.value || '');
  // 2026-27 → 2026–2027
  const m = y.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}–20${m[2]}`;
  return y || 'this';
});

const finalizedByLabel = computed(
  () =>
    props.identityLabel ||
    props.cycle?.finalized_by_display_name ||
    snap.value?.finalizedByDisplayName ||
    ''
);

const userInitials = computed(() => {
  const parts = String(finalizedByLabel.value || schoolName.value || 'S')
    .split(/[\s,]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
});

const finalizedOnLabel = computed(() => formatDateTime(props.cycle?.finalized_at || snap.value?.finalizedAt));

const referenceId = computed(() => {
  const slug = String(props.school?.slug || props.school?.portal_url || schoolName.value || 'SCH')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12)
    .toUpperCase();
  const year = String(schoolYearRaw.value || '').replace('-', '-');
  const id = props.cycle?.id || 0;
  return `${slug}-${year}-${String(id).padStart(4, '0')}`;
});

const receiptUntilLabel = computed(() => {
  const startYear = Number(String(schoolYearRaw.value || '').slice(0, 4));
  if (!startYear) return 'September 1';
  return `September 1, ${startYear}`;
});

const helpHref = computed(() => null);

const ICONS = {
  calendar: '📅',
  confetti: '🎉',
  providers: '👥',
  staff: '🧑‍💼',
  box: '📦',
  chart: '📊',
  clock: '🗓️',
  heart: '💬',
};

function yn(v) {
  if (v === true || v === 1 || v === '1') return 'Yes';
  if (v === false || v === 0 || v === '0') return 'No';
  return '—';
}
function formatDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateTime(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function line(label, value) {
  return `<div class="rcpt-line"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}
function checkLine(label, ok) {
  const mark = ok === true || ok === 1 || ok === '1' || ok === 'Yes' ? '✓' : ok === false || ok === 0 || ok === '0' || ok === 'No' ? '–' : '·';
  const cls = mark === '✓' ? 'is-yes' : '';
  return `<div class="rcpt-check ${cls}"><span>${mark}</span>${esc(label)}</div>`;
}

const summaryCards = computed(() => {
  const s = snap.value || {};
  const answers = s.events?.answers || {};
  const partnerInvited = answers.bts_partner_invited ?? answers.bts_itsco_invited;
  const mats = s.materials || {};
  const needs = s.needsAssessment || {};
  const fall = s.fallCheckIn || {};
  const fallBooking = s.fallCheckInBooking || {};
  const growth = s.growthFeedback || {};
  const info = s.schoolInformation || {};
  const school = props.school || {};
  const addressParts = [
    school.address || school.street_address || school.address_line1,
    [school.city, school.state || school.region].filter(Boolean).join(', '),
    school.zip || school.postal_code,
  ].filter(Boolean);
  const addressLine = addressParts.join(' · ') || info.notes || 'Reviewed and confirmed.';

  const cards = [
    {
      key: 'school_information',
      num: 1,
      title: 'School Information',
      icon: ICONS.calendar,
      html: `
        <p><strong>${esc(schoolName.value)}</strong></p>
        <p class="muted">${esc(addressLine)}</p>
        ${info.notes && addressParts.length ? `<p class="muted">${esc(info.notes)}</p>` : ''}
      `,
    },
    {
      key: 'school_events',
      num: 2,
      title: 'School Events',
      icon: ICONS.confetti,
      html: `
        ${line('First Day of School', answers.first_day_of_school || formatDate(s.events?.firstDay?.startsAt))}
        ${line('Back-to-School', formatDate(s.events?.backToSchool?.startsAt))}
        ${checkLine(`${tenantName.value} Invited: ${yn(partnerInvited)}`, partnerInvited)}
        ${checkLine(`Marketing Table: ${yn(answers.bts_marketing_table)}`, answers.bts_marketing_table)}
        ${checkLine(`Active Sign-ups: ${answers.bts_active_signups ? 'Permitted' : yn(answers.bts_active_signups)}`, answers.bts_active_signups)}
      `,
    },
    {
      key: 'assigned_providers',
      num: 3,
      title: 'Providers',
      icon: ICONS.providers,
      html: `
        <p><strong>${(s.providers || []).length} Providers</strong></p>
        <p class="muted">${esc(schoolYearLabel.value)} · Confirmed</p>
        <ul class="rcpt-mini">${(s.providers || [])
          .slice(0, 4)
          .map((p) => `<li>${esc(p.name)} — ${esc(p.dayOfWeek)}</li>`)
          .join('')}</ul>
      `,
    },
    {
      key: 'school_staff',
      num: 4,
      title: 'Staff Members',
      icon: ICONS.staff,
      html: `
        <p><strong>${(s.staff || []).length} Staff</strong></p>
        <p class="muted">Reviewed and confirmed.</p>
      `,
    },
    {
      key: 'materials',
      num: 5,
      title: 'Materials Request',
      icon: ICONS.box,
      html: `
        ${checkLine(`Paper Packets: ${yn(mats.need_paper_packets)}`, mats.need_paper_packets)}
        ${checkLine(`Trifolds: ${yn(mats.need_trifolds)}`, mats.need_trifolds)}
        ${checkLine(`Delivery Requested: ${yn(mats.materials_delivery_required)}`, mats.materials_delivery_required)}
      `,
    },
    {
      key: 'needs_assessment',
      num: 6,
      title: 'Needs Assessment',
      icon: ICONS.chart,
      html: `
        ${line('Days / week on-site', needs.days_per_week_onsite ?? '—')}
        <p class="muted">${esc(needs.provider_preferences || 'No special preferences noted.')}</p>
      `,
    },
    {
      key: 'fall_check_in',
      num: 7,
      title: 'Fall School Check-In',
      icon: ICONS.clock,
      html: (() => {
        const modality =
          fallBooking.modality ||
          fall.fall_checkin_modality ||
          (fall.fall_checkin_meet_link ? 'virtual' : null);
        const modalityLabel =
          modality === 'virtual' ? 'Virtual' : modality === 'in_person' ? 'In person (school)' : '—';
        const when =
          fall.fall_checkin_starts_at ||
          fallBooking.startsAt ||
          fallBooking.starts_at ||
          fall.fall_checkin_preferred_week ||
          (fall.fall_checkin_slot_id ? `Slot #${fall.fall_checkin_slot_id}` : '—');
        const meet = fallBooking.meetLink || fallBooking.meet_link || fall.fall_checkin_meet_link;
        const loc = fallBooking.locationText || fallBooking.location_text || fall.fall_checkin_location;
        const invited = Array.isArray(fallBooking.invitedSchoolStaff)
          ? fallBooking.invitedSchoolStaff.length
          : Array.isArray(fallBooking.invited_school_staff_json)
            ? fallBooking.invited_school_staff_json.length
            : null;
        return `
        ${line('Format', modalityLabel)}
        ${line('When', when)}
        ${loc ? line('Location', loc) : ''}
        ${meet ? line('Meet link', meet) : ''}
        ${invited != null ? line('School staff invited', String(invited)) : ''}
        ${line('Preferred day', fall.fall_checkin_preferred_day || '—')}
        ${line('Preferred time', fall.fall_checkin_preferred_time || '—')}
      `;
      })(),
    },
    {
      key: 'growth_feedback',
      num: 8,
      title: 'Growth & Feedback',
      icon: ICONS.heart,
      html: `
        ${
          growth.overall_satisfaction != null
            ? line('Overall satisfaction', `${growth.overall_satisfaction} / 5`)
            : ''
        }
        ${growth.recommend_nps != null ? line('Recommend (NPS)', `${growth.recommend_nps} / 10`) : ''}
        <p>${esc(growth.looking_forward_to || '—')}</p>
        ${growth.marketing_quote ? `<p class="rcpt-quote">“${esc(growth.marketing_quote)}”</p>` : ''}
        ${line('Attribution', growth.marketing_quote_named ? 'Named' : growth.marketing_quote ? 'Anonymous' : '—')}
        ${line('District contacts', growth.district_contacts ? 'Yes' : '—')}
        ${checkLine(
          growth.annual_feedback_all_good ? 'Annual Feedback: All Good' : 'Annual Feedback noted',
          growth.annual_feedback_all_good || growth.annual_feedback_more || growth.annual_feedback_less
        )}
      `,
    },
  ];

  // Align numbers with SECTION_META order (skip Active Clients — deferred)
  return cards.map((c, i) => ({ ...c, num: i + 1 }));
});

function printReceipt() {
  window.print();
}
function openAddendum() {
  if (props.readOnly) return;
  showAddendumForm.value = true;
  emit('request-addendum');
}
function cancelAddendum() {
  showAddendumForm.value = false;
  addendumDraft.value = '';
}
function submitAddendum() {
  const text = addendumDraft.value.trim();
  if (!text) return;
  emit('submit-addendum', text);
  addendumDraft.value = '';
  showAddendumForm.value = false;
}
</script>

<style scoped>
.rcpt {
  --rcpt-primary: #0c4a6e;
  --rcpt-secondary: #2d6a4f;
  --rcpt-accent: #2563eb;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1e293b;
  background: #f8fafc;
  padding: 0 0 28px;
}
.rcpt__top {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  gap: 12px;
  align-items: center;
  padding: 16px 22px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}
.rcpt__logo {
  height: 42px;
  width: auto;
  object-fit: contain;
}
.rcpt__tenant-name {
  font-weight: 800;
  color: var(--rcpt-primary);
  font-size: 0.95rem;
}
.rcpt__school-title {
  text-align: center;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.35rem;
  font-weight: 700;
}
.rcpt__user-block {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}
.rcpt__help {
  font-size: 0.85rem;
  color: var(--rcpt-accent);
  text-decoration: none;
}
.rcpt__user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
}
.rcpt__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #dbeafe;
  color: var(--rcpt-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
}

.rcpt__hero {
  position: relative;
  text-align: center;
  padding: 28px 22px 20px;
  background: #fff;
  margin: 16px 18px 0;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
}
.rcpt__hero-actions {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  gap: 8px;
}
.rcpt__check-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}
.rcpt__check {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--rcpt-secondary);
  color: #fff;
  font-size: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 8px rgba(45, 106, 79, 0.12), 0 0 0 16px rgba(45, 106, 79, 0.06);
}
.rcpt__hero-title {
  margin: 8px 0 6px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.85rem;
  font-weight: 700;
  color: #14532d;
}
.rcpt__hero-sub {
  margin: 0 auto 16px;
  max-width: 520px;
  color: #64748b;
  font-size: 0.95rem;
}
.rcpt__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  max-width: 820px;
  margin: 0 auto 12px;
  text-align: left;
}
.rcpt__meta-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
}
.rcpt__meta-label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  font-weight: 700;
  margin-bottom: 2px;
}
.rcpt__meta-item strong {
  font-size: 0.85rem;
}
.rcpt__status {
  color: var(--rcpt-secondary);
}
.rcpt__disclaimer {
  margin: 0;
  font-size: 0.78rem;
  color: #94a3b8;
}

.rcpt__summary {
  padding: 18px 18px 0;
}
.rcpt__summary-title {
  margin: 0 0 12px;
  font-size: 1.1rem;
  font-weight: 800;
}
.rcpt__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.rcpt__card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 14px 12px;
  min-height: 150px;
}
.rcpt__card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.rcpt__card-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.rcpt__card-icon {
  font-size: 1.1rem;
}
.rcpt__card-title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 800;
}
.rcpt__card-body {
  font-size: 0.82rem;
  color: #334155;
  line-height: 1.4;
}
.rcpt__card-body :deep(.muted) {
  color: #94a3b8;
  margin: 4px 0 0;
}
.rcpt__card-body :deep(.rcpt-line) {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.rcpt__card-body :deep(.rcpt-line span) {
  color: #64748b;
}
.rcpt__card-body :deep(.rcpt-check) {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 3px 0;
  color: #64748b;
}
.rcpt__card-body :deep(.rcpt-check.is-yes) {
  color: var(--rcpt-secondary);
  font-weight: 600;
}
.rcpt__card-body :deep(.rcpt-mini) {
  margin: 6px 0 0;
  padding-left: 16px;
  color: #64748b;
}
.rcpt__card-body :deep(.rcpt-quote) {
  font-style: italic;
  color: #475569;
  margin: 6px 0;
}

.rcpt__addenda-list {
  margin: 16px 18px 0;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.rcpt__addenda-list h3 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.rcpt__addenda-list ul {
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
}
.muted {
  color: #94a3b8;
}

.rcpt__final-bar {
  margin: 16px 18px 0;
  padding: 16px 18px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 18px;
  align-items: start;
}
.rcpt__final-left {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.rcpt__final-lock {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #dcfce7;
  color: var(--rcpt-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rcpt__final-left strong {
  display: block;
  margin-bottom: 4px;
}
.rcpt__final-left p {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.4;
}
.rcpt__btn-addendum {
  width: 100%;
  border: 2px solid var(--rcpt-secondary);
  background: #fff;
  color: var(--rcpt-secondary);
  border-radius: 10px;
  padding: 12px 14px;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
}
.rcpt__btn-addendum:hover {
  background: #f0fdf4;
}
.rcpt__addendum-caption {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.35;
}
.rcpt__addendum-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 700;
}
.rcpt__addendum-form textarea {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.rcpt__addendum-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}

.rcpt__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 0;
}
.rcpt__footer-note {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}
.rcpt__btn-outline {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}
.rcpt__btn-solid {
  border: none;
  background: var(--rcpt-secondary);
  color: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}
.rcpt__btn-solid:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .rcpt__top {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .rcpt__user-block {
    justify-content: center;
  }
  .rcpt__meta,
  .rcpt__grid,
  .rcpt__final-bar {
    grid-template-columns: 1fr;
  }
  .rcpt__hero-actions {
    position: static;
    justify-content: center;
    margin-bottom: 12px;
  }
}

@media print {
  .no-print {
    display: none !important;
  }
  .rcpt {
    background: #fff;
  }
  .rcpt__hero,
  .rcpt__card,
  .rcpt__final-bar {
    break-inside: avoid;
  }
}
</style>
