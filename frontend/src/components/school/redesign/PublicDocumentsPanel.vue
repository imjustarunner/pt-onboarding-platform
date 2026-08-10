<template>
  <div class="public-docs">
    <SchoolPacketTemplateEditor
      v-if="showPacketEditor"
      :school-organization-id="schoolOrganizationId"
      @close="showPacketEditor = false"
      @saved="onPacketTemplateSaved"
    />

    <template v-else>
    <div class="public-docs-header">
      <div>
        <h2 style="margin:0;">Docs / Links</h2>
        <div class="muted" style="margin-top: 4px;">
          Shared to <strong>school staff</strong>, <strong>assigned providers</strong>, and <strong>agency staff/admin/support</strong> with access to this school.
          Do not upload PHI.
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>

    <div v-if="!packetHubEnabled" class="card" style="margin-top: 12px;">
      <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
        <h3 style="margin:0;">Affiliated digital forms</h3>
        <div class="muted" style="font-size: 12px;">{{ intakeLinks.length }} item(s)</div>
      </div>

      <div v-if="intakeLinksError" class="error" style="margin-top: 10px;">{{ intakeLinksError }}</div>
      <div v-else-if="loading" class="loading" style="margin-top: 10px;">Loading digital forms…</div>
      <div v-else-if="!intakeLinks.length" class="empty-state" style="margin-top: 10px;">
        No digital forms assigned to this school/program yet.
      </div>
      <div v-else class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Updated</th>
              <th class="right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in intakeLinks" :key="l.id">
              <td>
                <strong>{{ l.title || `Form #${l.id}` }}</strong>
                <div class="muted" style="font-size: 12px; margin-top: 2px;">
                  <span>{{ intakeLinkUrlFor(l) || '—' }}</span>
                </div>
              </td>
              <td class="muted">{{ formatDate(l.updated_at) }}</td>
              <td class="right">
                <button class="btn btn-secondary btn-sm" type="button" @click="openIntakeLink(l)" :disabled="!intakeLinkUrlFor(l)">
                  Open
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="copyIntakeLink(l)" :disabled="!intakeLinkUrlFor(l)">
                  Copy
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="openIntakeQr(l)" :disabled="!intakeLinkUrlFor(l)">
                  QR
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="two-section-grid" style="margin-top: 12px;">
      <div class="card two-section-col">
        <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
          <h3 style="margin:0;">Digital Forms</h3>
          <div class="muted" style="font-size: 12px;">{{ primaryDigitalFormLinks.length }} item(s)</div>
        </div>

        <div v-if="intakeLinksError" class="error" style="margin-top: 10px;">{{ intakeLinksError }}</div>
        <div v-else-if="loading" class="loading" style="margin-top: 10px;">Loading digital forms…</div>
        <div v-else-if="!primaryDigitalFormLinks.length" class="empty-state" style="margin-top: 10px;">
          No digital forms assigned to this school yet.
        </div>
        <ul v-else class="digital-form-list">
          <li v-for="l in primaryDigitalFormLinks" :key="l.id" class="digital-form-row">
            <div class="digital-form-row-main">
              <strong>{{ l.title || `Form #${l.id}` }}</strong>
              <span v-if="l.linked_es_form_id" class="lang-badge lang-badge-bilingual">EN &amp; ES</span>
              <span v-else class="lang-badge" :class="`lang-badge-${langCodeOf(l)}`">{{ langCodeOf(l).toUpperCase() }}</span>
              <div class="muted" style="font-size: 12px; margin-top: 2px;">
                {{ intakeLinkUrlFor(l) || '—' }}
              </div>
            </div>
            <div class="digital-form-row-actions">
              <button class="btn btn-secondary btn-sm" type="button" @click="openIntakeLink(l)" :disabled="!intakeLinkUrlFor(l)">
                Open
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="copyIntakeLink(l)" :disabled="!intakeLinkUrlFor(l)">
                Copy
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="openIntakeQr(l)" :disabled="!intakeLinkUrlFor(l)">
                QR
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div class="card two-section-col">
        <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
          <h3 style="margin:0;">Printable Packets</h3>
          <div class="muted" style="font-size: 12px;">2 item(s)</div>
        </div>
        <ul class="digital-form-list">
          <li v-for="row in printablePacketRows" :key="row.locale" class="digital-form-row">
            <div class="digital-form-row-main">
              <strong>{{ row.title }}</strong>
              <span class="lang-badge" :class="`lang-badge-${row.locale}`">{{ row.locale.toUpperCase() }}</span>
              <div class="muted" style="font-size: 12px; margin-top: 2px;">
                Auto-generated from live school data
              </div>
            </div>
            <div class="digital-form-row-actions">
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                @click="viewPrintablePacketLocale(row.locale)"
                :disabled="printablePacketLoading[row.locale]"
              >
                View
              </button>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                @click="printPrintablePacketLocale(row.locale)"
                :disabled="printablePacketLoading[row.locale]"
              >
                {{ printablePacketLoading[row.locale] ? 'Preparing…' : 'Print' }}
              </button>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                @click="downloadPrintablePacketLocale(row.locale)"
                :disabled="printablePacketLoading[row.locale]"
              >
                Download
              </button>
              <button
                v-if="canEditPacketTemplate"
                class="btn btn-secondary btn-sm"
                type="button"
                @click="showPacketEditor = true"
              >
                Edit
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <div v-if="canManageDocs" class="add-panels">
      <div class="card">
        <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
          <h3 style="margin:0;">Add file</h3>
        </div>
        <div class="form-grid public-docs-form-grid">
          <div class="form-group">
            <label>Title</label>
            <input v-model="newDoc.title" type="text" placeholder="e.g. 2026 District Calendar" :disabled="uploading" />
          </div>
          <div class="form-group">
            <label>Category</label>
            <select v-model="newDoc.categoryKey" :disabled="uploading">
              <option value="">General</option>
              <option value="district_calendar">District calendar</option>
              <option value="school_calendar">School calendar</option>
              <option value="bell_schedule">Bell schedule</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>File</label>
            <input ref="newFileInput" type="file" @change="onPickNewFile" :disabled="uploading" />
            <small class="form-help">PDF, JPG, PNG, DOCX, XLSX (max 15MB).</small>
          </div>
          <div class="form-group form-group-full" style="display:flex; gap: 8px; align-items:center;">
            <button class="btn btn-primary btn-sm" type="button" @click="upload" :disabled="uploading || !newFile">
              {{ uploading ? 'Uploading…' : 'Upload' }}
            </button>
            <div v-if="uploadError" class="error" style="margin:0;">{{ uploadError }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
          <h3 style="margin:0;">Add link</h3>
        </div>
        <div class="form-grid public-docs-form-grid">
          <div class="form-group">
            <label>Title</label>
            <input v-model="newLink.title" type="text" placeholder="e.g. District calendar (web)" :disabled="linkSaving" />
          </div>
          <div class="form-group">
            <label>Category</label>
            <select v-model="newLink.categoryKey" :disabled="linkSaving">
              <option value="">General</option>
              <option value="district_calendar">District calendar</option>
              <option value="school_calendar">School calendar</option>
              <option value="bell_schedule">Bell schedule</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>URL</label>
            <input v-model="newLink.linkUrl" type="url" placeholder="https://…" :disabled="linkSaving" />
            <small class="form-help">Must be http(s). Consider using a share link.</small>
          </div>
          <div class="form-group form-group-full" style="display:flex; gap: 8px; align-items:center;">
            <button class="btn btn-primary btn-sm" type="button" @click="createLink" :disabled="linkSaving || !newLink.linkUrl">
              {{ linkSaving ? 'Saving…' : 'Add link' }}
            </button>
            <div v-if="linkError" class="error" style="margin:0;">{{ linkError }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="card-header" style="display:flex; align-items:center; justify-content: space-between; gap: 10px;">
        <h3 style="margin:0;">Library</h3>
        <div class="muted" style="font-size: 12px;">{{ docs.length }} item(s)</div>
      </div>

      <div v-if="loading" class="loading" style="margin-top: 10px;">Loading documents…</div>
      <div v-else-if="!docs.length" class="empty-state" style="margin-top: 10px;">
        No documents yet.
      </div>
      <div v-else class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Updated</th>
              <th class="right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in docs" :key="d.id">
              <td>
                <template v-if="editingId === d.id">
                  <div class="edit-stack">
                    <input v-model="editDraft.title" type="text" />
                    <div v-if="String(d.kind || '').toLowerCase() === 'link'" class="edit-subrow">
                      <div class="edit-subrow-label muted">URL</div>
                      <input v-model="editDraft.linkUrl" type="url" placeholder="https://…" />
                    </div>
                  </div>
                </template>
                <template v-else>
                  <strong>{{ d.title || d.original_filename || `Document #${d.id}` }}</strong>
                  <div class="muted" style="font-size: 12px; margin-top: 2px;">
                    <span v-if="isSmartPrintablePacket(d)">
                      Auto-generated from live school data · Version {{ d.packet_version || '1.15' }}
                    </span>
                    <span v-else-if="String(d.kind || '').toLowerCase() === 'link'">{{ d.link_url || '—' }}</span>
                    <span v-else>{{ d.original_filename || '—' }}</span>
                  </div>
                </template>
              </td>
              <td>
                <template v-if="editingId === d.id">
                  <select v-model="editDraft.categoryKey">
                    <option value="">General</option>
                    <option value="district_calendar">District calendar</option>
                    <option value="school_calendar">School calendar</option>
                    <option value="bell_schedule">Bell schedule</option>
                    <option value="other">Other</option>
                  </select>
                </template>
                <template v-else>
                  <span class="muted">{{ formatCategory(d.category_key) }}</span>
                </template>
              </td>
              <td class="muted">{{ formatDate(d.updated_at) }}</td>
              <td class="right">
                <template v-if="isSmartPrintablePacket(d)">
                  <button
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="openSmartPacket(d)"
                    :disabled="smartPacketLoading"
                  >
                    View
                  </button>
                  <button
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="printSmartPacket(d)"
                    :disabled="smartPacketLoading"
                  >
                    {{ smartPacketLoading ? 'Preparing…' : 'Print' }}
                  </button>
                  <button
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="downloadSmartPacket(d)"
                    :disabled="smartPacketLoading"
                  >
                    Download
                  </button>
                  <button
                    v-if="canEditPacketTemplate"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="showPacketEditor = true"
                  >
                    Edit
                  </button>
                </template>
                <template v-else>
                <a
                  v-if="String(d.kind || '').toLowerCase() === 'link' && d.link_url"
                  class="btn btn-secondary btn-sm"
                  :href="d.link_url"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
                <a
                  v-else
                  class="btn btn-secondary btn-sm"
                  :href="toUploadsUrl(d.file_path)"
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
                <button v-if="canPrintItem(d)" class="btn btn-secondary btn-sm" type="button" @click="printItem(d)">
                  Print
                </button>
                <span
                  v-else-if="isGoogleDocsOrDriveLink(d)"
                  class="muted"
                  style="font-size: 11px; margin-left: 6px; display: inline-block; vertical-align: middle;"
                  title="Google Docs/Drive links should be printed from Google after opening."
                >
                  Open to print
                </span>
                <a
                  v-if="String(d.kind || '').toLowerCase() !== 'link' && d.file_path"
                  class="btn btn-secondary btn-sm"
                  :href="toUploadsUrl(d.file_path)"
                  download
                  rel="noreferrer"
                >
                  Download
                </a>
                <template v-if="canManageDocs">
                  <button
                    v-if="editingId !== d.id"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="startEdit(d)"
                  >
                    Edit
                  </button>
                  <button
                    v-if="editingId === d.id"
                    class="btn btn-primary btn-sm"
                    type="button"
                    @click="saveMeta(d)"
                    :disabled="savingId === d.id"
                  >
                    {{ savingId === d.id ? 'Saving…' : 'Save' }}
                  </button>
                  <button
                    v-if="editingId === d.id"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="cancelEdit"
                    :disabled="savingId === d.id"
                  >
                    Cancel
                  </button>

                  <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
                    <template v-if="String(d.kind || '').toLowerCase() !== 'link'">
                      {{ replacingId === d.id ? 'Replacing…' : 'Replace' }}
                      <input
                        type="file"
                        style="display:none;"
                        :disabled="replacingId === d.id"
                        @change="onReplaceFile(d, $event)"
                      />
                    </template>
                  </label>

                  <button
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="remove(d)"
                    :disabled="deletingId === d.id"
                  >
                    {{ deletingId === d.id ? 'Deleting…' : 'Delete' }}
                  </button>
                </template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="qrModalOpen" class="modal-overlay" @click.self="closeQrModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>{{ qrModalTitle || 'Digital form QR' }}</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeQrModal">Close</button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom: 10px;">
            Scan or share the link below.
          </div>
          <div class="intake-link-row" style="margin-bottom: 10px;">
            <input class="intake-link-input" :value="qrModalUrl" readonly />
            <button class="btn btn-secondary btn-sm" type="button" @click="copyRawText(qrModalUrl)">
              Copy
            </button>
          </div>
          <div class="intake-qr">
            <img v-if="qrModalDataUrl" :src="qrModalDataUrl" alt="Intake QR code" />
            <div v-else class="muted">Generating QR…</div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../../services/api';
import { toUploadsUrl } from '../../../utils/uploadsUrl';
import { buildPublicIntakeUrl } from '../../../utils/publicIntakeUrl';
import QRCode from 'qrcode';
import { useAuthStore } from '../../../store/auth';
import SchoolPacketTemplateEditor from './SchoolPacketTemplateEditor.vue';

const props = defineProps({
  schoolOrganizationId: { type: [Number, String], required: true }
});

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canEditPacketTemplate = computed(() => roleNorm.value === 'super_admin' || roleNorm.value === 'admin');
/** School staff see finished links/docs only; mutate UI stays with agency roles. */
const canManageDocs = computed(() => {
  const r = roleNorm.value;
  if (r === 'school_staff') return false;
  return ['super_admin', 'admin', 'support', 'staff'].includes(r);
});
const showPacketEditor = ref(false);

const docs = ref([]);
const loading = ref(false);
const error = ref('');

const intakeLinks = ref([]);
const intakeLinksError = ref('');

const qrModalOpen = ref(false);
const qrModalTitle = ref('');
const qrModalUrl = ref('');
const qrModalDataUrl = ref('');

const newDoc = ref({ title: '', categoryKey: '' });
const newFileInput = ref(null);
const newFile = ref(null);
const uploading = ref(false);
const uploadError = ref('');

const newLink = ref({ title: '', categoryKey: '', linkUrl: '' });
const linkSaving = ref(false);
const linkError = ref('');

const editingId = ref(null);
const editDraft = ref({ title: '', categoryKey: '' });
const savingId = ref(null);
const replacingId = ref(null);
const deletingId = ref(null);
const smartPacketLoading = ref(false);

const SMART_PRINTABLE_PACKET_KIND = 'system_printable_packet';
const packetHubEnabled = ref(false);

const printablePacketRows = [
  { locale: 'en', title: 'Paper Packet — English' },
  { locale: 'es', title: 'Paper Packet — Spanish' }
];
const printablePacketLoading = ref({ en: false, es: false });

const langCodeOf = (link) => {
  const raw = String(link?.language_code || 'en').trim().toLowerCase();
  return raw.startsWith('es') ? 'es' : 'en';
};

/**
 * Smart School ROI generic links are excluded from the Docs/Links panel.
 * ROIs should always be sent from each client's individual profile as a
 * client-specific link — the generic link has no identity-matching and
 * cannot attach itself to a client record.
 */
const sortedDigitalFormLinks = computed(() => {
  const nonRoi = (intakeLinks.value || []).filter(
    (l) => String(l?.form_type || '').toLowerCase() !== 'smart_school_roi'
  );
  return [...nonRoi].sort((a, b) => {
    const la = langCodeOf(a);
    const lb = langCodeOf(b);
    if (la !== lb) return la === 'en' ? -1 : 1;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
});

/**
 * For the Hogwarts two-column panel only: show primary (English) links.
 * Spanish forms are accessible via the language toggle on the English form,
 * so we hide standalone Spanish links from this view to avoid duplication.
 */
const primaryDigitalFormLinks = computed(() =>
  sortedDigitalFormLinks.value.filter((l) => langCodeOf(l) !== 'es')
);

const onPacketTemplateSaved = ({ version } = {}) => {
  const docsList = Array.isArray(docs.value) ? docs.value : [];
  for (const d of docsList) {
    if (isSmartPrintablePacket(d) && version != null) {
      d.packet_version = String(version);
      d.updated_at = new Date().toISOString();
    }
  }
};

const formatDate = (iso) => {
  const s = String(iso || '').trim();
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
  } catch {
    return s;
  }
};

const formatCategory = (k) => {
  const v = String(k || '').trim();
  if (!v) return 'General';
  if (v === 'district_calendar') return 'District calendar';
  if (v === 'school_calendar') return 'School calendar';
  if (v === 'bell_schedule') return 'Bell schedule';
  if (v === 'referral_packet') return 'Referral packet';
  return v;
};

const isSmartPrintablePacket = (d) => String(d?.kind || '').toLowerCase() === SMART_PRINTABLE_PACKET_KIND;

const openPopupWithLoading = (message = 'Generating packet…') => {
  const popup = window.open('about:blank', '_blank');
  if (!popup) return null;
  try {
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Preparing packet</title></head><body style="font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#374151;"><p>${message}</p></body></html>`);
    popup.document.close();
  } catch {
    // ignore
  }
  return popup;
};

const showPopupError = (popup, message) => {
  if (!popup || popup.closed) return;
  try {
    popup.document.body.innerHTML = `<p style="font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#b91c1c;">${String(message || 'Failed to open packet').replace(/</g, '&lt;')}</p>`;
  } catch {
    try { popup.close(); } catch { /* ignore */ }
  }
};

const normalizePacketBlob = async (blob) => {
  if (!blob || blob.size === 0) {
    throw new Error('The server returned an empty packet.');
  }
  const type = String(blob.type || '').toLowerCase();
  if (type.includes('json') || (type.includes('text') && !type.includes('pdf'))) {
    const text = await blob.text();
    let message = 'Failed to generate printable packet';
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || parsed?.message || message;
    } catch {
      if (text.trim()) message = text.trim().slice(0, 240);
    }
    throw new Error(message);
  }
  return blob;
};

const fetchSmartPacketBlob = async (locale = 'en') => {
  const res = await api.get(`/school-portal/${props.schoolOrganizationId}/printable-packet`, {
    params: { locale, _ts: Date.now() },
    responseType: 'blob',
    timeout: 120000
  });
  return normalizePacketBlob(res.data);
};

const viewPrintablePacketLocale = async (locale) => {
  const popup = openPopupWithLoading('Generating your school referral packet…');
  if (!popup) {
    error.value = 'Pop-up blocked. Allow pop-ups for this site, then try View again.';
    return;
  }
  try {
    printablePacketLoading.value = { ...printablePacketLoading.value, [locale]: true };
    error.value = '';
    const blob = await fetchSmartPacketBlob(locale);
    const url = URL.createObjectURL(blob);
    popup.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    const message = e?.message || e?.response?.data?.error?.message || 'Failed to open printable packet';
    showPopupError(popup, message);
    error.value = message;
  } finally {
    printablePacketLoading.value = { ...printablePacketLoading.value, [locale]: false };
  }
};

const printPrintablePacketLocale = async (locale) => {
  const popup = openPopupWithLoading('Preparing packet for print…');
  if (!popup) {
    error.value = 'Pop-up blocked. Allow pop-ups for this site, then try Print again.';
    return;
  }
  try {
    printablePacketLoading.value = { ...printablePacketLoading.value, [locale]: true };
    error.value = '';
    const blob = await fetchSmartPacketBlob(locale);
    const url = URL.createObjectURL(blob);
    openPrintWindow({
      url,
      title: locale === 'es' ? 'Paquete de Referencia Escolar' : 'School Referral Packet',
      existingWindow: popup
    });
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    const message = e?.message || e?.response?.data?.error?.message || 'Failed to prepare printable packet';
    showPopupError(popup, message);
    error.value = message;
  } finally {
    printablePacketLoading.value = { ...printablePacketLoading.value, [locale]: false };
  }
};

const downloadPrintablePacketLocale = async (locale) => {
  try {
    printablePacketLoading.value = { ...printablePacketLoading.value, [locale]: true };
    error.value = '';
    const blob = await fetchSmartPacketBlob(locale);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `school-referral-packet-${locale}.pdf`;
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    error.value = e?.message || e?.response?.data?.error?.message || 'Failed to download printable packet';
  } finally {
    printablePacketLoading.value = { ...printablePacketLoading.value, [locale]: false };
  }
};

const openSmartPacket = async () => {
  const popup = openPopupWithLoading('Generating your school referral packet…');
  if (!popup) {
    error.value = 'Pop-up blocked. Allow pop-ups for this site, then try View again.';
    return;
  }

  try {
    smartPacketLoading.value = true;
    error.value = '';
    const blob = await fetchSmartPacketBlob();
    const url = URL.createObjectURL(blob);
    popup.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    const message = e?.message || e?.response?.data?.error?.message || 'Failed to open printable packet';
    showPopupError(popup, message);
    error.value = message;
  } finally {
    smartPacketLoading.value = false;
  }
};

const printSmartPacket = async (d) => {
  const popup = openPopupWithLoading('Preparing packet for print…');
  if (!popup) {
    error.value = 'Pop-up blocked. Allow pop-ups for this site, then try Print again.';
    return;
  }

  try {
    smartPacketLoading.value = true;
    error.value = '';
    const blob = await fetchSmartPacketBlob();
    const url = URL.createObjectURL(blob);
    openPrintWindow({
      url,
      title: d?.title || 'School Referral Packet',
      existingWindow: popup
    });
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (e) {
    const message = e?.message || e?.response?.data?.error?.message || 'Failed to prepare printable packet';
    showPopupError(popup, message);
    error.value = message;
  } finally {
    smartPacketLoading.value = false;
  }
};

const downloadSmartPacket = async (d) => {
  try {
    smartPacketLoading.value = true;
    error.value = '';
    const blob = await fetchSmartPacketBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(d?.title || 'school-referral-packet').replace(/[^\w.-]+/g, '-')}.pdf`;
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    error.value = e?.message || e?.response?.data?.error?.message || 'Failed to download printable packet';
  } finally {
    smartPacketLoading.value = false;
  }
};

const openPrintWindow = ({ url, title, existingWindow = null }) => {
  const href = String(url || '').trim();
  if (!href) return;

  // Same-origin wrapper so users can print PDFs/images reliably.
  // For cross-origin links that block iframes, the user can still click Open.
  const w = existingWindow || window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;

  const safeTitle = String(title || 'Document')
    .replace(/[<>]/g, '')
    .slice(0, 140);
  const safeUrl = href.replace(/"/g, '&quot;');

  w.document.open();
  w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      html, body { height: 100%; margin: 0; }
      .bar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .bar .title { font-weight: 700; font-size: 14px; color: #111827; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bar a, .bar button { font-size: 13px; padding: 6px 10px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #111827; text-decoration: none; cursor: pointer; }
      .note { padding: 10px 12px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 12px; color: #6b7280; border-bottom: 1px solid #f3f4f6; }
      .frame { width: 100%; height: calc(100% - 92px); border: 0; }
      @media print { .bar, .note { display: none; } .frame { height: 100%; } }
    </style>
  </head>
  <body>
    <div class="bar">
      <div class="title">${safeTitle}</div>
      <a href="${safeUrl}" target="_blank" rel="noreferrer">Open</a>
      <a href="${safeUrl}" target="_blank" rel="noreferrer" download>Download</a>
      <button onclick="window.print()">Print</button>
    </div>
    <div class="note">If this content does not display below, the source site may block embedding. Use “Open” then print from your browser.</div>
    <iframe class="frame" src="${safeUrl}" title="${safeTitle}"></iframe>
  </body>
</html>`);
  w.document.close();
};

function getGoogleDocsPreviewUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (!u) return null;
  if (!u.includes('docs.google.com') && !u.includes('drive.google.com')) return null;

  // Normalize common Google share URLs into embeddable preview URLs.
  // NOTE: We can't reliably trigger printing cross-origin from our app, but
  // opening a Google "preview" page lets users print from their browser UI.
  try {
    // Docs/Sheets/Slides: https://docs.google.com/{type}/d/{id}/edit...
    const m = u.match(
      /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation|drawings)\/d\/([a-zA-Z0-9_-]+)(\/[^?#]*)?([?#].*)?$/i
    );
    if (m) {
      const type = m[1].toLowerCase();
      const id = m[2];
      // Use /preview for consistent viewing/printing UI.
      return `https://docs.google.com/${type}/d/${id}/preview`;
    }

    // Drive file: https://drive.google.com/file/d/{id}/view...
    const m2 = u.match(
      /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)(\/[^?#]*)?([?#].*)?$/i
    );
    if (m2) {
      const id = m2[1];
      return `https://drive.google.com/file/d/${id}/preview`;
    }

    // Drive open?id=... (legacy)
    const parsed = new URL(u);
    if (parsed.hostname === 'drive.google.com') {
      const id = parsed.searchParams.get('id');
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }
  } catch {
    return null;
  }

  return null;
}

const isGoogleDocsOrDriveLink = (d) => {
  const kind = String(d?.kind || '').toLowerCase();
  if (kind !== 'link') return false;
  const url = String(d?.link_url || '').trim();
  if (!url) return false;
  return !!getGoogleDocsPreviewUrl(url);
};

const canPrintItem = (d) => {
  if (isSmartPrintablePacket(d)) return true;
  // Printing Google Docs/Drive share links is unreliable (formatting/scale).
  // For these, we only allow Open and let the user print from Google.
  if (isGoogleDocsOrDriveLink(d)) return false;
  return true;
};

const printItem = (d) => {
  const kind = String(d?.kind || '').toLowerCase();
  const title = d?.title || d?.original_filename || `Document #${d?.id || ''}`;
  const url = kind === 'link' ? d?.link_url : toUploadsUrl(d?.file_path);

  if (!canPrintItem(d)) return;

  openPrintWindow({ url, title });
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    intakeLinksError.value = '';

    const docsReq = api.get(`/school-portal/${props.schoolOrganizationId}/public-documents`, { params: { _ts: Date.now() } });
    const intakeReq = api.get(`/school-portal/${props.schoolOrganizationId}/intake-links`, { params: { _ts: Date.now() } });

    const [docsRes, intakeRes] = await Promise.allSettled([docsReq, intakeReq]);

    if (docsRes.status === 'fulfilled') {
      docs.value = Array.isArray(docsRes.value.data?.documents) ? docsRes.value.data.documents : [];
      if (typeof docsRes.value.data?.packetHubEnabled === 'boolean') {
        packetHubEnabled.value = docsRes.value.data.packetHubEnabled;
      }
    } else {
      docs.value = [];
      const e = docsRes.reason;
      error.value = e?.response?.data?.error?.message || 'Failed to load documents';
    }

    if (intakeRes.status === 'fulfilled') {
      intakeLinks.value = Array.isArray(intakeRes.value.data?.links) ? intakeRes.value.data.links : [];
      if (typeof intakeRes.value.data?.packetHubEnabled === 'boolean') {
        packetHubEnabled.value = intakeRes.value.data.packetHubEnabled;
      }
    } else {
      intakeLinks.value = [];
      const e = intakeRes.reason;
      intakeLinksError.value = e?.response?.data?.error?.message || 'Failed to load digital forms';
    }
  } catch (e) {
    docs.value = [];
    intakeLinks.value = [];
    error.value = e?.response?.data?.error?.message || 'Failed to load documents';
    intakeLinksError.value = e?.response?.data?.error?.message || 'Failed to load digital forms';
  } finally {
    loading.value = false;
  }
};

const intakeLinkUrlFor = (link) => {
  const key = String(link?.public_key || '').trim();
  if (!key) return '';
  return buildPublicIntakeUrl(key);
};

const copyRawText = async (text) => {
  const v = String(text || '').trim();
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
  } catch {
    // ignore
  }
};

const openIntakeLink = (link) => {
  const url = intakeLinkUrlFor(link);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const copyIntakeLink = async (link) => {
  const url = intakeLinkUrlFor(link);
  if (!url) return;
  await copyRawText(url);
};

const openIntakeQr = async (link) => {
  const url = intakeLinkUrlFor(link);
  if (!url) return;
  qrModalTitle.value = String(link?.title || '').trim() || `Form #${link?.id || ''}`;
  qrModalUrl.value = url;
  qrModalDataUrl.value = '';
  qrModalOpen.value = true;
  try {
    qrModalDataUrl.value = await QRCode.toDataURL(url, { width: 240, margin: 1 });
  } catch {
    qrModalDataUrl.value = '';
  }
};

const closeQrModal = () => {
  qrModalOpen.value = false;
  qrModalTitle.value = '';
  qrModalUrl.value = '';
  qrModalDataUrl.value = '';
};

const onPickNewFile = (evt) => {
  const f = evt?.target?.files?.[0] || null;
  newFile.value = f;
};

const upload = async () => {
  if (!newFile.value) return;
  try {
    uploading.value = true;
    uploadError.value = '';
    const fd = new FormData();
    fd.append('file', newFile.value);
    fd.append('title', String(newDoc.value.title || '').trim());
    fd.append('categoryKey', String(newDoc.value.categoryKey || '').trim());
    await api.post(`/school-portal/${props.schoolOrganizationId}/public-documents`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    newDoc.value = { title: '', categoryKey: '' };
    newFile.value = null;
    if (newFileInput.value) newFileInput.value.value = '';
    await load();
  } catch (e) {
    uploadError.value = e.response?.data?.error?.message || 'Failed to upload';
  } finally {
    uploading.value = false;
  }
};

const createLink = async () => {
  const linkUrl = String(newLink.value.linkUrl || '').trim();
  if (!linkUrl) return;
  try {
    linkSaving.value = true;
    linkError.value = '';
    await api.post(`/school-portal/${props.schoolOrganizationId}/public-documents`, {
      title: String(newLink.value.title || '').trim(),
      categoryKey: String(newLink.value.categoryKey || '').trim(),
      linkUrl
    });
    newLink.value = { title: '', categoryKey: '', linkUrl: '' };
    await load();
  } catch (e) {
    linkError.value = e.response?.data?.error?.message || 'Failed to add link';
  } finally {
    linkSaving.value = false;
  }
};

const startEdit = (d) => {
  editingId.value = d.id;
  editDraft.value = {
    title: d.title || '',
    categoryKey: d.category_key || '',
    linkUrl: d.link_url || ''
  };
};

const cancelEdit = () => {
  editingId.value = null;
  editDraft.value = { title: '', categoryKey: '' };
};

const saveMeta = async (d) => {
  if (!d?.id) return;
  try {
    savingId.value = d.id;
    const payload = {
      title: String(editDraft.value.title || '').trim(),
      categoryKey: String(editDraft.value.categoryKey || '').trim()
    };
    if (String(d.kind || '').toLowerCase() === 'link') {
      payload.linkUrl = String(editDraft.value.linkUrl || '').trim();
    }
    await api.put(`/school-portal/${props.schoolOrganizationId}/public-documents/${d.id}`, payload);
    await load();
    cancelEdit();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save');
  } finally {
    savingId.value = null;
  }
};

const onReplaceFile = async (d, evt) => {
  const f = evt?.target?.files?.[0] || null;
  if (!f || !d?.id) return;
  try {
    replacingId.value = d.id;
    const fd = new FormData();
    fd.append('file', f);
    await api.put(`/school-portal/${props.schoolOrganizationId}/public-documents/${d.id}/file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await load();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to replace file');
  } finally {
    replacingId.value = null;
    // reset input
    try { evt.target.value = ''; } catch { /* ignore */ }
  }
};

const remove = async (d) => {
  if (!d?.id) return;
  const label = d.title || d.original_filename || `Document #${d.id}`;
  const ok = window.confirm(`Delete "${label}"? This cannot be undone.`);
  if (!ok) return;
  try {
    deletingId.value = d.id;
    await api.delete(`/school-portal/${props.schoolOrganizationId}/public-documents/${d.id}`);
    await load();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete');
  } finally {
    deletingId.value = null;
  }
};

onMounted(load);
</script>

<style scoped>
.public-docs {
  width: 100%;
  max-width: none;
  margin: 0;
}

.add-panels {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: start;
}
@media (min-width: 980px) {
  .add-panels {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

/* Hogwarts pilot: Digital Forms (left) + Printable Packets (right) as their
   own two sections, distinct from the general document Library below. */
.two-section-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: start;
}
@media (min-width: 900px) {
  .two-section-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
.two-section-col {
  margin-top: 0;
}
.digital-form-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.digital-form-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  background: #fafafa;
}
.digital-form-row-main {
  min-width: 0;
  flex: 1 1 220px;
}
.digital-form-row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.lang-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  vertical-align: middle;
}
.lang-badge-en {
  background: #eef2ff;
  color: #3730a3;
}
.lang-badge-es {
  background: #ecfdf5;
  color: #065f46;
}
.lang-badge-bilingual {
  background: linear-gradient(90deg, #eef2ff 0%, #ecfdf5 100%);
  color: #1e3a5f;
  font-weight: 700;
}

.public-docs-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 190px) minmax(0, 1fr);
  gap: 8px;
  margin-top: 8px;
}
@media (max-width: 980px) {
  .public-docs-form-grid {
    grid-template-columns: 1fr;
  }
}

.public-docs-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.muted {
  color: var(--text-secondary);
}

/* Modal (for intake link QR) */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 560px;
  max-width: 95vw;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-body {
  padding: 14px 16px;
}
.intake-link-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.intake-link-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
  font-size: 13px;
}
.intake-qr {
  display: flex;
  justify-content: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}

/* Make this panel compact (forms + table) without affecting the rest of the app */
.public-docs :deep(.card) {
  padding: 12px !important;
}
.public-docs :deep(.card-header) {
  padding: 0 !important;
  margin-bottom: 8px;
}
.public-docs :deep(.card-header h3) {
  font-size: 14px;
}

.public-docs :deep(.form-grid) {
  gap: 8px !important;
  margin-top: 8px !important;
}
.public-docs :deep(.form-group) {
  margin: 0 !important;
}
.public-docs :deep(.form-group label) {
  font-size: 12px;
  margin-bottom: 4px;
}
.public-docs :deep(.form-help) {
  font-size: 11px;
  margin-top: 4px;
}

.public-docs :deep(input),
.public-docs :deep(select),
.public-docs :deep(textarea) {
  font-size: 13px;
  padding: 6px 10px;
  min-height: 32px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.public-docs :deep(textarea) {
  min-height: 80px;
}

.public-docs :deep(input[type='file']) {
  padding: 4px 0;
  min-height: auto;
}

/* Compact the library table rows */
.public-docs .table th,
.public-docs .table td {
  padding: 8px 10px;
  line-height: 1.2;
}
.public-docs .table th {
  font-size: 12px;
}
.public-docs .table td {
  font-size: 13px;
  vertical-align: top;
}
.public-docs .table strong {
  font-size: 13px;
  font-weight: 700;
}
.public-docs .table .muted {
  font-size: 11px !important;
}

.public-docs .table input,
.public-docs .table select {
  font-size: 13px;
  padding: 6px 8px;
  min-height: 30px;
}

.public-docs .btn.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.public-docs td.right {
  white-space: nowrap;
}
.public-docs td.right .btn {
  margin-left: 6px;
}
.public-docs td.right .btn:first-child {
  margin-left: 0;
}

.edit-stack {
  display: grid;
  gap: 6px;
}
.edit-subrow {
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 8px;
  align-items: center;
}
.edit-subrow-label {
  font-size: 11px;
  font-weight: 600;
}
</style>

