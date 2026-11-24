<template>
  <div class="cc-hub" :class="{ 'cc-hub--overview-only': !showQuickActions }">
    <div class="cc-hub__main">
      <header class="cc-hub-pagehead">
        <div class="cdp-overview-toolbar" style="margin: 0;">
          <div>
            <h3 class="cc-hub-title">Overview</h3>
            <p>{{ [statusLabel, careTeamLabel].filter(Boolean).join(" · ") }}</p>
          </div>
          <button
            v-if="canEdit"
            class="cdp-btn-soft"
            type="button"
            @click="$emit('edit')"
          >
            Edit client
          </button>
        </div>
      </header>

      <section v-for="contact in overviewContacts" :key="contact.id" class="cc-contact" :aria-label="contact.label">
        <div>
          <h4>{{ contact.label }}</h4>
          <strong>{{ contact.name }}</strong>
          <p v-if="contact.relationship">{{ contact.relationship }}</p>
        </div>
        <dl>
          <div><dt>Phone</dt><dd><a v-if="contact.phone" :href="`tel:${contact.phone.replace(/[^+0-9]/g, '')}`">{{ contact.phone }}</a><span v-else>No phone on file</span></dd></div>
          <div><dt>Email</dt><dd><a v-if="contact.email" :href="`mailto:${contact.email}`">{{ contact.email }}</a><span v-else>No email on file</span></dd></div>
        </dl>
      </section>

      <section v-if="canLoadEssentials" aria-label="Client essentials">
        <p v-if="essentialsLoading" class="muted" role="status">Loading overview…</p>
        <p v-else-if="!essentials" class="muted">Client essentials are unavailable. <button type="button" class="cdp-text-link" @click="loadEssentials">Retry</button></p>
        <dl v-else class="cc-essentials">
          <div v-for="item in essentialItems" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
            <dd v-if="item.detail" class="muted">{{ item.detail }}</dd>
          </div>
        </dl>
      </section>
      <slot v-else name="clinical-summary" />

      <div v-if="alerts.length" class="cc-attention">
        <strong>Needs attention</strong>
        <ul class="cc-attention__list">
          <li v-for="alert in alerts" :key="alert.id">
            <button type="button" @click="$emit('alert-click', alert)">
              {{ alert.label }}
            </button>
          </li>
        </ul>
      </div>

      <details class="cc-overview-details">
        <summary>Care activity, documents and team</summary>
        <slot v-if="canLoadEssentials" name="clinical-summary" />
        <ClientSupplementaryRecords v-if="canViewPrivateChart && client?.agency_id" :client-id="clientId" :agency-id="client.agency_id" :refresh-key="client" :linked-guardians="linkedGuardians" />
        <FamilyWelcomeWorkflowCard :agency-id="client?.agency_id" :client-id="clientId" />
      <section>
        <h3 class="cc-hub-section__title">Care workflow</h3>
        <ClientCareTimeline
          :client-id="clientId"
          :client="client"
          title=""
          hint=""
          @view-event="$emit('view-event', $event)"
        />
      </section>

      <section>
        <h3 class="cc-hub-section__title">Document snapshot</h3>
        <div v-if="docsLoading" class="muted">Loading files…</div>
        <div v-else-if="!docRows.length" class="muted">No signed files on the chart yet.</div>
        <div v-else class="cc-docs-snap">
          <div v-for="row in docRows" :key="row.id" class="cc-docs-snap__row">
            <div>
              <strong>{{ row.title }}</strong>
              <div class="muted tiny">{{ row.kindLabel }} · {{ row.missing ? 'Not on file' : 'On file' }}</div>
            </div>
            <button
              v-if="row.viewKey"
              type="button"
              class="cdp-text-link"
              @click="$emit('open-document', row.viewKey)"
            >
              View →
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 class="cc-hub-section__title">Care team and organization</h3>
        <div class="cdp-contacts-grid">
          <article class="cdp-contact-card">
            <div class="cdp-contact-card__role">Primary clinician</div>
            <button v-if="canEdit && glanceItems.some(item => item.assignable)" type="button" class="cdp-contact-card__name cc-provider-assign" @click="$emit('assign-provider')">{{ careTeamLabel }}</button>
            <div v-else class="cdp-contact-card__name">{{ careTeamLabel }}</div>
            <div class="cdp-glance-meta">{{ organizationName || '—' }}</div>
          </article>
          <article class="cdp-contact-card">
            <div class="cdp-contact-card__role">Organization</div>
            <div class="cdp-contact-card__name">{{ organizationName || '—' }}</div>
            <div v-if="programLabel" class="cdp-glance-meta">{{ programLabel }}</div>
          </article>
        </div>
      </section>
      </details>
    </div>

    <aside v-if="showQuickActions" class="cc-hub__aside">
      <section class="cc-side-card">
        <h4>Quick actions</h4>
        <div class="cc-side-actions">
          <button v-if="canEdit" type="button" class="cdp-btn-primary" @click="$emit('edit')">Edit client</button>
          <button v-if="canSendSecureMessage" type="button" class="cdp-btn-soft" @click="$emit('secure-message')">Send secure message</button>
          <button type="button" class="cdp-btn-soft" @click="$emit('upload')">Upload document</button>
          <button v-if="canProcessPaper" type="button" class="cdp-btn-soft" @click="$emit('client-actions', 'process')">Process paper packet</button>
        </div>
      </section>
    </aside>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import { operationalClientDocuments } from '../../../utils/operationalClientDocuments.js';
