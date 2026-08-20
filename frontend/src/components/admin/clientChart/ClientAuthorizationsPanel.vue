<template>
  <div class="cap">
    <div class="cap-head">
      <div>
        <h3 class="cap-title">Authorizations</h3>
        <p class="hint">
          Smart ROI, HIPAA / consent notices, Smart Disclosure, and related signed authorizations for this client.
        </p>
      </div>
      <button type="button" class="cdp-btn-soft" :disabled="loading" @click="load">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading && !rows.length" class="muted">Loading authorizations…</div>
    <div v-else-if="!rows.length" class="muted">No authorization documents on file yet.</div>
    <div v-else class="cap-grid">
      <article v-for="row in rows" :key="row.id" class="cap-card">
        <div class="cap-card__kicker">{{ row.kindLabel || row.kind }}</div>
        <strong>{{ row.title }}</strong>
        <div class="muted tiny">
          <span v-if="row.missing">Not on file</span>
          <span v-else-if="row.signedAt">Signed {{ formatWhen(row.signedAt) }}</span>
          <span v-else-if="row.inPaperPacket" class="cap-badge cap-badge--paper">In paper packet</span>
          <span v-else>On file</span>
        </div>
        <!-- Digital view for documents that have a viewKey and are not paper-only -->
        <button
          v-if="row.viewKey && !row.missing && !row.inPaperPacket"
          type="button"
          class="btn btn-primary btn-sm"
          style="margin-top: 8px;"
          @click="$emit('open-document', row.viewKey)"
        >
          View
        </button>
      </article>
    </div>

    <!-- Paper packet version block ─────────────────────────────────────────── -->
    <div v-if="paperPacketVersion" class="cap-pp-block">
      <div class="cap-pp-head">
        <div class="cap-pp-badge">Paper packet</div>
        <div class="cap-pp-label">Signed version: <strong>v{{ paperPacketVersion.versionLabel }}</strong></div>
        <button
          v-if="paperPacketVersion.organizationId"
          type="button"
          class="cap-pp-view-btn"
          :disabled="loadingPdf"
          @click="viewVersionedPdf"
        >
          {{ loadingPdf ? 'Opening…' : `View v${paperPacketVersion.versionLabel}` }}
        </button>
      </div>
      <div class="cap-pp-desc muted tiny">
        Each document below reflects the exact content that was in this version of the packet.
      </div>
      <div class="cap-pp-sections">
        <article
          v-for="sec in paperPacketSections"
          :key="sec.key"
          class="cap-pp-section"
        >
          <div class="cap-pp-sec-title">{{ sec.title }}</div>
          <div class="cap-pp-sec-meta muted tiny">
            <span>In packet v{{ paperPacketVersion.versionLabel }}</span>
            <span v-if="sec.templateVersion"> · template rev {{ sec.templateVersion }}</span>
          </div>
          <button
            v-if="paperPacketVersion.organizationId"
            type="button"
            class="cap-pp-view-btn cap-pp-view-btn--sm"
            :disabled="loadingPdf"
            @click="viewVersionedPdf(sec.anchor)"
          >
            View
          </button>
        </article>
      </div>
      <div v-if="pdfError" class="error tiny" style="margin-top:6px;">{{ pdfError }}</div>
    </div>

    <ClientDisclosurePanel
      class="cap-disclosure"
      :client-id="clientId"
      :client="client"
      @view-artifact="$emit('open-document', $event)"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import ClientDisclosurePanel from './ClientDisclosurePanel.vue';
import { useAuthStore } from '../../../store/auth';

const AUTH_KINDS = new Set([
  'smart_roi',
  'disclosure',
  'hipaa_notice',
  'informed_group_consent',
  'policy_services'
]);

// Sections that exist in every paper packet (displayed in order).
const PACKET_SECTIONS = [
  { key: 'hipaa', title: 'HIPAA Notice of Privacy Practices', anchor: 'hipaa' },
  { key: 'consent', title: 'Consent for Services', anchor: 'consent' },
  { key: 'policy', title: 'Policies & Agreement', anchor: 'policy' },
  { key: 'disclosure', title: 'Smart Disclosure (Care-Team Notice)', anchor: 'disclosure' }
];

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  client: { type: Object, default: null }
});
defineEmits(['open-document']);

