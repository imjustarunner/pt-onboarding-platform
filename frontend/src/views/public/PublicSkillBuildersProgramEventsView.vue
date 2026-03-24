<template>
  <PublicEventsListing
    :page-title="pageTitle"
    :page-subtitle="pageSubtitle"
    :events="events"
    :loading="loading"
    :error="error"
    :nearest-agency-slug="nearestAgencySlug"
    :use-portal-program-nearest="!useAgencyApiPath"
    :portal-program-portal-slug="portalSlug"
    :portal-program-program-slug="programSlug"
    :footer-home-slug="portalSlug"
    show-public-shell
  />
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import PublicEventsListing from '../../components/public/PublicEventsListing.vue';

const route = useRoute();
/** First path segment: agency slug on `/open-events/...` or org/program portal slug on `/:organizationSlug/...`. */
const portalSlug = computed(() =>
  String(route.params.agencySlug || route.params.organizationSlug || '').trim()
);
const programSlug = computed(() => String(route.params.programSlug || '').trim());
const useAgencyApiPath = computed(() => Boolean(route.params.agencySlug));

const loading = ref(false);
const error = ref('');
const events = ref([]);
const agencyName = ref('');
/** Slug of the parent agency (for nearest-event API), from list response. */
const nearestAgencySlug = ref('');

const pageTitle = computed(() => {
  if (agencyName.value && programSlug.value) {
    return `${agencyName.value} — ${humanizeSlug(programSlug.value)}`;
  }
  if (programSlug.value) return humanizeSlug(programSlug.value);
  return 'Program events';
});

const pageSubtitle = computed(
  () =>
    'Open Skill Builders registrations for this program. When venues have addresses, you can calculate driving distance from your home.'
);

function humanizeSlug(s) {
  return String(s || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function load() {
  if (!portalSlug.value || !programSlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const path = useAgencyApiPath.value
      ? `/public/skill-builders/agency/${encodeURIComponent(portalSlug.value)}/programs/${encodeURIComponent(programSlug.value)}/events`
      : `/public/skill-builders/portal/${encodeURIComponent(portalSlug.value)}/programs/${encodeURIComponent(programSlug.value)}/events`;
    const res = await api.get(path, { skipGlobalLoading: true });
    events.value = Array.isArray(res.data?.events) ? res.data.events : [];
    agencyName.value = String(res.data?.agencyName || '').trim();
    nearestAgencySlug.value = String(res.data?.agencySlug || '').trim().toLowerCase();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    events.value = [];
    agencyName.value = '';
    nearestAgencySlug.value = '';
  } finally {
    loading.value = false;
  }
}

watch([portalSlug, programSlug, useAgencyApiPath], () => load(), { immediate: true });
</script>
