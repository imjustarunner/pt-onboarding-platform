<template>
  <PublicEventsListing
    :page-title="pageCompanyTitle"
    :page-title-sub="pageProgramTitle"
    :events="events"
    :loading="loading"
    :error="error"
    :nearest-agency-slug="nearestAgencySlug"
    :use-portal-program-nearest="!useAgencyApiPath"
    :portal-program-portal-slug="portalSlug"
    :portal-program-program-slug="programSlug"
    :footer-home-slug="portalSlug"
    :enroll-cross-link-href="hasEnrollments ? programEnrollHubPath : ''"
    :enroll-cross-link-label="hasEnrollments ? 'Need individual program enrollment? Open the full enroll page (enrollments + events)' : ''"
    :footer-legal-title="programLegalTitle"
    :footer-extra-legal-links="programLegalLinks"
    show-public-shell
  />
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import PublicEventsListing from '../../components/public/PublicEventsListing.vue';
import { useLocale } from '../../composables/useLocale.js';

const route = useRoute();
/** First path segment: agency slug on `/open-events/...` or org/program portal slug on `/:organizationSlug/...`. */
const portalSlug = computed(() =>
  String(route.params.agencySlug || route.params.organizationSlug || '').trim()
);
const programSlug = computed(() => String(route.params.programSlug || '').trim());
const useAgencyApiPath = computed(() => Boolean(route.params.agencySlug));

const programEnrollHubPath = computed(() => {
  if (!portalSlug.value || !programSlug.value) return '';
  if (useAgencyApiPath.value) {
    return `/open-events/${portalSlug.value}/programs/${programSlug.value}/enroll`;
  }
  return `/${portalSlug.value}/programs/${programSlug.value}/enroll`;
});

const loading = ref(false);
const error = ref('');
const events = ref([]);
const agencyName = ref('');
const programName = ref('');
const agencyId = ref(null);
const programOrgId = ref(null);
const orgTranslations = ref({});
const { locale: publicLocale, isSpanish: localeIsSpanish, fetchTranslations, translatedFor } = useLocale();
/** Whether the program has individual enrollments (learning classes) available. */
const hasEnrollments = ref(false);
/** Slug of the parent agency (for nearest-event API), from list response. */
const nearestAgencySlug = ref('');
const programLegalTitle = ref('');
const programLegalLinks = ref([]);

function translatedOrgName(id, fallback) {
  if (!localeIsSpanish.value) return fallback;
  const translated = translatedFor(orgTranslations.value, id, 'name');
  return translated || fallback;
}

/** Line 1 of the hero heading — the company/agency name. */
const pageCompanyTitle = computed(() => {
  const fallback = agencyName.value || humanizeSlug(programSlug.value) || 'Program events';
  return translatedOrgName(agencyId.value, fallback);
});

/** Line 2 of the hero heading — the program name (shown below the company name). */
const pageProgramTitle = computed(() => {
  if (!agencyName.value) return '';
  const fallback = programName.value || humanizeSlug(programSlug.value) || '';
  return translatedOrgName(programOrgId.value, fallback);
});

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
    programName.value = String(res.data?.programName || '').trim();
    agencyId.value = Number(res.data?.agencyId) || null;
    programOrgId.value = Number(res.data?.organizationId) || null;
    hasEnrollments.value = res.data?.hasEnrollments === true;
    refreshOrgTranslations();
    nearestAgencySlug.value = String(res.data?.agencySlug || '').trim().toLowerCase();
    programLegalTitle.value = String(res.data?.programLegalLinks?.title || '').trim();
    programLegalLinks.value = Array.isArray(res.data?.programLegalLinks?.links)
      ? res.data.programLegalLinks.links
          .map((row) => ({
            label: String(row?.label || '').trim(),
            href: String(row?.href || '').trim()
          }))
          .filter((row) => row.label && row.href)
      : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    events.value = [];
    agencyName.value = '';
    programName.value = '';
    hasEnrollments.value = false;
    nearestAgencySlug.value = '';
    programLegalTitle.value = '';
    programLegalLinks.value = [];
  } finally {
    loading.value = false;
  }
}

async function refreshOrgTranslations() {
  if (!localeIsSpanish.value) {
    orgTranslations.value = {};
    return;
  }
  const ids = [agencyId.value, programOrgId.value].filter((n) => Number.isFinite(Number(n)) && Number(n) > 0);
  if (!ids.length) {
    orgTranslations.value = {};
    return;
  }
  orgTranslations.value = (await fetchTranslations('organization', ids, ['name'])) || {};
}

watch([portalSlug, programSlug, useAgencyApiPath], () => load(), { immediate: true });
watch(publicLocale, () => { refreshOrgTranslations(); });
</script>
