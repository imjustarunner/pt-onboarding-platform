<template>
  <PublicEventsListing
    :page-title="pageTitle"
    :page-subtitle="pageSubtitle"
    :events="events"
    :loading="loading"
    :error="error"
    :nearest-agency-slug="slug"
    :footer-home-slug="slug"
    :enroll-cross-link-href="enrollHubPath"
    enroll-cross-link-label="Looking for individual program enrollment? View enrollments and programs"
    show-public-shell
  />
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import PublicEventsListing from '../../components/public/PublicEventsListing.vue';

const route = useRoute();
/** `/open-events/:agencySlug` or branded `/:organizationSlug/events` */
const slug = computed(() =>
  String(route.params.agencySlug || route.params.organizationSlug || '').trim()
);
const isOpenEventsPath = computed(() => Boolean(route.params.agencySlug));
const enrollHubPath = computed(() => {
  if (!slug.value) return '';
  if (isOpenEventsPath.value) return `/open-events/${slug.value}/enroll`;
  return `/${slug.value}/enroll`;
});

const loading = ref(false);
const error = ref('');
const events = ref([]);
const agencyName = ref('');

const pageTitle = computed(() => {
  if (agencyName.value) return `${agencyName.value} — upcoming events`;
  return 'Upcoming events';
});

const pageSubtitle = computed(
  () =>
    'Programs and events you can register for online. When addresses are set, you can calculate driving distance from your home.'
);

async function load() {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/skill-builders/agency/${encodeURIComponent(slug.value)}/events`, {
      skipGlobalLoading: true
    });
    events.value = Array.isArray(res.data?.events) ? res.data.events : [];
    agencyName.value = String(res.data?.agencyName || '').trim();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    events.value = [];
    agencyName.value = '';
  } finally {
    loading.value = false;
  }
}

watch(slug, () => load(), { immediate: true });
</script>
