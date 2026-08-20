<template>
  <div class="pds-inline">
    <label v-if="districts.length" class="pds-inline-label" for="pds-district-select">District link</label>
    <select
      v-if="districts.length"
      id="pds-district-select"
      v-model="selectedSlug"
      class="pds-select"
      :disabled="disabled || loading"
      @change="onDistrictChange"
    >
      <option value="">— select district —</option>
      <option v-for="d in districts" :key="d.slug" :value="d.slug">
        {{ d.name }} ({{ d.schoolCount }})
      </option>
    </select>

    <button
      v-if="!districts.length"
      type="button"
      class="pds-trigger btn btn-secondary btn-sm"
      :disabled="disabled || loading"
      :title="title"
      @click="loadDistricts"
    >
      {{ loading ? 'Loading…' : 'District link' }}
    </button>

    <template v-else-if="selectedUrl">
      <input
        ref="urlInput"
        class="pds-url-input"
        type="text"
        readonly
        :value="selectedUrl"
        :title="selectedUrl"
        @focus="$event.target.select()"
      />
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="disabled || loading"
        @click="copyUrl"
      >
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
    </template>

    <span v-if="error" class="pds-error">{{ error }}</span>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  disabled: { type: Boolean, default: false },
  preferredDistrictSlug: { type: String, default: '' },
  title: { type: String, default: 'Copy a public district schedule link' }
});

const loading = ref(false);
const error = ref('');
const districts = ref([]);
const selectedSlug = ref('');
const copied = ref(false);
const urlInput = ref(null);

const selectedUrl = computed(() => {
  const row = districts.value.find((d) => d.slug === selectedSlug.value);
  return row?.publicUrl || '';
});

function pickInitialSlug() {
  const preferred = String(props.preferredDistrictSlug || '').trim().toLowerCase();
  if (preferred && districts.value.some((d) => d.slug === preferred)) {
    selectedSlug.value = preferred;
    return;
  }
  if (districts.value.length === 1) {
    selectedSlug.value = districts.value[0].slug;
  }
}

async function loadDistricts() {
  const agencyId = Number(props.agencyId);
  if (!Number.isFinite(agencyId) || agencyId <= 0) {
    districts.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/school-portal/district-schedule-links', {
      params: { agencyId },
      skipGlobalLoading: true
    });
    districts.value = Array.isArray(res.data?.districts) ? res.data.districts : [];
    pickInitialSlug();
  } catch (e) {
    districts.value = [];
    error.value = e?.response?.data?.error?.message || 'Failed to load districts';
  } finally {
    loading.value = false;
  }
}

function onDistrictChange() {
  copied.value = false;
}

async function copyUrl() {
  const url = selectedUrl.value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    urlInput.value?.select?.();
    document.execCommand?.('copy');
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

watch(() => props.agencyId, () => {
  districts.value = [];
  selectedSlug.value = '';
  loadDistricts();
});

watch(() => props.preferredDistrictSlug, () => {
  if (districts.value.length) pickInitialSlug();
});

onMounted(loadDistricts);
</script>

<style scoped>
.pds-inline {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  max-width: min(36rem, 100%);
}
.pds-inline-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
}
.pds-select {
  min-width: 11rem;
  max-width: 14rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.82rem;
  background: #fff;
}
.pds-url-input {
  flex: 1 1 12rem;
  min-width: 10rem;
  max-width: 18rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.75rem;
  color: #334155;
  background: #f8fafc;
}
.pds-error {
  font-size: 0.78rem;
  color: #b91c1c;
}
</style>
