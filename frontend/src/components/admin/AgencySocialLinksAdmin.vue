<template>
  <div class="agency-social-links-admin">
    <div class="section-header">
      <h4 style="margin: 0 0 6px 0;">Social profile links</h4>
      <p class="section-description">
        Tenant Facebook, X, Instagram, YouTube, and LinkedIn URLs used in staff email signatures and/or the public website.
        Toggle each channel independently.
      </p>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <div class="form-group tagline-block">
        <label>Signature motto / tagline</label>
        <input
          v-model="signatureTagline"
          type="text"
          class="input"
          maxlength="500"
          placeholder="Optional line shown under the signature (e.g. NLU motto)"
        />
        <small class="hint">Shown in the signature footer. Leave blank to use the default ITSCO-style taglines when applicable.</small>
      </div>

      <div class="links-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>URL</th>
              <th>Signatures</th>
              <th>Website</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in draftRows" :key="row.platform">
              <td>
                <span class="pill">{{ row.label }}</span>
              </td>
              <td>
                <input
                  v-model="row.url"
                  type="url"
                  class="input url-input"
                  :placeholder="`https://…${row.platform}`"
                />
              </td>
              <td class="center">
                <label class="toggle">
                  <input v-model="row.showOnSignature" type="checkbox" />
                  <span>Signatures</span>
                </label>
              </td>
              <td class="center">
                <label class="toggle">
                  <input v-model="row.showOnWebsite" type="checkbox" />
                  <span>Website</span>
                </label>
              </td>
              <td class="center">
                <label class="toggle">
                  <input v-model="row.isActive" type="checkbox" />
                  <span>On</span>
                </label>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save social links' }}
        </button>
        <span v-if="savedFlash" class="saved">✓ Saved</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true }
});

const PLATFORM_DEFAULTS = [
  { platform: 'facebook', label: 'Facebook', sortOrder: 10 },
  { platform: 'twitter', label: 'X / Twitter', sortOrder: 20 },
  { platform: 'instagram', label: 'Instagram', sortOrder: 30 },
  { platform: 'youtube', label: 'YouTube', sortOrder: 40 },
  { platform: 'linkedin', label: 'LinkedIn', sortOrder: 50 }
];

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const savedFlash = ref(false);
const signatureTagline = ref('');
const draftRows = ref([]);

function buildDraftRows(links = []) {
  const map = {};
  for (const link of links || []) {
    map[String(link.platform || '').toLowerCase()] = link;
  }
  return PLATFORM_DEFAULTS.map((p) => {
    const existing = map[p.platform] || {};
    return {
      platform: p.platform,
      label: existing.label || p.label,
      url: existing.url || '',
      showOnSignature: existing.showOnSignature !== false,
      showOnWebsite: existing.showOnWebsite !== false,
      isActive: existing.isActive !== false,
      sortOrder: existing.sortOrder ?? p.sortOrder
    };
  });
}

async function load() {
  const id = Number(props.agencyId || 0);
  if (!id) return;
  try {
    loading.value = true;
    error.value = '';
    const { data } = await api.get(`/agencies/${id}/social-links`);
    draftRows.value = buildDraftRows(data?.links || []);
    signatureTagline.value = data?.signatureTagline || '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load social links';
  } finally {
    loading.value = false;
  }
}

async function save() {
  const id = Number(props.agencyId || 0);
  if (!id) return;
  try {
    saving.value = true;
    error.value = '';
    const links = draftRows.value
      .filter((r) => String(r.url || '').trim())
      .map((r) => ({
        platform: r.platform,
        url: String(r.url).trim(),
        label: r.label,
        showOnSignature: !!r.showOnSignature,
        showOnWebsite: !!r.showOnWebsite,
        isActive: !!r.isActive,
        sortOrder: r.sortOrder
      }));
    const { data } = await api.put(`/agencies/${id}/social-links`, {
      links,
      signatureTagline: signatureTagline.value
    });
    draftRows.value = buildDraftRows(data?.links || []);
    signatureTagline.value = data?.signatureTagline || '';
    savedFlash.value = true;
    setTimeout(() => {
      savedFlash.value = false;
    }, 2000);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.agencyId,
  () => {
    void load();
  },
  { immediate: true }
);
</script>

<style scoped>
.agency-social-links-admin {
  max-width: 960px;
}
.section-description,
.hint {
  color: var(--muted, #64748b);
  font-size: 0.9rem;
  margin: 0 0 12px;
}
.hint {
  display: block;
  margin-top: 6px;
}
.tagline-block {
  margin-bottom: 16px;
}
.tagline-block label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.92rem;
}
.url-input {
  min-width: 220px;
}
.links-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  text-align: left;
  vertical-align: middle;
}
.table th {
  background: #f8fafc;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}
.center {
  text-align: center;
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
  font-size: 0.82rem;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: #334155;
  cursor: pointer;
  user-select: none;
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.saved {
  color: #065f46;
  font-size: 0.9rem;
  font-weight: 600;
}
.muted {
  color: #64748b;
}
.error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
}
</style>
