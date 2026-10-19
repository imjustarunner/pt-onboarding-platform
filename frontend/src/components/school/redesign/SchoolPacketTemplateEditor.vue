<template>
  <div class="packet-editor">
    <div class="packet-editor-header">
      <div>
        <h2 style="margin:0;">Enrollment packet documents</h2>
        <div class="muted" style="margin-top:4px;">
          Edit each source document in the library. Printed school packets include the current saved text, school staff, and provider disclosure automatically.
        </div>
        <div class="locale-tabs" role="tablist" aria-label="Packet language">
          <button
            type="button"
            role="tab"
            class="locale-tab"
            :class="{ active: locale === 'en' }"
            :aria-selected="locale === 'en'"
            :disabled="loading"
            @click="switchLocale('en')"
          >
            English
          </button>
          <button
            type="button"
            role="tab"
            class="locale-tab"
            :class="{ active: locale === 'es' }"
            :aria-selected="locale === 'es'"
            :disabled="loading"
            @click="switchLocale('es')"
          >
            Español
          </button>
        </div>
        <p v-if="locale === 'es'" class="muted locale-note">
          Spanish text is a first-pass translation — have a native speaker / legal review before relying on it for client signatures.
        </p>
      </div>
      <div class="packet-editor-actions">
        <span class="version-pill">{{ localeLabel }} · V{{ version || '—' }}</span>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="toggleHistory">
          {{ showHistory ? 'Hide history' : 'Version history' }}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="$emit('close')">
          Close
        </button>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-top:10px;">{{ error }}</div>
    <div v-if="success" class="success" style="margin-top:10px;">{{ success }}</div>
    <div v-if="loading" class="loading" style="margin-top:10px;">Loading template…</div>

    <div v-else-if="showHistory" class="version-history">
      <div v-if="historyLoading" class="muted">Loading versions…</div>
      <div v-else-if="!versions.length" class="muted">No archived packet versions are available.</div>
      <ul v-else class="version-list">
        <li v-for="v in versions" :key="v.id || v.version" class="version-row">
          <div>
            <strong>V{{ v.version }}</strong>
            <span class="muted" style="margin-left:8px;">{{ formatWhen(v.created_at) }}</span>
            <span v-if="Number(v.version) === Number(version)" class="current-badge">current</span>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="viewVersion(v.version)">View HTML</button>
        </li>
      </ul>
      <div v-if="previewHtml" class="version-preview">
        <div class="version-preview-head">
          <strong>V{{ previewVersion }} (read-only)</strong>
          <button class="btn btn-ghost btn-sm" type="button" @click="previewHtml = ''; previewVersion = null">Close preview</button>
        </div>
        <iframe class="version-preview-frame" :srcdoc="previewHtml" title="Packet version preview" sandbox="" />
      </div>
    </div>

    <div v-else class="packet-editor-body">
      <section class="legal-copy-card">
        <h3>Individual enrollment documents</h3>
        <p class="muted">Open the library to update individual consents and policies, review the current packet, or share a document with a client.</p>
        <router-link v-if="packetAgencyId" class="btn btn-primary btn-sm" :to="enrollmentTo">Open enrollment documents</router-link>
      </section>
      <section class="legal-copy-card">
        <h3>Age of consent &amp; other-guardian resources</h3>
        <p class="muted">Shown on school/office intake when another parent has medical decision-making rights, and injected into the Minor Consent packet section. Support/admin can also edit this on the live intake page.</p>
        <label>Lead<textarea v-model="legalDraft.otherGuardianLead" rows="2" /></label>
        <label>Age of consent note<textarea v-model="legalDraft.ageOfConsentNote" rows="3" /></label>
        <label>No-email delay warning<textarea v-model="legalDraft.noEmailWarning" rows="2" /></label>
        <div v-for="(r, idx) in legalDraft.resources" :key="idx" class="legal-res">
          <input v-model.trim="r.label" placeholder="Link label" />
          <input v-model.trim="r.url" placeholder="https://" />
        </div>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="legalSaving || !agencySlug" @click="saveLegalCopy">
          {{ legalSaving ? 'Saving…' : 'Save resource copy' }}
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, reactive } from 'vue';
import api from '../../../services/api';
import { enrollmentLibraryLocation } from '../../../utils/enrollmentLibraryLocation.js';
import { useAgencyStore } from '../../../store/agency';

const props = defineProps({
  schoolOrganizationId: { type: [Number, String], required: true },
  initialLocale: { type: String, default: 'en' }
});

defineEmits(['close']);

const locale = ref(String(props.initialLocale || 'en').toLowerCase() === 'es' ? 'es' : 'en');
const loading = ref(false);
const error = ref('');
const success = ref('');
const version = ref(null);
const showHistory = ref(false);
const historyLoading = ref(false);
const versions = ref([]);
const previewHtml = ref('');
const previewVersion = ref(null);
const legalSaving = ref(false);
const legalDraft = reactive({
  otherGuardianLead: '',
  ageOfConsentNote: '',
  noEmailWarning: '',
  resources: [{ label: '', url: '' }, { label: '', url: '' }]
});
const agencyStore = useAgencyStore();
const packetAgencyId = ref(null);
let loadSequence = 0;
const enrollmentTo = computed(() => enrollmentLibraryLocation({ agencyId: packetAgencyId.value, agencies: [agencyStore.currentAgency, ...(agencyStore.userAgencies || [])], setting: 'school', locale: locale.value, schoolId: props.schoolOrganizationId }));
const agencySlug = computed(() => {
  const agency = [agencyStore.currentAgency, ...(agencyStore.userAgencies || [])].find(item => item && Number(item.id) === packetAgencyId.value);
  return String(agency?.slug || agency?.portal_url || '').trim();
});

