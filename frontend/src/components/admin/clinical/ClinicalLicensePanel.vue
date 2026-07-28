<template>
  <div class="clinical-license-panel">
    <p class="muted ci-panel-hint">
      License details here are the same data shown in Provider Year Update and credentialing.
      If older duplicate fields existed, the most recent value is kept automatically.
    </p>

    <div v-if="licenseSummary.hasDetails" class="clp-active">
      <div class="clp-active-head">
        <strong>Active License</strong>
        <span v-if="isFullyLicensed" class="clp-eligible">Insurance credentialing eligible</span>
      </div>
      <dl class="clp-grid">
        <div><dt>License type &amp; number</dt><dd>{{ licenseSummary.typeNumber || '—' }}</dd></div>
        <div><dt>Date issued</dt><dd>{{ licenseSummary.issuedDate || '—' }}</dd></div>
        <div><dt>Expiration</dt><dd>{{ licenseSummary.expirationDate || '—' }}</dd></div>
      </dl>
    </div>
    <p v-else class="muted">No practicing license on file yet.</p>

    <div class="clp-upload-row">
      <div>
        <template v-if="licenseSummary.uploadUrl">
          <a :href="licenseSummary.uploadUrl" target="_blank" rel="noopener" class="link-btn">View license file</a>
        </template>
        <span v-else class="clp-missing">No license file uploaded</span>
      </div>
      <div v-if="canEdit">
        <input
          ref="fileInput"
          type="file"
          :accept="LICENSE_UPLOAD_ACCEPT"
          class="sr-only"
          @change="onFileChange"
        />
        <button type="button" class="btn btn-secondary btn-sm" :disabled="uploading" @click="fileInput?.click()">
          {{ uploading ? 'Uploading…' : (licenseSummary.uploadUrl ? 'Replace file' : 'Upload license file') }}
        </button>
      </div>
    </div>
    <p v-if="uploadError" class="error">{{ uploadError }}</p>

    <ProviderInfoTab
      :user-id="userId"
      embedded
      ensure-empty-fields
      :field-keys="fieldKeys"
      :field-groups="fieldGroups"
      panel-title="Edit license fields"
      :clinical-filter="true"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import api from '../../../services/api';
import ProviderInfoTab from '../ProviderInfoTab.vue';
import { findFieldByKeys, formatClinicalFieldValue } from '../../../utils/clinicalFieldDisplay.js';
import { toUploadsUrl } from '../../../utils/uploadsUrl.js';
import { isFullyLicensedCredentialText, LICENSE_UPLOAD_ACCEPT } from '../../../utils/credentialNormalization.js';

const props = defineProps({
  userId: { type: Number, required: true },
  fields: { type: Array, default: () => [] },
  canEdit: { type: Boolean, default: false },
  userCredential: { type: String, default: '' },
});

defineEmits(['refresh']);

const fieldKeys = [
  'provider_credential_license_type_number',
  'provider_credential_license_issued_date',
  'provider_credential_license_expiration_date',
  'license_upload',
  'provider_credential',
  'certs_general',
  'certs_clinical',
  'npi_status',
  'npi_number',
  'taxonomy_code',
];

const fieldGroups = [
  {
    id: 'license_details',
    label: 'License details',
    fieldKeys: [
      'provider_credential_license_type_number',
      'provider_credential_license_issued_date',
      'provider_credential_license_expiration_date',
      'license_upload',
      'provider_credential',
    ],
  },
  {
    id: 'certifications',
    label: 'Certifications',
    fieldKeys: ['certs_general', 'certs_clinical'],
  },
  {
    id: 'npi',
    label: 'NPI',
    fieldKeys: ['npi_status', 'npi_number', 'taxonomy_code'],
  },
];

const fileInput = ref(null);
const uploading = ref(false);
const uploadError = ref('');

const fieldByKey = computed(() => {
  const map = new Map();
  for (const f of props.fields || []) {
    const k = String(f?.field_key || '').trim();
    if (!k) continue;
    const existing = map.get(k);
    if (!existing) {
      map.set(k, f);
      continue;
    }
    const ta = new Date(f?.updated_at || 0).getTime();
    const tb = new Date(existing?.updated_at || 0).getTime();
    if (ta > tb || (ta === tb && Number(f.id) > Number(existing.id))) map.set(k, f);
  }
  return map;
});

const licenseSummary = computed(() => {
  const typeField = findFieldByKeys(fieldByKey.value, [
    'provider_credential_license_type_number',
    'license_type_number',
  ]);
  const issuedField = findFieldByKeys(fieldByKey.value, [
    'provider_credential_license_issued_date',
    'license_issued',
  ]);
  const expiresField = findFieldByKeys(fieldByKey.value, [
    'provider_credential_license_expiration_date',
    'license_expires',
  ]);
  const uploadField = findFieldByKeys(fieldByKey.value, ['license_upload']);
  const typeNumber = typeField ? formatClinicalFieldValue(typeField) : '';
  const issuedDate = issuedField ? formatClinicalFieldValue(issuedField) : '';
  const expirationDate = expiresField ? formatClinicalFieldValue(expiresField) : '';
  const uploadRaw = uploadField?.value ? String(uploadField.value).trim() : '';
  const uploadUrl = uploadRaw ? toUploadsUrl(uploadRaw) : '';
  return {
    hasDetails: !!(typeNumber || issuedDate || expirationDate || uploadUrl),
    typeNumber,
    issuedDate,
    expirationDate,
    uploadUrl,
  };
});

const isFullyLicensed = computed(() => {
  const text = [props.userCredential, licenseSummary.value.typeNumber]
    .map((v) => String(v || '').trim())
    .find(Boolean);
  return isFullyLicensedCredentialText(text || '');
});

async function onFileChange(e) {
  const file = e?.target?.files?.[0];
  if (e?.target) e.target.value = '';
  if (!file || !props.canEdit) return;
  uploading.value = true;
  uploadError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', 'license');
    const exp = findFieldByKeys(fieldByKey.value, [
      'provider_credential_license_expiration_date',
      'license_expires',
    ]);
    const expVal = exp?.value ? String(exp.value).slice(0, 10) : '';
    if (expVal) fd.append('expirationDate', expVal);
    fd.append('isBlocking', '0');
    await api.post('/user-compliance-documents', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    emitRefresh();
  } catch (err) {
    uploadError.value = err?.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

function emitRefresh() {
  // parent refresh
  window.dispatchEvent(new CustomEvent('pt-clinical-refresh'));
}
</script>

<style scoped>
.clinical-license-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ci-panel-hint {
  font-size: 13px;
  margin: 0;
}
.clp-active {
  border: 1px solid color-mix(in srgb, #10b981 30%, #e5e7eb);
  background: color-mix(in srgb, #10b981 8%, white);
  border-radius: 12px;
  padding: 14px 16px;
}
.clp-active-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.clp-eligible {
  font-size: 11px;
  font-weight: 700;
  color: #047857;
  background: #d1fae5;
  padding: 2px 8px;
  border-radius: 999px;
}
.clp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin: 0;
}
.clp-grid dt {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.clp-grid dd {
  margin: 4px 0 0;
  font-weight: 600;
}
.clp-upload-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
}
.clp-missing {
  color: #c2410c;
  font-weight: 600;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--primary, #059669);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
.error {
  color: #b91c1c;
  font-size: 13px;
}
</style>
