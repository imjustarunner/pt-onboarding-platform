<template>
  <div class="qv-launch" :style="brandStyle">
    <header class="launch-header">
      <div v-if="schoolQuickView" class="school-brand"><Building2 :size="26" aria-hidden="true" /><span>SchoolCareBridge<small>Quick View</small></span></div>
      <AuricWellBrand v-else context="Quick View" />
      <span class="workspace-label">Your daily workspace</span>
    </header>

    <main class="launch-main">
      <section class="launch-intro" aria-labelledby="launch-heading">
        <span class="eyebrow"><span aria-hidden="true"></span> Quick access to your workday</span>
        <h1 id="launch-heading">Your workday,<br /> <span>within reach.</span></h1>
        <p class="intro-description">Stay connected to your team and keep your day moving, wherever work takes you.</p>
        <div class="capability-list">
          <div><span class="capability-icon"><CalendarDays :size="21" aria-hidden="true" /></span><p><strong>See what’s next</strong><span>Your schedule, in one clear view.</span></p></div>
          <div><span class="capability-icon"><MessageCircle :size="21" aria-hidden="true" /></span><p><strong>Stay in the conversation</strong><span>Keep your team within reach.</span></p></div>
          <div><span class="capability-icon"><ListChecks :size="21" aria-hidden="true" /></span><p><strong>Make room for progress</strong><span>Keep track of what needs your attention.</span></p></div>
        </div>
      </section>

      <section class="signin-card" aria-labelledby="signin-heading" :aria-busy="busy || resolving">
        <div class="workspace-identity">
          <img v-if="agencyLogoUrl" :src="agencyLogoUrl" alt="" class="logo" />
          <span v-else class="workspace-icon"><Building2 :size="23" aria-hidden="true" /></span>
          <div><span class="field-eyebrow">YOUR WORKSPACE</span><strong>{{ agencyName || (schoolQuickView ? 'SchoolCareBridge' : 'AuricWell') }}</strong></div>
          <LockKeyhole :size="17" class="identity-lock" aria-hidden="true" />
        </div>

        <h2 id="signin-heading">{{ schoolQuickView && !agencyId ? 'Find your school' : isLocked ? 'Let’s get you back in' : 'Welcome back' }}</h2>
        <p class="signin-description" v-if="schoolQuickView && !agencyId">Enter your school’s portal name to open its workspace.</p>
        <p class="signin-description" v-else-if="isLocked">Quick View is locked. Sign in to your portal to reset your six-digit passcode.</p>
        <p class="signin-description" v-else>Enter your Quick View passcode to pick up where you left off.</p>

        <div v-if="error" id="launcher-error" class="err" role="alert">{{ error }}</div>

        <form v-if="schoolQuickView && !agencyId" class="form" @submit.prevent="selectSchool">
          <label for="school-portal-name">School portal name</label>
          <input id="school-portal-name" v-model="schoolSlug" name="organization" placeholder="Your school’s portal name" pattern="[a-zA-Z0-9-]+" autocapitalize="none" spellcheck="false" required :disabled="resolving" :aria-describedby="error ? 'launcher-error' : undefined" />
          <button type="submit" class="btn" :disabled="resolving || !schoolSlug.trim()"><LoaderCircle v-if="resolving" :size="18" class="spinning" aria-hidden="true" /><span>{{ resolving ? 'Finding your workspace…' : 'Open school Quick View' }}</span><ArrowRight v-if="!resolving" :size="18" aria-hidden="true" /></button>
          <a class="recovery-link" href="https://schoolcarebridge.org/app">Open SchoolCareBridge sign-in <span aria-hidden="true">↗</span></a>
        </form>
        <template v-else-if="isLocked">
          <a v-if="loginUrl" class="btn" :href="loginUrl">Sign in to reset <ArrowRight :size="18" aria-hidden="true" /></a>
        </template>
        <template v-else-if="ready && agencyId">
          <form class="form" autocomplete="on" @submit.prevent="unlock">
            <label for="quick-view-email">Account email <span class="optional">Optional</span></label>
            <input id="quick-view-email" v-model="credentialEmail" name="username" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="you@yourorganization.com" aria-describedby="email-help" :disabled="busy" />
            <span id="email-help" class="field-help">Helps your password manager find the right account.</span>
            <label for="quick-view-passcode" class="passcode-label">6-digit passcode</label>
            <input
              id="quick-view-passcode"
              v-model="passcode"
              class="pin"
              type="password"
              inputmode="numeric"
              maxlength="6"
              pattern="\d{6}"
              name="password"
              autocomplete="current-password"
              placeholder="••••••"
              aria-label="6-digit Quick View passcode"
              :aria-describedby="error ? 'launcher-error' : undefined"
              :disabled="busy"
              required
            />
            <button type="submit" class="btn" :disabled="busy || !validPasscode"><LoaderCircle v-if="busy" :size="18" class="spinning" aria-hidden="true" /><span>{{ busy ? 'Opening your workspace…' : 'Open workspace' }}</span><ArrowRight v-if="!busy" :size="18" aria-hidden="true" /></button>
          </form>
          <p v-if="loginUrl" class="recovery">Need a new passcode? <a :href="loginUrl">Sign in to reset</a></p>
        </template>
        <div v-else-if="resolving || !ready" class="loading-state" role="status"><LoaderCircle :size="23" class="spinning" aria-hidden="true" /><span>Finding your workspace…</span></div>
        <button v-else-if="error" type="button" class="btn" @click="retryTenant">Try again <ArrowRight :size="18" aria-hidden="true" /></button>

        <p class="access-note"><ShieldCheck :size="16" aria-hidden="true" /><span>Your organization’s access permissions apply.</span></p>
      </section>
    </main>
    <footer class="launch-footer">{{ schoolQuickView ? 'SchoolCareBridge' : 'AuricWell' }} <span aria-hidden="true">·</span> A more connected workday.</footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, Building2, CalendarDays, ListChecks, LoaderCircle, LockKeyhole, MessageCircle, ShieldCheck } from '@lucide/vue';