const localeLabel = computed(() => (locale.value === 'es' ? 'ES' : 'EN'));

function formatWhen(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

const loadVersions = async () => {
  historyLoading.value = true;
  try {
    const res = await api.get(`/school-portal/${props.schoolOrganizationId}/printable-packet/template/versions`, {
      params: { locale: locale.value }
    });
    versions.value = Array.isArray(res.data?.versions) ? res.data.versions : [];
  } catch {
    versions.value = [];
  } finally {
    historyLoading.value = false;
  }
};

const toggleHistory = async () => {
  showHistory.value = !showHistory.value;
  previewHtml.value = '';
  previewVersion.value = null;
  if (showHistory.value) await loadVersions();
};

const viewVersion = async (ver) => {
  try {
    const res = await api.get(
      `/school-portal/${props.schoolOrganizationId}/printable-packet/template/versions/${ver}`,
      { params: { locale: locale.value } }
    );
    previewHtml.value = String(res.data?.version?.html_content || '');
    previewVersion.value = Number(ver);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load version';
  }
};

const load = async () => {
  const sequence = ++loadSequence;
  try {
    loading.value = true;
    packetAgencyId.value = null;
    error.value = '';
    success.value = '';
    showHistory.value = false;
    previewHtml.value = '';
    const res = await api.get(`/school-portal/${props.schoolOrganizationId}/printable-packet/template`, {
      params: { locale: locale.value }
    });
    if (sequence !== loadSequence) return;
    packetAgencyId.value = Number(res.data?.agencyId) || null;
    version.value = Number(res.data?.version || 1);
    await loadLegalCopy();
  } catch (e) {
    if (sequence === loadSequence) error.value = e.response?.data?.error?.message || e.message || 'Failed to load packet template';
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
};

const switchLocale = async (next) => {
  const loc = next === 'es' ? 'es' : 'en';
  if (loc === locale.value) return;
  locale.value = loc;
  await load();
};

const loadLegalCopy = async () => {
  if (!agencySlug.value) return;
  try {
    const { data } = await api.get(`/public/agency-support/${encodeURIComponent(agencySlug.value)}`, {
      skipGlobalLoading: true
    });
    const pack = data?.intakeLegal?.[locale.value] || data?.intakeLegal?.en || {};
    legalDraft.otherGuardianLead = pack.otherGuardianLead || '';
    legalDraft.ageOfConsentNote = pack.ageOfConsentNote || '';
    legalDraft.noEmailWarning = pack.noEmailWarning || '';
    const list = Array.isArray(pack.resources) ? pack.resources.map((r) => ({ label: r.label || '', url: r.url || '' })) : [];
    while (list.length < 2) list.push({ label: '', url: '' });
    legalDraft.resources = list.slice(0, 4);
  } catch {
    /* keep empty until save */
  }
};

const saveLegalCopy = async () => {
  if (!agencySlug.value) return;
  legalSaving.value = true;
  try {
    await api.patch(`/public/agency-support/${encodeURIComponent(agencySlug.value)}/settings`, {
      locale: locale.value,
      intakeLegal: { ...legalDraft }
    });
    success.value = 'Saved age-of-consent / other-guardian copy.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save resource copy';
  } finally {
    legalSaving.value = false;
  }
};

watch(() => props.schoolOrganizationId, () => load());
watch(() => props.initialLocale, (v) => {
  const loc = String(v || 'en').toLowerCase() === 'es' ? 'es' : 'en';
  if (loc !== locale.value) {
    locale.value = loc;
    load();
  }
});

onMounted(load);
onBeforeUnmount(() => { loadSequence++; });
</script>

<style scoped>
.packet-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.packet-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.packet-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.locale-tabs {
  display: inline-flex;
  gap: 4px;
  margin-top: 10px;
  padding: 3px;
  border-radius: 999px;
  background: #f3f4f6;
}
.locale-tab {
  border: 0;
  background: transparent;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
  cursor: pointer;
}
.locale-tab.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.locale-note {
  margin: 8px 0 0;
  max-width: 42rem;
}
.version-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-weight: 600;
}
.packet-editor-body {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 12px;
}
.legal-copy-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
}
.legal-copy-card h3 { margin: 0; font-size: 15px; }
.legal-copy-card label { display: grid; gap: 4px; font-size: 12px; font-weight: 700; }
.legal-copy-card textarea,
.legal-res input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
}
.legal-res { display: grid; grid-template-columns: 1fr 1.4fr; gap: 6px; }
.version-history {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fafafa;
}
.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.version-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #e5e7eb;
}
.current-badge {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #047857;
  background: #ecfdf5;
  border-radius: 999px;
  padding: 2px 8px;
}
.version-preview {
  margin-top: 12px;
}
.version-preview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.version-preview-frame {
  width: 100%;
  height: 420px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
}
.btn-ghost {
  background: transparent;
  border: 1px solid transparent;
  color: #6b7280;
  cursor: pointer;
}
.muted { color: #6b7280; font-size: 13px; }
.error { color: #b91c1c; font-size: 13px; }
.success { color: #047857; font-size: 13px; }
.loading { color: #6b7280; font-size: 13px; }
code {
  font-size: 11px;
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 4px;
}
</style>
