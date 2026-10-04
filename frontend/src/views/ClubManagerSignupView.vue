<template>
  <div class="club-manager-signup">
    <header class="signup-header">
      <div class="signup-wrap header-inner">
        <a :href="isSummit ? '/p/sstc' : clubsPath" class="signup-brand">
          <img v-if="displayLogoUrl && !logoError" :src="displayLogoUrl" alt="" @error="handleLogoError" />
          <span>{{ platformName }}<small>YOUR PEOPLE. YOUR NEXT SEASON.</small></span>
        </a>
        <nav aria-label="Club signup navigation">
          <a v-if="isSummit" href="/p/sstc">Home</a>
          <router-link :to="clubsPath">Find a club</router-link>
          <router-link :to="loginPath" class="login-button">Log in <span aria-hidden="true">↗</span></router-link>
        </nav>
      </div>
    </header>
    <main class="signup-wrap signup-layout">
      <aside class="signup-intro" aria-labelledby="signup-heading">
        <p class="eyebrow">START SOMETHING TOGETHER</p>
        <h1 id="signup-heading">Your people. <br />Your club. <br /><span>Your next chapter.</span></h1>
        <p class="intro-copy">Bring your community together for a season of friendly competition and shared progress.</p>
        <div class="trial-card"><span class="trial-number">3</span><div><strong>Months to make it yours.</strong><p>All new clubs start with <strong>3 months of free, unlimited access</strong>. No credit card required.</p></div></div>
        <section class="next-steps" aria-labelledby="steps-heading">
          <h2 id="steps-heading">From an idea to your first season</h2>
          <ol>
            <li><span class="step-number">01</span><div><h3>Create your account</h3><p>Start with your details and a name for your club.</p></div></li>
            <li><span class="step-number">02</span><div><h3>Verify your email</h3><p>Follow the link we send to continue your setup.</p></div></li>
            <li><span class="step-number">03</span><div><h3>Make it your own</h3><p>Complete club setup and review, then invite your people.</p></div></li>
          </ol>
          <p class="scope-note">As founder, you’ll manage the club you create. Your club becomes ready for members after setup and review.</p>
        </section>
        <p class="join-note">Here to join an existing community?<br /><router-link :to="clubsPath">Find your club <span aria-hidden="true">→</span></router-link></p>
      </aside>
      <section class="signup-card" aria-labelledby="form-heading">
        <div v-if="!success" class="form-heading"><p class="eyebrow">LET’S GET STARTED</p><h2 id="form-heading">Start my club</h2><p>Create your founder account. We’ll guide you through the rest.</p></div>
      <div v-if="success" class="success-message" role="status" tabindex="-1" ref="successPanel">
        <span class="success-check" aria-hidden="true">✓</span>
        <h2 id="form-heading">Check your email.</h2>
        <p>{{ success }}</p>
        <router-link :to="loginPath" class="btn btn-primary">Go to Login</router-link>
      </div>

      <form v-else @submit.prevent="submit" class="signup-form">
        <div v-if="accountExists" class="account-exists-callout" role="alert">
          <strong>You already have an account.</strong>
          <router-link :to="loginPath">Log in here</router-link> to start your club from your dashboard.
        </div>
        <div v-else-if="error" class="error" role="alert">{{ error }}</div>
        <fieldset :disabled="loading">
          <legend><span>01</span> Your account</legend>
          <p class="field-help">You’ll use this account to manage your club.</p>
        <div class="form-group">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" required placeholder="you@example.com" autocomplete="email" :disabled="loading" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <div class="input-wrap">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              placeholder="Choose a password"
              autocomplete="new-password"
              minlength="6"
              maxlength="128"
              :disabled="loading"
            />
            <button type="button" class="toggle-vis" @click="showPassword = !showPassword" :aria-label="showPassword ? 'Hide password' : 'Show password'">
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <PasswordStrengthMeter :password="password" />
        </div>
        <div class="form-row">
        <div class="form-group">
          <label for="firstName">First name</label>
          <input id="firstName" v-model="firstName" type="text" required placeholder="First name" autocomplete="given-name" :disabled="loading" />
        </div>
        <div class="form-group">
          <label for="lastName">Last name</label>
          <input id="lastName" v-model="lastName" type="text" required placeholder="Last name" autocomplete="family-name" :disabled="loading" />
        </div>
        </div>
        </fieldset>
        <fieldset :disabled="loading">
          <legend><span>02</span> Your club</legend>
          <p class="field-help">Tell us a little about the community you want to bring together.</p>
        <div class="form-group">
          <label for="clubName">Proposed club name</label>
          <input id="clubName" v-model="clubName" type="text" required placeholder="Your club name" :disabled="loading" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="city">City <span class="optional">(optional)</span></label>
            <input id="city" v-model="city" type="text" placeholder="e.g. Denver" autocomplete="address-level2" :disabled="loading" />
          </div>
          <div class="form-group">
            <label for="state">State <span class="optional">(optional)</span></label>
            <input id="state" v-model="state" type="text" maxlength="2" placeholder="CO" autocomplete="address-level1" :disabled="loading" />
          </div>
        </div>
        <div class="form-group">
          <label for="clubFocus">Who is this club for? <span class="optional">(optional)</span></label>
          <textarea id="clubFocus" v-model="clubFocus" rows="3" placeholder="Describe your community, training style, and why you want to lead it." :disabled="loading"></textarea>
        </div>
        </fieldset>
        <div class="form-group">
          <label class="checkbox-row">
            <input v-model="timelineAcknowledged" type="checkbox" required :disabled="loading" />
            <span>I understand there is a setup and review timeline before my club is fully established.</span>
          </label>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Creating your account…' : 'Create my account' }} <span v-if="!loading" aria-hidden="true">→</span>
        </button>
        <p class="trial-notice">Next: verify your email, then continue with club setup.</p>
      </form>

      <p class="login-link">
        Already have an account? <router-link :to="loginPath">Log in</router-link>
      </p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useBrandingStore } from '../store/branding';