import AuricWellBrand from '../components/auricwell/AuricWellBrand.vue';
import { AURICWELL_PREVIEW_URL } from '../constants/auricwellBrand';
import { quickViewDeepLink } from '../utils/quickViewDeepLink';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { getSubdomain, isQuickViewHost, resolveHostForAgencyLookup } from '../utils/subdomain';
import { useBrandingStore } from '../store/branding';

const SESSION_KEY = 'plottwist.quickViewSession';
const apiBase = '/api/quick-view';
const schoolQuickView = window.location.hostname === 'qv.app.schoolcarebridge.org';
const schoolSlug = ref(new URLSearchParams(window.location.search).get('organization') || '');
async function selectSchool() {
  if (resolving.value) return;
  try { await resolveTenant(); } catch (e) { error.value = e?.response?.data?.error?.message || 'School Quick View could not be opened.'; }
}
async function retryTenant() {
  if (resolving.value) return;
  try { await resolveTenant(); } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not load your workspace. Please try again.'; }
}
const router = useRouter();
const route = useRoute();
const branding = useBrandingStore();

const ready = ref(false);
const resolving = ref(false);
const busy = ref(false);
const error = ref('');
const passcode = ref('');
const credentialEmail = ref('');
const agencyId = ref(null);
const agencyName = ref('');
const agencyLogoUrl = ref('');
const agencyPrimaryColor = ref('');
const colorPalette = ref({});
const loginUrl = ref('');
const isLocked = ref(false);
const portalSlug = ref('');

const validPasscode = computed(() => /^\d{6}$/.test(passcode.value));
const brandStyle = computed(() => ({
  '--qv-primary': '#2563eb',
  '--qv-tenant-accent': colorPalette.value?.primary || agencyPrimaryColor.value || '#2563eb'
}));

async function resolveTenant() {
  error.value = '';
  if (schoolQuickView && !schoolSlug.value.trim()) return;
  resolving.value = true;
  try {
    try {
      await branding.initializePortalTheme?.();
    } catch { /* ignore */ }

    const slug =
      (schoolQuickView ? schoolSlug.value.trim().toLowerCase() : '')
      || getSubdomain()
      || String(branding.portalHostPortalUrl || '').trim().toLowerCase()
      || '';
    portalSlug.value = slug;

    const host = resolveHostForAgencyLookup();
    const { data } = await axios.get(`${apiBase}/tenant`, {
      params: { portal: slug || undefined, host: host || undefined },
      withCredentials: true
    });
    agencyId.value = data.agencyId;
    agencyName.value = data.agencyName || '';
    agencyLogoUrl.value = data.agencyLogoUrl || '';
    agencyPrimaryColor.value = data.agencyPrimaryColor || '';
    colorPalette.value = data.colorPalette || {};
    loginUrl.value = schoolQuickView ? `https://schoolcarebridge.org/app/${encodeURIComponent(slug)}` : data.loginUrl || '';
    ready.value = true;

    // Install PWA manifest for this origin root
    try {
      const origin = window.location.origin;
      const productName = schoolQuickView ? 'Quick View' : 'AuricWell';
      const name = agencyName.value ? `${agencyName.value} · ${productName}` : productName;
      const theme = agencyPrimaryColor.value || '#2563eb';
      const href =
        `${apiBase}/pwa-manifest?` +
        new URLSearchParams({
          origin,
          name,
          theme,
          icon: agencyLogoUrl.value || (schoolQuickView ? '/assets/ptco/logo-flat.png' : AURICWELL_PREVIEW_URL)
        }).toString();
      let link = document.querySelector('link[rel="manifest"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
      }
      link.setAttribute('href', href);
      document.title = name;
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.setAttribute('content', theme);
    } catch { /* ignore */ }
  } finally {
    resolving.value = false;
  }
}

