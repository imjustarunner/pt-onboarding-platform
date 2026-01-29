<template>
  <div class="school-finder" :style="{ background: loginBackground }">
    <div class="container">
      <div class="header">
        <BrandingLogo size="large" class="logo" />
        <h1 class="title">Find your school</h1>
        <div class="subtitle">Type your school name to open its portal.</div>
      </div>

      <div class="search">
        <input
          v-model="query"
          class="search-input"
          type="search"
          placeholder="e.g., Ashley, Ashley Elementary, Ashley Elementary School…"
          autocomplete="off"
        />
        <div v-if="loading" class="hint">Searching…</div>
        <div v-else-if="query.trim().length >= 2 && results.length === 0" class="hint">No matches yet.</div>
        <div v-else class="hint"> </div>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div v-if="results.length" class="results" role="list">
        <button
          v-for="s in results"
          :key="s.slug"
          class="result"
          type="button"
          role="listitem"
          @click="openSchool(s)"
        >
          <div class="badge" aria-hidden="true">
            <img v-if="logoUrlFor(s)" :src="logoUrlFor(s)" alt="" />
            <span v-else>{{ initialsFor(s?.name) }}</span>
          </div>
          <div class="meta">
            <div class="name">{{ s.name }}</div>
            <div class="slug">/{{ s.slug }}</div>
          </div>
          <div class="cta">Open</div>
        </button>
      </div>

      <PoweredByFooter />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useBrandingStore } from '../../store/branding';
import BrandingLogo from '../../components/BrandingLogo.vue';
import PoweredByFooter from '../../components/PoweredByFooter.vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const router = useRouter();
const brandingStore = useBrandingStore();

const loginBackground = computed(() => brandingStore.loginBackground);

const query = ref('');
const loading = ref(false);
const error = ref('');
const results = ref([]);

const initialsFor = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '';
  return `${a}${b}`.toUpperCase() || 'S';
};

const logoUrlFor = (s) => {
  const raw = s?.logo_path || s?.logo_url || null;
  return toUploadsUrl(raw);
};

const openSchool = (s) => {
  const slug = String(s?.slug || '').trim();
  if (!slug) return;
  router.push(`/${slug}`);
};

let timer = null;
watch(
  () => query.value,
  (q) => {
    const v = String(q || '').trim();
    error.value = '';
    if (timer) clearTimeout(timer);
    if (v.length < 2) {
      results.value = [];
      loading.value = false;
      return;
    }
    timer = setTimeout(async () => {
      try {
        loading.value = true;
        const r = await api.get('/public/schools/search', {
          params: { q: v },
          skipGlobalLoading: true,
          skipAuthRedirect: true
        });
        results.value = Array.isArray(r.data) ? r.data : [];
      } catch (e) {
        results.value = [];
        error.value = e?.response?.data?.error?.message || e?.message || 'Failed to search schools';
      } finally {
        loading.value = false;
      }
    }, 250);
  },
  { immediate: true }
);
</script>

<style scoped>
.school-finder {
  min-height: 100vh;
  padding: 48px 18px;
  display: flex;
  justify-content: center;
}
.container {
  width: 100%;
  max-width: 980px;
  display: grid;
  gap: 18px;
}
.header {
  text-align: center;
  color: var(--header-text-color, #fff);
}
.logo { margin: 0 auto 18px; display: block; }
.title { margin: 0; font-weight: 900; font-size: 34px; }
.subtitle { margin-top: 8px; opacity: 0.92; }
.search {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.12);
}
.search-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.12);
  background: #fff;
  font-size: 16px;
}
.hint { margin-top: 10px; color: rgba(0,0,0,0.55); font-weight: 700; font-size: 12px; min-height: 16px; }
.error { color: #b42318; font-weight: 800; text-align: center; }
.results {
  display: grid;
  gap: 10px;
}
.result {
  width: 100%;
  text-align: left;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.96);
  cursor: pointer;
}
.result:hover {
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.10);
}
.badge {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  border: 1px solid rgba(0,0,0,0.10);
  background: rgba(0,0,0,0.03);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 900;
}
.badge img { width: 100%; height: 100%; object-fit: cover; display: block; }
.meta { min-width: 0; }
.name { font-weight: 950; color: rgba(0,0,0,0.85); }
.slug { margin-top: 2px; color: rgba(0,0,0,0.55); font-weight: 800; font-size: 12px; }
.cta {
  font-weight: 950;
  color: rgba(79, 70, 229, 1);
}
</style>