const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const rows = ref([]);
const loadingPdf = ref(false);
const pdfError = ref('');
const signedPdfUrl = ref('');

function formatWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

async function load() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/phi-documents/clients/${id}/chart-artifacts`, { skipGlobalLoading: true });
    const all = Array.isArray(resp.data?.artifacts) ? resp.data.artifacts : [];
    rows.value = all.filter((a) => AUTH_KINDS.has(String(a.kind || '').toLowerCase()));
  } catch (e) {
    rows.value = [];
    error.value = e?.response?.data?.error?.message || 'Unable to load authorizations.';
  } finally {
    loading.value = false;
  }
}

/** True when the client signed a paper packet (not a digital form). */
const disclosureArtifact = computed(() => rows.value.find((r) => r.kind === 'disclosure') || null);

const paperPacketVersion = computed(() => {
  const artifact = disclosureArtifact.value;
  if (!artifact?.inPaperPacket) return null;
  const ppd = artifact.paperPacketDisclosure;
  const versionLabel = ppd?.versionLabel || artifact.packetVersionLabel || null;
  if (!versionLabel) return null;
  // organization_id lives on the client prop
  const orgId = Number(props.client?.organization_id || props.client?.organizationId || 0) || null;
  return {
    versionLabel,
    organizationId: orgId,
    templateVersion: ppd?.templateVersionSnapshot || null
  };
});

const paperPacketSections = computed(() => {
  const pv = paperPacketVersion.value;
  if (!pv) return [];
  return PACKET_SECTIONS.map((s) => ({ ...s, templateVersion: pv.templateVersion }));
});

async function viewVersionedPdf(anchor = null) {
  const pv = paperPacketVersion.value;
  if (!pv?.organizationId) return;
  pdfError.value = '';
  loadingPdf.value = true;
  try {
    const locale = authStore?.user?.preferred_language?.startsWith('es') ? 'es' : 'en';
    const resp = await api.get(
      `/school-portal/${pv.organizationId}/printable-packet/version/${encodeURIComponent(pv.versionLabel)}/pdf`,
      { params: { locale }, skipGlobalLoading: true }
    );
    const url = resp.data?.url;
    if (!url) throw new Error('No download URL returned.');
    // Open in new tab; anchor hash will let the browser jump to the section if the PDF viewer supports it.
    window.open(anchor ? `${url}#${anchor}` : url, '_blank', 'noopener');
  } catch (e) {
    pdfError.value = e?.response?.data?.error?.message || 'Could not open packet PDF.';
  } finally {
    loadingPdf.value = false;
  }
}

onMounted(load);
watch(() => props.clientId, load);
</script>

<style scoped>
.cap-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.cap-title { margin: 0 0 4px; font-size: 16px; font-weight: 750; }
.cap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.cap-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--bg-card, var(--bg, #fff));
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cap-card__kicker {
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}
.cap-badge--paper {
  display: inline-block;
  background: #f0f9f4;
  color: #276749;
  border: 1px solid #b2dfdb;
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 600;
}
.cap-disclosure { margin-top: 8px; }

/* ── Paper packet version block ──────────────────────────────────────── */
.cap-pp-block {
  margin: 20px 0 8px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  padding: 14px 16px;
}
.cap-pp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.cap-pp-badge {
  background: #3b82f6;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 8px;
  padding: 2px 9px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.cap-pp-label {
  font-size: 13px;
  color: #1e3a5f;
}
.cap-pp-view-btn {
  margin-left: auto;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.cap-pp-view-btn:hover { background: #1d4ed8; }
.cap-pp-view-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.cap-pp-view-btn--sm { margin-left: 0; padding: 3px 9px; font-size: 11px; }
.cap-pp-desc {
  margin-bottom: 10px;
}
.cap-pp-sections {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.cap-pp-section {
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 10px 12px;
}
.cap-pp-sec-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e3a5f;
  margin-bottom: 4px;
}
.cap-pp-sec-meta {
  margin-bottom: 8px;
}
</style>
