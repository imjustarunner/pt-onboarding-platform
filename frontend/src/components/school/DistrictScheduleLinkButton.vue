<template>
  <div class="pds-popover-wrap">
    <button
      type="button"
      class="pds-trigger btn btn-secondary btn-sm"
      :disabled="disabled || loading"
      :title="title"
      @click.stop="toggleOpen"
    >
      <svg class="pds-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
      District link
    </button>

    <div v-if="open" class="pds-popover" @click.stop>
      <div class="pds-popover-head">
        <strong>Public district schedule</strong>
        <button type="button" class="pds-close" aria-label="Close" @click="open = false">×</button>
      </div>
      <p class="pds-hint">
        Share a stable link that lists every school in a district, each provider, and the days they are on site.
      </p>

      <div v-if="loading" class="pds-muted">Loading districts…</div>
      <div v-else-if="error" class="pds-error">{{ error }}</div>
      <template v-else>
        <label class="pds-label" for="pds-district-select">District</label>
        <select
          id="pds-district-select"
          v-model="selectedSlug"
          class="pds-select"
          @change="onDistrictChange"
        >
          <option value="">— select a district —</option>
          <option v-for="d in districts" :key="d.slug" :value="d.slug">
            {{ d.name }} ({{ d.schoolCount }})
          </option>
        </select>

        <div v-if="selectedUrl" class="pds-url-block">
          <input
            ref="urlInput"
            class="pds-url-input"
            type="text"
            readonly
            :value="selectedUrl"
            @focus="$event.target.select()"
          />
          <button type="button" class="btn btn-primary btn-sm" @click="copyUrl">
            {{ copied ? 'Copied' : 'Copy link' }}
          </button>
        </div>
        <p v-else-if="districts.length" class="pds-muted">Choose a district to copy its public URL.</p>
        <p v-else class="pds-muted">No districts with schools yet. Add district names on school profiles first.</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  disabled: { type: Boolean, default: false },
  title: { type: String, default: 'Copy a public district schedule link' }
});

const open = ref(false);
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

function onDocumentClick() {
  open.value = false;
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
    if (!selectedSlug.value && districts.value.length === 1) {
      selectedSlug.value = districts.value[0].slug;
    }
  } catch (e) {
    districts.value = [];
    error.value = e?.response?.data?.error?.message || 'Failed to load districts';
  } finally {
    loading.value = false;
  }
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value && !districts.value.length && !loading.value) {
    loadDistricts();
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
  if (open.value) loadDistricts();
});

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>

<style scoped>
.pds-popover-wrap {
  position: relative;
  display: inline-flex;
}
.pds-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.pds-icon {
  width: 1rem;
  height: 1rem;
}
.pds-popover {
  position: absolute;
  top: calc(100% + 0.45rem);
  right: 0;
  z-index: 40;
  width: min(22rem, 92vw);
  padding: 0.85rem 0.9rem;
  border-radius: 12px;
  border: 1px solid #dbe3ea;
  background: #fff;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.14);
}
.pds-popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}
.pds-close {
  border: none;
  background: transparent;
  font-size: 1.25rem;
  line-height: 1;
  color: #64748b;
  cursor: pointer;
}
.pds-hint {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #64748b;
}
.pds-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
}
.pds-select {
  width: 100%;
  margin-bottom: 0.65rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.9rem;
}
.pds-url-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.pds-url-input {
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.78rem;
  color: #334155;
  background: #f8fafc;
}
.pds-muted {
  font-size: 0.82rem;
  color: #64748b;
}
.pds-error {
  font-size: 0.82rem;
  color: #b91c1c;
}
</style>