import { enrollmentReceiptCards } from '../../../utils/enrollmentReceiptCards.js';
import ClientCareTimeline from './ClientCareTimeline.vue';
import ClientSupplementaryRecords from './ClientSupplementaryRecords.vue';
import FamilyWelcomeWorkflowCard from '../../school/FamilyWelcomeWorkflowCard.vue';
import '../../../styles/client-hub.css';

const props = defineProps({
  showQuickActions: { type: Boolean, default: true },
  clientId: { type: [Number, String], required: true },
  client: { type: Object, default: null },
  canProcessPaper: Boolean,
  canSendSecureMessage:{type:Boolean,default:false},
  canEdit: { type: Boolean, default: false },
  canViewMedicalRecord: { type: Boolean, default: false },
  canViewPrivateChart: { type: Boolean, default: false },
  canViewEssentials: Boolean,
  glanceItems: { type: Array, default: () => [] },
  statusLabel: { type: String, default: '' },
  programLabel: { type: String, default: '' },
  careTeamLabel: { type: String, default: '' },
  careTeamMeta: { type: String, default: '' },
  sessionCountLabel: { type: String, default: '—' },
  lastSessionLabel: { type: String, default: '—' },
  alerts: { type: Array, default: () => [] },
  guardianName: { type: String, default: '' },
  guardianLoading: Boolean,
  guardianError: String,
  linkedGuardians: { type: Array, default: () => [] },
  contactRole: { type: String, default: 'Guardian' },
  contactEmail: String,
  contactPhone: String,
  organizationName: { type: String, default: '' }
});

defineEmits(['secure-message','upload','client-actions','edit', 'assign-provider', 'navigate', 'alert-click', 'view-event', 'open-document']);

// Keep each name and its contact channels on the same canonical account. An
// intake contact is only a fallback when no linked guardian has been loaded.
const overviewContacts = computed(() => {
  const guardians = props.linkedGuardians.filter(row => {
    let permissions = row.permissions_json || {};
    if (typeof permissions === 'string') { try { permissions = JSON.parse(permissions); } catch { return false; } }
    return row.relationship_type !== 'self' && !permissions.relationshipRevoked && ![0, '0', false].includes(row.is_active);
  });
  if (guardians.length) return guardians.map((row, index) => ({
    id: row.guardian_user_id, label: `Parent / Guardian ${index + 1}`,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Guardian',
    relationship: row.relationship_title || '', email: row.email || '',
    phone: String(row.phone || row.phone_number || row.personal_phone || row.work_phone || '')
  }));
  return [{ id: 'contact', label: props.contactRole,
    name: props.guardianName || (props.guardianLoading ? 'Loading contact…' : props.guardianError ? 'Contact information unavailable' : 'No contact on file'),
    email: props.contactEmail, phone: props.contactPhone }];
});

/** @param {string} [viewKey] — chart artifact viewKey; parent opens Documents and views it directly */

const docsLoading = ref(false);
const artifacts = ref([]);

const essentials = ref(null);
const essentialsLoading = ref(false);
const canLoadEssentials = computed(() => !!props.client?.agency_id && props.canViewEssentials);
let essentialsGeneration = 0;

async function loadEssentials() {
  const generation = ++essentialsGeneration;
  essentials.value = null;
  essentialsLoading.value = canLoadEssentials.value;
  if (!canLoadEssentials.value) return;
  try {
    const { data } = await api.get(`/clients/${Number(props.clientId)}/overview-essentials`, {
      params: { agencyId: props.client.agency_id }, skipGlobalLoading: true
    });
    if (generation === essentialsGeneration) essentials.value = data;
  } catch {
    if (generation === essentialsGeneration) essentials.value = null;
  } finally {
    if (generation === essentialsGeneration) essentialsLoading.value = false;
  }
}
watch([() => props.clientId, () => props.client?.agency_id, canLoadEssentials], loadEssentials, { immediate: true });