async function unlock() {
  if (!validPasscode.value || !agencyId.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const { data } = await axios.post(
      `${apiBase}/tenant/unlock`,
      {
        passcode: passcode.value,
        email: credentialEmail.value.trim() || undefined,
        agencyId: agencyId.value,
        portal: portalSlug.value || undefined
      },
      { withCredentials: true }
    );
    try {
      sessionStorage.setItem(SESSION_KEY, data.sessionToken || '');
    } catch { /* ignore */ }
    // Land in the full Quick View shell (session via cookie + stored token)
    router.replace({ name: 'QuickViewApp', query: quickViewDeepLink(route.query) });
  } catch (e) {
    const err = e?.response?.data?.error || {};
    error.value = err.message || 'Unlock failed';
    if (err.requiresReset || err.code === 'locked') {
      isLocked.value = true;
      if (err.loginUrl) loginUrl.value = err.loginUrl;
    }
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  // If already bound via old flow, keep supporting redirect
  try {
    const token = String(localStorage.getItem('plottwist.quickViewToken') || '').trim();
    if (token) {
      const dest = isQuickViewHost()
        ? `/t/${encodeURIComponent(token)}`
        : `/quick-view/${encodeURIComponent(token)}`;
      router.replace({ path: dest, query: quickViewDeepLink(route.query) });
      return;
    }
  } catch { /* ignore */ }

  try {
    await resolveTenant();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load Quick View for this tenant';
    ready.value = true;
  }
});
</script>

