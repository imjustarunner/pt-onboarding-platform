<template>
  <div class="hq-login">
    <img class="hq-backdrop" src="/branding/hq-login-ribbons.png" alt="" aria-hidden="true" />
    <header class="hq-header">
      <a class="hq-wordmark" href="/login" aria-label="PlotTwistHQ home">
        <img src="/assets/ptco/logo-flat.webp" alt="" width="42" height="58" />
        <span>PlotTwist<b>HQ</b></span>
      </a>
      <nav aria-label="PlotTwistHQ">
        <button type="button" @click="$emit('security')">Security</button>
        <router-link to="/support">Support</router-link>
        <a class="hq-company-link" href="https://plottwistco.com/">Visit PlotTwistCo <ArrowUpRight :size="17" /></a>
      </nav>
    </header>
    <main class="hq-main">
      <section class="hq-intro" aria-labelledby="hq-title">
        <p class="hq-eyebrow">MANAGE &nbsp; · &nbsp; OPERATE &nbsp; · &nbsp; GROW</p>
        <h1 id="hq-title">PlotTwist<span>HQ</span></h1>
        <p class="hq-subtitle">Management portal for modern practice operations.</p>
        <p class="hq-description">Everything you need to run, manage, and grow your practice, in one unified platform.</p>
        <div class="hq-highlights">
          <div v-for="item in highlights" :key="item.label">
            <component :is="item.icon" :size="28" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </div>
        </div>
      </section>
      <section class="hq-auth" aria-label="Sign in to PlotTwistHQ"><slot /></section>
    </main>
    <footer class="hq-footer">
      <span>&copy; {{ year }} Plot Twist Co. All rights reserved.</span>
      <nav aria-label="Legal"><router-link to="/privacypolicy">Privacy</router-link><router-link to="/terms">Terms</router-link><router-link to="/support">Support</router-link></nav>
    </footer>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { ArrowUpRight, ChartNoAxesColumnIncreasing, UsersRound, ClipboardList, Settings } from '@lucide/vue';
defineEmits(['security']);
const year = new Date().getFullYear();
let colorScheme;
let themeMeta;
let originalThemeColor;
let createdThemeMeta = false;
const syncBrowserColor = () => themeMeta?.setAttribute('content', colorScheme?.matches ? '#090b0f' : '#fafbfc');
onMounted(() => {
  colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    document.head.appendChild(themeMeta);
    createdThemeMeta = true;
  }
  originalThemeColor = themeMeta.getAttribute('content');
  syncBrowserColor();
  colorScheme?.addEventListener?.('change', syncBrowserColor);
});
onBeforeUnmount(() => {
  colorScheme?.removeEventListener?.('change', syncBrowserColor);
  if (createdThemeMeta) themeMeta?.remove();
  else if (originalThemeColor === null) themeMeta?.removeAttribute('content');
  else if (originalThemeColor !== undefined) themeMeta?.setAttribute('content', originalThemeColor);
});
const highlights = [
  { icon: ChartNoAxesColumnIncreasing, label: 'Streamline operations' },
  { icon: UsersRound, label: 'Empower your team' },
  { icon: ClipboardList, label: 'Delight your clients' },
  { icon: Settings, label: 'Scale with confidence' }
];
</script>