const insurerTypes = { medicaid: 'Medicaid', medicare: 'Medicare', commercial: 'Commercial', tricare: 'TRICARE' };
const essentialItems = computed(() => {
  const { timeZone, policies, billing, disclosure, intakeAt, intakeUnavailable, treatmentPlan, today, sessions } = essentials.value;
  const localDate = new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium' });
  const calendarDate = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateKey = (value) => {
    const { year, month, day } = Object.fromEntries(calendarDate.formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return `${year}-${month}-${day}`;
  };
  const displayDate = value => value && Number.isFinite(Date.parse(value)) ? localDate.format(new Date(value)) : '';
  const ageLabel = days => days === 0 ? 'Today' : Number.isFinite(days) && days > 0 ? `${days} day${days === 1 ? '' : 's'} ago` : '';
  const signedDisclosure = artifacts.value.find(row => row.kind === 'disclosure' && row.hasSignature && row.signedAt);
  const packet = artifacts.value.find(row => row.kind === 'packet' && row.hasSignature && row.signedAt);
  const intakeDate = [intakeAt, packet?.signedAt].filter(value => value && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const intakeAge = intakeDate ? Math.round((Date.parse(today) - Date.parse(dateKey(intakeDate))) / 86400000) : null;
  const planDate = treatmentPlan?.date && new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(treatmentPlan.date + 'T00:00:00Z'));
  return [
    { label: 'Insurance', value: policies === null ? 'Unavailable' : policies.length ? policies.map(policy => [policy.insurerName, insurerTypes[policy.programType]].filter(Boolean).join(' · ')).join(' / ') : 'No insurer on file' },
    ...billing ? [
      { label: 'Insurance verification', value: billing.verificationUnavailable ? 'Unavailable' : !policies?.length ? 'No policy on file' : billing.verification?.current ? 'Verified' : billing.verification?.verifiedAt ? 'Verification needs renewal' : 'Unverified', detail: displayDate(billing.verification?.verifiedAt) },
      { label: 'Payment setup', value: !billing.payment ? 'Unavailable' : billing.payment.cardOnFile ? 'Card on file' : billing.payment.medicaid ? 'Card generally not needed' : 'No card on file' }
    ] : [],
    { label: 'Disclosure agreement', value: disclosure?.includesViewer === true ? 'You are listed' : disclosure?.includesViewer === false ? 'Your name is not listed' : disclosure || signedDisclosure ? 'Review signed agreement' : 'No signed agreement on file', detail: displayDate(disclosure?.signedAt || signedDisclosure?.signedAt) },
    { label: 'Intake', value: displayDate(intakeDate) || (intakeUnavailable ? 'Unavailable' : 'No completed intake on file'), detail: ageLabel(intakeAge) },
    { label: 'Treatment plan', value: planDate || (treatmentPlan ? 'No signed plan on file' : 'Unavailable'), detail: planDate ? [ageLabel(treatmentPlan.ageDays), treatmentPlan.current ? 'Current' : 'Review due'].filter(Boolean).join(' · ') : '' },
    { label: 'Last session', value: displayDate(sessions?.lastAt) || (!sessions || sessions.unavailable ? 'Unavailable' : 'None on record') },
    { label: 'Next session', value: displayDate(sessions?.nextAt) || (!sessions || sessions.unavailable ? 'Unavailable' : 'None scheduled') }
  ];
});

const docRows = computed(() => (artifacts.value || []).filter((a) => !a.missing).slice(0, 5));

async function loadDocs() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  docsLoading.value = true;
  try {
    if(!props.canViewMedicalRecord){artifacts.value=await operationalClientDocuments(api,id,{school:props.client?.client_type==='school'});return;}
    const resp = await api.get(`/phi-documents/clients/${id}/chart-artifacts`, { skipGlobalLoading: true });
    artifacts.value = Array.isArray(resp.data?.artifacts) ? resp.data.artifacts : [];
  } catch (err) {
    if (err?.response?.status === 403) {
      try {
        const receipts = await api.get(`/phi-documents/clients/${id}/enrollment-receipts`, { skipGlobalLoading: true });
        artifacts.value = enrollmentReceiptCards(receipts.data);
        return;
      } catch {
        artifacts.value = [];
        return;
      }
    }
    artifacts.value = [];
  } finally {
    docsLoading.value = false;
  }
}

onMounted(loadDocs);
watch(() => props.clientId, loadDocs);
</script>

<style scoped>
.cc-hub--overview-only { grid-template-columns: minmax(0, 1fr); }
.cc-contact { display:flex; align-items:flex-start; flex-wrap:wrap; gap:12px 32px; padding:14px 16px; border:1px solid var(--border,#dce4ee); border-radius:12px; }
.cc-contact h4, .cc-contact dl { margin:0; }
.cc-contact h4, .cc-contact dt { font-size:.825rem; color:var(--text-secondary,#52647a); margin-bottom:3px; }
.cc-contact dl { display:flex; flex-wrap:wrap; gap:10px 28px; }
.cc-contact dd { margin:0; overflow-wrap:anywhere; }
.cc-essentials { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); margin: 0; border: 1px solid var(--border, #dce4ee); border-radius: 12px; padding: 8px 16px; gap: 4px 18px; }
.cc-essentials > div { padding: 12px 0; min-width: 0; }
.cc-essentials dt { font-size: .825rem; color: var(--text-secondary, #52647a); }
.cc-essentials dd { margin: 3px 0 0; overflow-wrap: anywhere; font-weight: 600; }
.cc-essentials dd.muted { font-weight: 400; font-size: .825rem; }
.cc-overview-details { border-top: 1px solid var(--border, #dce4ee); padding-top: 12px; }
.cc-overview-details > summary { cursor: pointer; font-weight: 650; margin-bottom: 12px; }
.cc-overview-details > section { margin-block: 16px; }

.cc-provider-assign {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
