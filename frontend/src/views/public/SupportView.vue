<template>
  <div class="support-page" :style="{ background: pageBackground }">
    <main class="support-shell">
      <header class="support-header">
        <img v-if="displayLogoUrl" :src="displayLogoUrl" alt="" class="support-logo" />
        <h1>{{ support.title }}</h1>
        <p v-if="support.subtitle" class="support-subtitle">{{ support.subtitle }}</p>
        <p v-if="support.intro" class="support-intro">{{ support.intro }}</p>
      </header>

      <section class="support-grid">
        <article class="support-card">
          <h2>Contact</h2>
          <p v-if="support.contactEmail">
            Email:
            <a :href="`mailto:${support.contactEmail}`">{{ support.contactEmail }}</a>
          </p>
          <p v-if="support.contactPhone">
            Phone:
            <a :href="`tel:${support.contactPhone}`">{{ support.contactPhone }}</a>
          </p>
          <p v-if="support.hours" class="muted">{{ support.hours }}</p>
        </article>

        <article class="support-card">
          <h2>Self-service</h2>
          <p v-if="support.helpCenterUrl">
            <a :href="support.helpCenterUrl" target="_blank" rel="noopener noreferrer">Help Center</a>
          </p>
          <p v-if="support.statusPageUrl">
            <a :href="support.statusPageUrl" target="_blank" rel="noopener noreferrer">System Status</a>
          </p>
          <p v-if="support.bugReportUrl">
            <a :href="support.bugReportUrl" target="_blank" rel="noopener noreferrer">Report a Bug</a>
          </p>
          <p class="muted" v-if="!support.helpCenterUrl && !support.statusPageUrl && !support.bugReportUrl">
            Additional support links are not configured yet.
          </p>
        </article>
      </section>

      <section class="support-disclosure">
        <h2>Strava Attribution</h2>
        <img src="/logos/strava/compatible-with-strava.svg" alt="Compatible with Strava" class="support-strava-logo" />
        <p>
          Compatible with Strava. This application is independent and is not developed, sponsored, or endorsed by Strava.
        </p>
        <p class="muted">
          When Strava activity links are shown in-app, use the provided <strong>View on Strava</strong> links to open the source activity.
        </p>
      </section>

      <section v-if="support.faq.length" class="support-faq">
        <h2>Frequently Asked Questions</h2>
        <details v-for="(item, idx) in support.faq" :key="`faq-${idx}`" class="faq-item">
          <summary>{{ item.q }}</summary>
          <p>{{ item.a }}</p>
        </details>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useBrandingStore } from '../../store/branding';

const brandingStore = useBrandingStore();

const defaults = {
  title: 'Support',
  subtitle: 'Need help with your SSTC account, seasons, or workout imports?',
  intro: 'Contact our support team and we will help you get back on track.',
  contactEmail: 'support@plottwisthq.com',
  contactPhone: null,
  hours: 'Typical response time: within 1-2 business days.',
  helpCenterUrl: null,
  statusPageUrl: null,
  bugReportUrl: null,
  faq: [
    { q: 'How do I connect Strava?', a: 'Go to My Account > Fitness Integrations and click Connect for Strava.' },
    { q: 'Why is my workout missing?', a: 'Check your integration status and verify that your activity type is eligible for your season rules.' }
  ]
};

const parsedSupport = computed(() => {
  const raw = brandingStore.platformBranding?.support_page_json;
  if (!raw) return defaults;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  const faq = Array.isArray(parsed?.faq)
    ? parsed.faq
        .map((x) => ({ q: String(x?.q || '').trim(), a: String(x?.a || '').trim() }))
        .filter((x) => x.q && x.a)
    : [];
  return {
    ...defaults,
    ...parsed,
    faq: faq.length ? faq : defaults.faq
  };
});

const support = computed(() => parsedSupport.value);
const displayLogoUrl = computed(() => brandingStore.displayLogoUrl || null);
const pageBackground = computed(() => brandingStore.loginBackground || 'linear-gradient(135deg, #eef2f7 0%, #f8fafc 100%)');

onMounted(async () => {
  await brandingStore.initializePortalTheme();
  if (!brandingStore.platformBranding) {
    await brandingStore.fetchPlatformBranding();
  }
});
</script>

<style scoped>
.support-page {
  min-height: 100vh;
  background-size: cover;
  background-position: center;
  padding: 24px 14px 40px;
}
.support-shell {
  max-width: 900px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
}
.support-header h1 {
  margin: 0;
}
.support-logo {
  height: 40px;
  width: auto;
  object-fit: contain;
  margin-bottom: 10px;
}
.support-subtitle {
  margin: 8px 0 0;
  color: #334155;
}
.support-intro {
  margin: 10px 0 0;
  color: #475569;
  white-space: pre-wrap;
}
.support-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.support-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}
.support-card h2,
.support-faq h2 {
  margin: 0 0 10px;
  font-size: 1.05rem;
}
.support-card p {
  margin: 8px 0;
}
.support-faq {
  margin-top: 16px;
}
.support-disclosure {
  margin-top: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}
.support-disclosure h2 {
  margin: 0 0 10px;
  font-size: 1.05rem;
}
.support-disclosure p {
  margin: 8px 0;
}
.support-strava-logo {
  height: 22px;
  width: auto;
  display: block;
  margin: 0 0 8px;
}
.faq-item {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  margin-bottom: 10px;
}
.faq-item summary {
  cursor: pointer;
  font-weight: 600;
}
.faq-item p {
  margin: 10px 0 0;
  color: #475569;
  white-space: pre-wrap;
}
.muted {
  color: #64748b;
}
@media (max-width: 740px) {
  .support-grid {
    grid-template-columns: 1fr;
  }
}
</style>