<style scoped>
.qv-launch {
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  padding: max(28px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
  background: radial-gradient(ellipse at 90% 5%, #eaf1ff 0, transparent 45%), #f4f7fb;
  color: #172b4d;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.qv-launch *, .qv-launch *::before, .qv-launch *::after { box-sizing: border-box; }
.launch-header { max-width: 1120px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.workspace-label { font-size: 12px; font-weight: 600; color: #62748e; }
.school-brand { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 750; color: #12356b; }
.school-brand small { display: block; margin-top: 3px; font-size: 11px; font-weight: 500; color: #526680; }
.launch-main { display: grid; grid-template-columns: 1fr 430px; align-items: center; gap: clamp(40px, 8vw, 120px); max-width: 1056px; min-height: calc(100dvh - 156px); margin: 0 auto; padding: 56px 0; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; color: #4c6688; font-size: 11px; font-weight: 650; letter-spacing: .015em; }
.eyebrow > span { width: 6px; height: 6px; border-radius: 50%; background: #3774e6; }
.launch-intro h1 { margin: 22px 0 18px; color: #162e54; font-size: clamp(38px, 4.8vw, 58px); font-weight: 730; line-height: 1.12; letter-spacing: -.055em; }
.launch-intro h1 > span { color: var(--qv-primary); }
.intro-description { max-width: 370px; color: #60728b; font-size: 16px; line-height: 1.75; margin: 0; }
.capability-list { display: grid; gap: 23px; margin-top: 38px; }
.capability-list > div { display: flex; align-items: center; gap: 14px; }
.capability-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 1px solid #e1e8f4; border-radius: 13px; background: #fff; color: #3868b8; flex-shrink: 0; }
.capability-list p { display: grid; gap: 5px; margin: 0; }
.capability-list strong { color: #263e60; font-size: 13px; font-weight: 650; }
.capability-list p > span { color: #6a7b92; font-size: 12px; line-height: 1.45; }
.signin-card { padding: 30px; border: 1px solid #e3eaf3; border-radius: 24px; background: #fff; box-shadow: 0 20px 65px -35px #264c8f40, 0 2px 8px #264c8f04; }
.workspace-identity { display: flex; align-items: center; gap: 11px; padding-bottom: 25px; border-bottom: 1px solid #edf0f6; margin-bottom: 26px; }
.logo, .workspace-icon { width: 43px; height: 43px; border-radius: 12px; flex-shrink: 0; }
.logo { object-fit: contain; padding: 4px; border: 1px solid #e9eef5; }
.workspace-icon { display: flex; align-items: center; justify-content: center; color: var(--qv-tenant-accent); background: color-mix(in srgb, var(--qv-tenant-accent) 8%, white); }
.workspace-identity > div { display: grid; gap: 5px; min-width: 0; }
.field-eyebrow { color: #62748e; font-size: 10px; font-weight: 750; letter-spacing: .12em; }
.workspace-identity strong { color: #2a4162; font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
.identity-lock { color: #8b9ab0; margin-left: auto; flex-shrink: 0; }
.signin-card h2 { font-size: 25px; line-height: 1.25; letter-spacing: -.035em; font-weight: 700; margin: 0 0 10px; color: #1c3457; }
.signin-description { color: #62748e; font-size: 13px; line-height: 1.7; margin: 0 0 25px; }
.form { display: grid; gap: 9px; width: 100%; }
.form label { display: flex; align-items: center; justify-content: space-between; color: #384e6b; font-size: 12px; font-weight: 650; text-align: left; }
.optional { color: #62748e; font-size: 11px; font-weight: 500; }
.form input { appearance: none; width: 100%; min-width: 0; min-height: 46px; padding: 12px 14px; border: 1px solid #e3eaf3; border-radius: 10px; background: #fbfcfe; color: #203857; font: inherit; font-size: 13px; transition: border-color .15s, box-shadow .15s; }
.form input::placeholder { color: #97a3b4; }
.form input:focus-visible { outline: none; border-color: #6795ef; box-shadow: 0 0 0 3px #2563eb12; background: #fff; }
.form input:disabled { opacity: .65; }
.field-help { color: #62748e; font-size: 11px; line-height: 1.5; }
.form .passcode-label { margin-top: 13px; }
.form .pin { font-size: 25px; line-height: 1.2; letter-spacing: .42em; text-align: center; min-height: 55px; padding-left: calc(14px + .42em); }
.btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 47px; margin-top: 10px; padding: 13px 14px; border: 1px solid transparent; border-radius: 10px; background: var(--qv-primary); color: #fff; font-family: inherit; font-size: 13px; font-weight: 650; text-decoration: none; cursor: pointer; transition: background .15s, transform .15s, box-shadow .15s; }
.btn:hover:not(:disabled) { background: #194ccd; box-shadow: 0 4px 12px #2563eb22; }
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn:disabled { background: #dfe8fb; color: #667fae; cursor: not-allowed; }
.qv-launch a:focus-visible, .btn:focus-visible { outline: 3px solid #80aaff; outline-offset: 3px; }
.recovery { margin: 19px 0 0; color: #62748e; font-size: 11px; text-align: center; line-height: 1.6; }
.recovery a, .recovery-link { color: #245bc9; font-weight: 600; text-decoration: none; }
.recovery a:hover, .recovery-link:hover { text-decoration: underline; }
.recovery-link { margin-top: 9px; font-size: 11px; text-align: center; line-height: 1.6; }
.err { margin-bottom: 18px; padding: 12px 14px; border: 1px solid #f1cbd0; border-radius: 10px; background: #fff5f6; color: #a12f42; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.access-note { display: flex; align-items: center; justify-content: center; gap: 7px; margin: 25px 0 0; padding-top: 20px; border-top: 1px solid #edf0f6; color: #62748e; font-size: 11px; line-height: 1.6; text-align: center; }
.access-note svg { flex-shrink: 0; }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 120px; color: #617ba1; font-size: 12px; }
.spinning { animation: launcher-spin 1s linear infinite; }
.launch-footer { max-width: 1120px; margin: 0 auto; color: #62748e; font-size: 10px; text-align: center; }
.launch-footer > span { margin: 0 7px; }
@keyframes launcher-spin { to { transform: rotate(360deg); } }
@media (max-width: 800px) {
  .launch-main { grid-template-columns: minmax(0, 430px); justify-content: center; gap: 27px; padding: 42px 0 32px; min-height: calc(100dvh - 125px); }
  .launch-intro { text-align: center; }
  .launch-intro h1 { font-size: 37px; margin: 16px 0 12px; }
  .launch-intro h1 br { display: none; }
  .intro-description { max-width: 350px; margin: 0 auto; font-size: 13px; line-height: 1.65; }
  .capability-list { display: none; }
  .eyebrow { font-size: 10px; }
}
@media (max-width: 430px) {
  .qv-launch { padding-left: max(18px, env(safe-area-inset-left)); padding-right: max(18px, env(safe-area-inset-right)); padding-top: max(23px, env(safe-area-inset-top)); }
  .workspace-label { display: none; }
  .launch-header { justify-content: center; }
  .launch-main { padding-top: 32px; gap: 25px; }
  .launch-intro h1 { font-size: 33px; }
  .signin-card { padding: 25px 22px; border-radius: 20px; }
  .form input { font-size: 16px; }
  .signin-card h2 { font-size: 24px; }
}
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } .btn, .form input { transition: none; } }
</style>
