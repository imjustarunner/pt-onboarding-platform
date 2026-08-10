<template>
  <div class="packet-editor">
    <div class="packet-editor-header">
      <div>
        <h2 style="margin:0;">Edit printable packet</h2>
        <div class="muted" style="margin-top:4px;">
          Agency-wide blank referral packet template. Merge tokens
          <code>{{ tokenSchoolName }}</code>,
          <code>{{ tokenSchoolAddress }}</code>,
          <code>{{ tokenStaffTable }}</code>, and
          <code>{{ tokenDisclosure }}</code>
          are filled automatically when the packet is generated.
        </div>
        <div class="locale-tabs" role="tablist" aria-label="Packet language">
          <button
            type="button"
            role="tab"
            class="locale-tab"
            :class="{ active: locale === 'en' }"
            :aria-selected="locale === 'en'"
            :disabled="loading || saving"
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
            :disabled="loading || saving"
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
        <span class="version-pill">{{ localeLabel }} · Version {{ version || '—' }}</span>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading || saving" @click="$emit('close')">
          Close
        </button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="loading || saving || !dirty" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-top:10px;">{{ error }}</div>
    <div v-if="success" class="success" style="margin-top:10px;">{{ success }}</div>
    <div v-if="loading" class="loading" style="margin-top:10px;">Loading template…</div>

    <div v-else class="packet-editor-body">
      <HtmlDocumentBuilder v-model="htmlContent" placeholder="Packet template HTML…" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import api from '../../../services/api';
import HtmlDocumentBuilder from '../../documents/HtmlDocumentBuilder.vue';

const props = defineProps({
  schoolOrganizationId: { type: [Number, String], required: true },
  initialLocale: { type: String, default: 'en' }
});

const emit = defineEmits(['close', 'saved']);

const tokenSchoolName = '{{' + 'SCHOOL_NAME}}';
const tokenSchoolAddress = '{{' + 'SCHOOL_ADDRESS}}';
const tokenStaffTable = '{{' + 'SCHOOL_STAFF_TABLE}}';
const tokenDisclosure = '{{' + 'DISCLOSURE_CARE_TEAM}}';

const locale = ref(String(props.initialLocale || 'en').toLowerCase() === 'es' ? 'es' : 'en');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');
const htmlContent = ref('');
const originalHtml = ref('');
const version = ref(null);

const dirty = computed(() => htmlContent.value !== originalHtml.value);
const localeLabel = computed(() => (locale.value === 'es' ? 'ES' : 'EN'));

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    success.value = '';
    const res = await api.get(`/school-portal/${props.schoolOrganizationId}/printable-packet/template`, {
      params: { locale: locale.value }
    });
    htmlContent.value = String(res.data?.html_content || '');
    originalHtml.value = htmlContent.value;
    version.value = Number(res.data?.version || 1);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load packet template';
  } finally {
    loading.value = false;
  }
};

const switchLocale = async (next) => {
  const loc = next === 'es' ? 'es' : 'en';
  if (loc === locale.value) return;
  if (dirty.value) {
    const ok = window.confirm('You have unsaved changes for this language. Discard them and switch?');
    if (!ok) return;
  }
  locale.value = loc;
  await load();
};

const save = async () => {
  try {
    saving.value = true;
    error.value = '';
    success.value = '';
    const res = await api.put(`/school-portal/${props.schoolOrganizationId}/printable-packet/template`, {
      html_content: htmlContent.value,
      locale: locale.value
    });
    htmlContent.value = String(res.data?.html_content || htmlContent.value);
    originalHtml.value = htmlContent.value;
    version.value = Number(res.data?.version || version.value || 1);
    success.value = `Saved ${localeLabel.value} as version ${version.value}.`;
    emit('saved', { version: version.value, locale: locale.value });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save packet template';
  } finally {
    saving.value = false;
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