import { SUMMIT_STATS_TEAM_CHALLENGE_NAME } from '../constants/summitStatsBranding.js';
import PasswordStrengthMeter from '../components/PasswordStrengthMeter.vue';

const route = useRoute();
const brandingStore = useBrandingStore();
const orgSlug = computed(() => route.params?.organizationSlug || null);
const loginPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/login` : '/login'));

const loginTheme = ref(null);
const logoError = ref(false);

const displayLogoUrl = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.logoUrl) return loginTheme.value.agency.logoUrl;
  return brandingStore.displayLogoUrl;
});

const platformName = computed(() => loginTheme.value?.agency?.name || SUMMIT_STATS_TEAM_CHALLENGE_NAME);
const isSummit = computed(() => ['sstc', 'ssc', 'summit-stats'].includes(String(orgSlug.value || '').toLowerCase()));
const clubsPath = computed(() => `/${orgSlug.value || 'sstc'}/clubs`);
const successPanel = ref(null);

const handleLogoError = () => { logoError.value = true; };

const fetchLoginTheme = async (portalUrl) => {
  try {
    const response = await api.get(`/agencies/portal/${portalUrl}/login-theme`, { skipGlobalLoading: true });
    loginTheme.value = response.data;
    brandingStore.setPortalThemeFromLoginTheme(response.data);
  } catch (err) {
    console.error('Failed to fetch signup theme:', err);
  }
};

onMounted(async () => {
  if (orgSlug.value) {
    await fetchLoginTheme(orgSlug.value);
  } else if (!brandingStore.portalHostPortalUrl) {
    brandingStore.clearPortalTheme();
  }
});

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const firstName = ref('');
const lastName = ref('');
const clubName = ref('');
const city = ref('');
const state = ref('');
const clubFocus = ref('');
const timelineAcknowledged = ref(false);
const loading = ref(false);
const error = ref('');
const success = ref('');
const accountExists = ref(false);

const submit = async () => {
  if (loading.value) return;
  error.value = '';
  accountExists.value = false;
  if (!timelineAcknowledged.value) {
    error.value = 'Please confirm that you understand club setup includes a review/setup timeline.';
    return;
  }
  loading.value = true;
  try {
    const r = await api.post('/auth/register-club-manager', {
      email: email.value.trim(),
      password: password.value,
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      clubName: clubName.value.trim(),
      city: city.value.trim() || undefined,
      state: state.value.trim().toUpperCase() || undefined,
      clubFocus: clubFocus.value.trim() || undefined,
      ...(orgSlug.value ? { portalSlug: orgSlug.value } : {})
    });
    success.value = r.data?.message || 'Founder account created. Please verify your email before continuing into club setup.';
    if (r.data?.verifyUrl) {
      success.value += `\n\nVerification link (if email not configured): ${r.data.verifyUrl}`;
    }
    await nextTick();
    successPanel.value?.focus();
  } catch (e) {
    if (e?.response?.status === 409 && e?.response?.data?.error?.code === 'ACCOUNT_EXISTS') {
      accountExists.value = true;
    } else {
      error.value = e?.response?.data?.error?.message || 'Signup failed. Please try again.';
    }
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.club-manager-signup { --ink: #15323c; --muted: #58707a; --line: #dbe3dd; min-height: 100vh; background: #f2f5ec; color: var(--ink); }
.club-manager-signup * { box-sizing: border-box; }
.signup-wrap { width: min(1200px, calc(100% - 64px)); margin: 0 auto; }
.signup-header { background: #fff; border-bottom: 1px solid var(--line); }
.header-inner { display: flex; justify-content: space-between; align-items: center; gap: 28px; padding-block: 22px; }
.signup-brand { display: flex; align-items: center; gap: 14px; color: var(--ink); text-decoration: none; font-size: 18px; font-weight: 800; }
.signup-brand img { width: 62px; height: 62px; object-fit: contain; }
.signup-brand small { display: block; margin-top: 6px; font-size: 9px; letter-spacing: .14em; }
.signup-header nav { display: flex; flex-wrap: wrap; align-items: center; gap: 28px; font-size: 14px; font-weight: 650; }
.signup-header nav a { color: var(--ink); text-decoration: none; }
.signup-header nav .login-button { display: flex; align-items: center; gap: 24px; min-height: 44px; padding: 12px 20px; border: 1px solid #c6d3ca; border-radius: 5px; }
.signup-layout { display: grid; grid-template-columns: 1fr 1.15fr; align-items: start; gap: 80px; padding-block: 64px 80px; }
.eyebrow { margin: 0 0 22px; font-size: 11px; letter-spacing: .15em; font-weight: 800; color: #50752d; }
h1 { margin: 0 0 28px; font-size: clamp(40px, 4.5vw, 64px); line-height: 1.07; letter-spacing: -.045em; }
h1 span { color: #52752f; }
.intro-copy { max-width: 420px; font-size: 18px; line-height: 1.7; color: var(--muted); margin: 0 0 30px; }
.trial-card { display: flex; gap: 22px; align-items: center; padding: 24px; background: #e4ecd8; border: 1px solid #d5dfc9; border-radius: 10px; }
.trial-number { font-size: 64px; font-weight: 800; line-height: 1; color: #52752f; }
.trial-card strong { font-size: 16px; }
.trial-card p { font-size: 13px; line-height: 1.6; color: var(--muted); margin: 8px 0 0; }
.trial-card p strong { font-size: inherit; font-weight: 500; }
.next-steps { margin-top: 38px; }
.next-steps h2 { font-size: 19px; margin: 0 0 24px; }
.next-steps ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 24px; }
.next-steps li { display: flex; gap: 16px; }
.step-number { flex-shrink: 0; display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid #c8d5bf; border-radius: 50%; color: #52752f; font-size: 11px; font-weight: 800; }
.next-steps h3 { margin: 0 0 5px; font-size: 15px; }
.next-steps li p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--muted); }
.scope-note { font-size: 12px; line-height: 1.7; color: var(--muted); padding-top: 22px; border-top: 1px solid #d2deca; margin-top: 26px; }
.join-note { font-size: 14px; line-height: 1.9; color: var(--muted); margin: 28px 0 0; }
.join-note a { color: var(--ink); font-weight: 700; text-underline-offset: 4px; }
.signup-card { min-width: 0; padding: 38px; border: 1px solid var(--line); border-radius: 14px; background: #fff; box-shadow: 0 12px 40px #15323c05; }
.form-heading { border-bottom: 1px solid var(--line); padding-bottom: 26px; margin-bottom: 28px; }
.form-heading .eyebrow { margin-bottom: 12px; }
.form-heading h2, .success-message h2 { font-size: 30px; line-height: 1.2; letter-spacing: -.03em; margin: 0 0 12px; }
.form-heading p:last-child { font-size: 14px; line-height: 1.6; color: var(--muted); margin: 0; }
fieldset { border: 0; min-width: 0; padding: 0; margin: 0 0 20px; }
legend { padding: 0; font-size: 17px; font-weight: 750; }
legend span { color: #52752f; font-size: 12px; margin-right: 10px; }
.field-help { font-size: 12px; line-height: 1.6; color: var(--muted); margin: 10px 0 20px; }
.form-group { margin-bottom: 18px; }
.form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.signup-form label { display: block; font-weight: 650; font-size: 13px; margin-bottom: 8px; }
.optional { font-weight: 400; color: var(--muted); }
.signup-form input, .signup-form textarea { width: 100%; min-height: 46px; padding: 12px 14px; border: 1px solid #cbd7cf; border-radius: 5px; font: inherit; font-size: 16px; color: var(--ink); background: #fbfcf9; }
.signup-form input::placeholder, .signup-form textarea::placeholder { color: #6c7e84; opacity: 1; }
.signup-form input:disabled, .signup-form textarea:disabled { opacity: .65; }
.input-wrap { position: relative; }
.input-wrap input { padding-right: 68px; }
.toggle-vis { position: absolute; right: 6px; top: 0; min-height: 46px; background: none; border: 0; padding: 8px; color: #456829; font-size: 12px; font-weight: 700; cursor: pointer; }
.signup-form textarea { resize: vertical; min-height: 100px; line-height: 1.6; }
.signup-form .checkbox-row { display: flex; align-items: start; gap: 12px; font-size: 12px; font-weight: 400; line-height: 1.65; color: var(--muted); }
.signup-form .checkbox-row input { width: 18px; height: 18px; min-height: 18px; margin: 2px 0 0; flex-shrink: 0; accent-color: #52752f; }
.btn-primary { display: inline-flex; justify-content: center; align-items: center; gap: 24px; min-height: 50px; padding: 14px 22px; background: #d0fa64; color: var(--ink); border: 0; border-radius: 5px; font: inherit; font-size: 15px; font-weight: 750; text-decoration: none; cursor: pointer; }
.signup-form .btn-primary { width: 100%; }
.btn-primary:hover:not(:disabled) { background: #c3ee53; }
.btn-primary:disabled { opacity: .65; cursor: wait; }
.trial-notice { font-size: 11px; line-height: 1.6; text-align: center; color: var(--muted); margin: 14px 0 0; }
.login-link { border-top: 1px solid var(--line); padding-top: 20px; margin: 24px 0 0; color: var(--muted); font-size: 13px; }
.login-link a, .account-exists-callout a { color: var(--ink); font-weight: 700; text-underline-offset: 3px; }
.error, .account-exists-callout { padding: 16px; border-radius: 6px; font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
.error { background: #fff0ed; color: #9b2d23; }
.account-exists-callout { background: #fff5df; color: #6e501a; }
.account-exists-callout strong { display: block; }
.success-check { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: #eaf0e3; color: #52752f; font-size: 28px; margin-bottom: 24px; }
.success-message p { white-space: pre-line; overflow-wrap: anywhere; color: var(--muted); line-height: 1.7; }
:where(a, button, input, textarea):focus-visible { outline: 3px solid #52752f; outline-offset: 3px; }
@media (max-width: 1000px) { .signup-layout { gap: 36px; } .signup-card { padding: 28px; } .header-inner { flex-wrap: wrap; } }
@media (max-width: 760px) { .signup-wrap { width: calc(100% - 32px); } .signup-layout { grid-template-columns: 1fr; padding-block: 32px 48px; gap: 28px; } .signup-intro { display: contents; } .signup-intro > .eyebrow { margin: 0; } h1 { margin: -12px 0 0; font-size: 42px; } h1 br { display: none; } h1 br::after { content: ' '; } .intro-copy { margin: -12px 0 0; font-size: 16px; max-width: none; } .trial-card { padding: 18px; } .trial-number { font-size: 48px; } .signup-card { grid-row: 5; } .next-steps { margin-top: 0; } .join-note { margin: 0; } .signup-header nav { width: 100%; justify-content: space-between; gap: 16px; } .signup-brand { font-size: 16px; } .signup-brand img { width: 48px; height: 48px; } .signup-card { padding: 24px; } }
@media (max-width: 420px) { .form-row { grid-template-columns: 1fr; gap: 0; } .signup-card { padding: 20px; } }
</style>
