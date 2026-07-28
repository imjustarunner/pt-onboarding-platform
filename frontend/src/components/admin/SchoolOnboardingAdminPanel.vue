<template>
  <div class="so-admin" :class="{ embedded: embedded }">
    <header v-if="!embedded" class="so-admin__head">
      <router-link class="muted back" :to="hubTo">← School Portals</router-link>
      <h1>School Onboarding</h1>
      <p class="muted">
        Invite a school contact by email, or print a QR code so schools can start onboarding themselves.
        New schools automatically get English and Spanish digital intake forms copied from your most recent school.
      </p>
    </header>
    <p v-else class="muted so-embed-intro">
      Invite a school by email, or print a QR for self-serve setup. New schools get English + Spanish digital intake forms
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
        <h2>Send a new invite</h2>
        <form class="so-form" @submit.prevent="sendInvite">
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
          <p v-if="formError" class="error">{{ formError }}</p>
          <p v-if="formSuccess" class="success">{{ formSuccess }}</p>
          <div class="so-actions">
            <button type="submit" class="btn primary" :disabled="sending">
              {{ sending ? 'Sending…' : 'Send invite' }}
            </button>
            <button
              v-if="lastLink"
              type="button"
              class="btn ghost"
              @click="copyLink(lastLink)"
            >
              Copy last link
            </button>
          </div>
        </form>
      </section>

      <section class="so-card">
        <div class="so-card__row">
          <h2>Invites</h2>
          <button type="button" class="btn ghost" :disabled="loading" @click="loadInvites">
            Refresh
          </button>
        </div>
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
                <th>Invited</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="inv in invites" :key="inv.id">
                <td>
                  <strong>{{ inv.schoolName }}</strong>
                  <div class="muted tiny">{{ inv.schoolSlug }}</div>
                </td>
                <td>
                  {{ inv.contactFirstName }} {{ inv.contactLastName }}
                  <div class="muted tiny">{{ inv.contactEmail }}</div>
                </td>
                <td><span class="pill">{{ inv.source || 'invite' }}</span></td>
                <td><span class="pill" :data-status="inv.status">{{ inv.status }}</span></td>
                <td>{{ inv.completedSteps }}/{{ inv.totalSteps }}</td>
                <td class="muted tiny">{{ formatDate(inv.createdAt) }}</td>
                <td class="so-row-actions">
                  <button type="button" class="linkish" @click="copyLink(inv.link)">Copy link</button>
                  <button
                    type="button"
                    class="linkish"
                    :disabled="inv.status === 'revoked' || inv.status === 'submitted' || busyId === inv.id"
                    @click="resend(inv)"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    class="linkish danger"
                    :disabled="inv.status === 'revoked' || inv.status === 'submitted' || busyId === inv.id"
                    @click="revoke(inv)"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
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
const sending = ref(false);
const busyId = ref(null);
const invites = ref([]);
const formError = ref('');
const formSuccess = ref('');
const lastLink = ref('');
const qr = ref(null);
const qrDataUrl = ref('');
const qrLoading = ref(false);
const qrBusy = ref(false);
const qrError = ref('');

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

async function copyLink(link) {
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    formSuccess.value = 'Link copied to clipboard.';
  } catch {
    formSuccess.value = link;
  }
}

async function loadInvites() {
  if (!resolvedAgencyId.value) return;
  loading.value = true;
  try {
    const res = await api.get('/school-onboarding/invites', { params: { agencyId: resolvedAgencyId.value } });
    invites.value = Array.isArray(res.data?.invites) ? res.data.invites : [];
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to load invites';
  } finally {
    loading.value = false;
  }
}

async function sendInvite() {
  formError.value = '';
  formSuccess.value = '';
  sending.value = true;
  try {
    const res = await api.post('/school-onboarding/invites', {
      agencyId: resolvedAgencyId.value,
      contactFirstName: form.contactFirstName,
      contactLastName: form.contactLastName,
      contactEmail: form.contactEmail,
      schoolName: form.schoolName
    });
    lastLink.value = res.data?.link || '';
    const bootstrap = res.data?.intakeBootstrap;
    const formsOk = bootstrap?.en && bootstrap?.es;
    const formsPartial = bootstrap?.en || bootstrap?.es;
    formSuccess.value = [
      res.data?.emailSent ? 'Invite sent.' : 'Invite created (email may not have sent — copy the link).',
      formsOk
        ? 'English + Spanish digital intake forms were copied and activated.'
        : formsPartial
          ? 'Some digital intake forms were copied (check Digital Forms if one language is missing).'
          : 'No source digital intake forms were found to copy yet.'
    ].join(' ');
    form.contactFirstName = '';
    form.contactLastName = '';
    form.contactEmail = '';
    form.schoolName = '';
    emit('school-created', res.data?.school || null);
    await loadInvites();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to send invite';
  } finally {
    sending.value = false;
  }
}

async function resend(inv) {
  busyId.value = inv.id;
  formError.value = '';
  try {
    const res = await api.post(`/school-onboarding/invites/${inv.id}/resend`, { agencyId: resolvedAgencyId.value });
    lastLink.value = res.data?.link || inv.link;
    formSuccess.value = res.data?.emailSent ? 'Invite resent.' : 'Invite refreshed — copy the link.';
    await loadInvites();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to resend';
  } finally {
    busyId.value = null;
  }
}

async function revoke(inv) {
  if (!confirm(`Revoke invite for ${inv.schoolName}?`)) return;
  busyId.value = inv.id;
  formError.value = '';
  try {
    await api.post(`/school-onboarding/invites/${inv.id}/revoke`, { agencyId: resolvedAgencyId.value });
    formSuccess.value = 'Invite revoked.';
    await loadInvites();
  } catch (e) {
    formError.value = e?.response?.data?.error?.message || 'Failed to revoke';
  } finally {
    busyId.value = null;
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
    formSuccess.value = 'QR code rotated.';
  } catch (e) {
    qrError.value = e?.response?.data?.error?.message || 'Failed to rotate QR';
  } finally {
    qrBusy.value = false;
  }
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
.pill {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #f1f5f9;
  font-size: 0.78rem;
  text-transform: capitalize;
}
.pill[data-status='submitted'] { background: #dcfce7; color: #166534; }
.pill[data-status='in_progress'] { background: #dbeafe; color: #1d4ed8; }
.pill[data-status='revoked'],
.pill[data-status='expired'] { background: #fee2e2; color: #991b1b; }
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
.so-qr-meta { display: flex; flex-direction: column; gap: 0.75rem; min-width: 220px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
@media (max-width: 720px) {
  .so-grid { grid-template-columns: 1fr; }
  .so-grid .span-2 { grid-column: span 1; }
}
</style>