<style scoped>
.hq-login {
  --hq-bg: #fafbfc;
  --hq-surface: #ffffff;
  --hq-text: #15171b;
  --hq-muted: #626a78;
  --hq-line: #d7dbe2;
  --hq-red: #cf0023;
  --hq-soft: #fff0f2;
  --bg: var(--hq-surface);
  --border: var(--hq-line);
  --text-primary: var(--hq-text);
  --text-secondary: var(--hq-muted);
  --primary: var(--hq-red);
  --accent: var(--hq-red);
  color-scheme: light;
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--hq-bg);
  color: var(--hq-text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  letter-spacing: 0;
}
.hq-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -1; pointer-events: none; opacity: .16; filter: invert(1) hue-rotate(180deg); }
.hq-header, .hq-main, .hq-footer { width: min(1320px, calc(100% - 96px)); margin-inline: auto; }
.hq-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-block: 24px; }
.hq-wordmark { display: flex; align-items: center; gap: 12px; font-size: 25px; font-weight: 800; white-space: nowrap; }
.hq-wordmark img { object-fit: contain; }
.hq-wordmark b, h1 span { color: var(--hq-red); }
.hq-login a { color: inherit; text-decoration: none; }
.hq-login a:hover, .hq-header button:hover { color: var(--hq-red); }
.hq-login a:focus-visible, .hq-header button:focus-visible { outline: 2px solid var(--hq-red); outline-offset: 5px; }
.hq-header nav, .hq-footer nav { display: flex; align-items: center; gap: 28px; font-size: 14px; }
.hq-header button { background: none; border: 0; padding: 0; color: inherit; cursor: pointer; font: inherit; }
.hq-company-link { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--hq-line); border-radius: 8px; padding: 12px 18px; }
.hq-main { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(370px, 1fr); align-items: center; gap: 64px; flex: 1; padding-block: 30px 50px; }
.hq-intro { min-width: 0; padding-block: 30px; align-self: center; }
.hq-eyebrow { font-size: 12px; font-weight: 600; color: var(--hq-muted); margin: 0 0 24px; }
h1 { font-size: 76px; line-height: 1.08; font-weight: 850; margin: 0 0 22px; color: var(--hq-text); letter-spacing: 0; }
.hq-subtitle { font-size: 32px; line-height: 1.3; margin: 0 0 20px; max-width: 600px; color: var(--hq-text); }
.hq-description { font-size: 18px; line-height: 1.6; color: var(--hq-muted); max-width: 530px; margin: 0; }
.hq-highlights { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-top: 40px; }
.hq-highlights > div { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; font-size: 14px; line-height: 1.5; }
.hq-highlights svg { box-sizing: content-box; color: var(--hq-red); padding: 16px; background: var(--hq-soft); border-radius: 8px; }
.hq-auth { min-width: 0; }
.hq-footer { display: flex; justify-content: space-between; gap: 24px; padding-block: 22px; color: var(--hq-muted); border-top: 1px solid var(--hq-line); font-size: 12px; }
.hq-footer nav { font-size: 12px; }
/* The existing authentication form stays shared with tenant logins. */
.hq-login :deep(.login-container) { background: transparent !important; display: block; }
.hq-login :deep(.login-card) { box-sizing: border-box; width: 100%; max-width: none; padding: 34px 40px; border: 1px solid var(--hq-line); border-radius: 8px; background: var(--hq-surface); box-shadow: 0 18px 60px #12152210; color: var(--hq-text); }
.hq-login :deep(.hq-cardhead) { text-align: center; margin-bottom: 28px; }
.hq-login :deep(.hq-cardhead img) { height: 112px; width: 90px; object-fit: contain; margin: 0 auto 12px; }
.hq-login :deep(.hq-cardhead h2) { color: var(--hq-text); font-size: 32px; line-height: 1.2; margin: 0 0 10px; font-weight: 800; }
.hq-login :deep(.hq-cardhead h2 span) { color: var(--hq-red); }
.hq-login :deep(.hq-cardhead p) { color: var(--hq-muted); margin: 0; font-size: 16px; }
.hq-login :deep(.form-group) { margin-bottom: 20px; }
.hq-login :deep(.form-group label) { color: var(--hq-text); font-size: 14px; font-weight: 500; margin-bottom: 8px; }
.hq-login :deep(.form-group input), .hq-login :deep(.form-group select), .hq-login :deep(.form-group textarea) { width: 100%; box-sizing: border-box; border: 1px solid var(--hq-line); background: var(--hq-surface) !important; color: var(--hq-text) !important; border-radius: 8px; min-height: 50px; padding: 12px 14px; font-size: 16px; box-shadow: none; }
.hq-login :deep(input::placeholder) { color: var(--hq-muted); }
.hq-login :deep(.form-group input), .hq-login :deep(.form-group select), .hq-login :deep(.form-group textarea) { color-scheme: inherit; transition: border-color .15s, box-shadow .15s; }
.hq-login :deep(input:focus-visible) { outline: 2px solid var(--hq-red); outline-offset: 2px; }
.hq-login :deep(.password-input-wrap input) { padding-right: 50px; }
.hq-login :deep(.password-toggle-btn) { color: var(--hq-muted); width: 44px; height: 44px; display: grid; place-items: center; right: 4px; }
.hq-login :deep(.remember-row) { margin-block: 4px 20px; display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
.hq-login :deep(.remember-me) { color: var(--hq-text); font-size: 13px; }
.hq-login :deep(input[type=checkbox]) { accent-color: var(--hq-red); width: 18px; height: 18px; }
.hq-login :deep(.btn-primary) { background: var(--hq-red); border: 1px solid var(--hq-red); color: white; min-height: 50px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 5px 16px #cf002317; }
.hq-login :deep(.btn-primary:hover:not(:disabled)) { background: #b6001f; }
.hq-login :deep(.btn:disabled) { opacity: .6; cursor: not-allowed; }
.hq-login :deep(.btn-secondary) { background: var(--hq-surface); color: var(--hq-text); border: 1px solid var(--hq-line); border-radius: 8px; }
.hq-login :deep(.help-link) { color: var(--hq-red); font-size: 13px; }
.hq-login :deep(.hq-google) { display: flex; width: 100%; align-items: center; justify-content: center; gap: 12px; min-height: 50px; margin-top: 16px; background: var(--hq-surface); color: var(--hq-text); border: 1px solid var(--hq-line); border-radius: 8px; font: inherit; cursor: pointer; }
.hq-login :deep(.hq-divider) { display: flex; align-items: center; gap: 16px; font-size: 11px; color: var(--hq-muted); margin-top: 24px; }
.hq-login :deep(.hq-divider::before), .hq-login :deep(.hq-divider::after) { content: ''; flex: 1; height: 1px; background: var(--hq-line); }
.hq-login :deep(.hq-powered) { margin: 24px 0 0; text-align: center; color: var(--hq-muted); font-size: 13px; }
.hq-login :deep(.hq-powered a) { color: var(--hq-red); font-weight: 600; }
.hq-login :deep(.login-security-footer) { margin-top: 22px; }
.hq-login :deep(.login-security-guidance), .hq-login :deep(.modal) { background: var(--hq-surface); color: var(--hq-text); border-color: var(--hq-line); }
.hq-login :deep(.modal h3), .hq-login :deep(.modal-subtitle) { color: var(--hq-text); }
.hq-login :deep(.error) { background: var(--hq-soft); color: var(--hq-red); border: 1px solid var(--hq-red); }
.hq-login :deep(.remembered-account) { padding: 0; background: transparent; box-shadow: none; border: 0; border-radius: 0; color: var(--hq-text); }
.hq-login :deep(.account-details h3), .hq-login :deep(.account-details p) { color: var(--hq-text); }
.hq-login :deep(.account-avatar), .hq-login :deep(.account-person), .hq-login :deep(.account-badge) { background: var(--hq-soft); color: var(--hq-red); }
.hq-login :deep(.account-continue) { background: var(--hq-surface); color: var(--hq-text); border-color: var(--hq-line); border-radius: 8px; }
.hq-login :deep(.account-actions button) { color: var(--hq-red); }
@media (prefers-color-scheme: dark) {
  .hq-login { --hq-bg: #090b0f; --hq-surface: #111318; --hq-text: #f7f8fa; --hq-muted: #aeb6c4; --hq-line: #373c47; --hq-red: #ff2847; --hq-soft: #2b141b; color-scheme: dark; }
  .hq-backdrop { filter: none; opacity: .7; }
  .hq-login :deep(.login-card) { border-color: #61303c; box-shadow: 0 18px 60px #0005; }
  .hq-login :deep(.btn-primary) { background: #cf0023; border-color: #ff2847; }
}
@media (min-width: 1600px) { .hq-main { gap: 96px; } }
@media (max-width: 1150px) { h1 { font-size: 56px; } .hq-main { gap: 36px; } .hq-subtitle { font-size: 27px; } .hq-login :deep(.login-card) { padding: 30px; } }
@media (max-width: 900px) {
  .hq-header, .hq-main, .hq-footer { width: calc(100% - 48px); }
  .hq-main { grid-template-columns: minmax(0, 1fr); max-width: 520px; gap: 24px; padding-top: 12px; }
  .hq-intro { padding: 0; text-align: center; }
  h1 { font-size: 44px; margin-bottom: 12px; }
  .hq-subtitle { font-size: 21px; margin: 0; }
  .hq-eyebrow, .hq-description, .hq-highlights { display: none; }
  .hq-header nav > :not(.hq-company-link) { display: none; }
  .hq-wordmark { font-size: 21px; gap: 8px; }
  .hq-footer { flex-wrap: wrap; justify-content: center; text-align: center; }
}
@media (max-width: 480px) {
  .hq-header { width: calc(100% - 32px); gap: 12px; padding-block: 16px; }
  .hq-main { width: calc(100% - 32px); }
  .hq-wordmark { font-size: 18px; }
  .hq-wordmark img { width: 28px; height: 40px; }
  .hq-company-link { font-size: 12px; padding: 10px; gap: 5px; }
  h1 { font-size: 38px; }
  .hq-subtitle { font-size: 19px; }
  .hq-login :deep(.login-card) { padding: 26px 20px; }
  .hq-login :deep(.hq-cardhead img) { height: 72px; width: 60px; }
  .hq-login :deep(.hq-cardhead h2) { font-size: 28px; }
}
</style>
