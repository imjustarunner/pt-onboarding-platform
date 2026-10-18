<template>
  <div class="marketing">
    <header class="marketing-header">
      <RouterLink to="/" class="brand"
        ><img src="/auricwell-logo.png" alt="AuricWell"
      /></RouterLink>
      <nav aria-label="Website">
        <RouterLink to="/records-request">Request my records</RouterLink>
        <RouterLink to="/product">Product</RouterLink
        ><RouterLink to="/security">Security</RouterLink
        ><RouterLink to="/about">About</RouterLink
        ><RouterLink class="button outline" to="/app">Sign in</RouterLink>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div>
          <span class="eyebrow">A focused workspace for therapy practices</span>
          <h1>
            {{ title }}<em>{{ subtitle }}</em>
          </h1>
          <p>{{ description }}</p>
          <div class="actions">
            <RouterLink class="button" to="/app"
              >Enter AuricWell <span>↗</span></RouterLink
            ><a class="text-link" href="#practice">Explore the workspace →</a>
          </div>
          <div class="hero-note">
            <span class="gold-dot"></span> Built around the work of caring.
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="orbit one"></div>
          <div class="orbit two"></div>
          <img src="/auricwell-logo.png" alt="" />
          <div class="art-caption">
            Clarity for your practice.<br />Space for your patients.
          </div>
        </div>
      </section>
      <section id="practice" class="marketing-section">
        <span class="eyebrow">One practice. One place.</span>
        <h2>Your day, thoughtfully connected.</h2>
        <div class="feature-grid">
          <article v-for="item in features" :key="item[0]">
            <span class="feature-icon">{{ item[0] }}</span>
            <h3>{{ item[1] }}</h3>
            <p>{{ item[2] }}</p>
          </article>
        </div>
      </section>
      <PlanComparisonTable />
      <section class="onboarding-banner">
        <div>
          <span class="eyebrow">Room to begin. A path to move.</span>
          <h2>A fresh start, or your next chapter.</h2>
          <p>
            Set up a new practice without importing a thing. Moving from another
            system? Review your providers, patients and historical records in a
            dedicated migration workspace.
          </p>
        </div>
        <RouterLink class="button outline" to="/app"
          >Practice sign-in →</RouterLink
        >
      </section>
      <section class="marketing-section">
        <span class="eyebrow">A deliberate approach</span>
        <h2>Practice data stays with the practice.</h2>
        <p class="wide-copy">
          AuricWell uses practice-scoped access, username sign-in, staff
          authenticator verification and secure in-app communication.
          Availability of claims, payments and video depends on completed
          practice setup and verified integrations.
        </p>
      </section>
    </main>
    <footer>
      <span>AuricWell · Care, connected.</span
      ><RouterLink to="/app">Account access</RouterLink>
    </footer>
  </div>
</template>
<script setup>
import PlanComparisonTable from '../../frontend/src/components/meetings/PlanComparisonTable.vue';
import { computed } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
const title = computed(() =>
  route.path === "/security"
    ? "Care begins"
    : route.path === "/about"
      ? "Built around"
      : "More clarity.",
);
const subtitle = computed(() =>
  route.path === "/security"
    ? "with trust."
    : route.path === "/about"
      ? "your practice."
      : "More room for care.",
);
const description = computed(() =>
  route.path === "/security"
    ? "Access, agreements and account security are part of practice setup—not an afterthought."
    : "An EHR workspace for therapy practices, bringing your schedule, documentation and practice operations together under AuricWell.",
);
const features = [
  [
    "◷",
    "A clear schedule",
    "Appointments, provider availability and patient requests in one focused workspace.",
  ],
  [
    "▤",
    "Connected documentation",
    "Patient charts, Note Aid, treatment information and historical records with their sources.",
  ],
  [
    "◎",
    "Practice operations",
    "Reviewed billing workflows, secure conversations and agreements organized by practice.",
  ],
];
</script>
