<template>
  <section class="remembered-account" :class="{ 'remembered-account--glass': glass }" aria-label="Remembered account">
    <div class="account-avatar" aria-hidden="true">{{ initials }}</div>
    <div class="account-details">
      <h3>{{ account.displayName || account.username }}</h3>
      <p>{{ account.loginHint || account.username }}</p>
      <p v-if="account.organizationName || account.title" class="account-context">{{ [account.organizationName, account.title].filter(Boolean).join(' · ') }}</p>
    </div>
    <button class="account-continue" type="button" :disabled="busy" @click="$emit('continue')">
      <svg class="account-google" viewBox="0 0 24 24" aria-label="Google"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.01v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.34Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.79.51 3.82 1.51l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.73 9.4 5.97 12 5.97Z"/></svg>
      <span>{{ busy ? 'Connecting…' : `Continue as ${firstName}` }}</span>
      <span class="account-arrow" aria-hidden="true">→</span>
    </button>
    <div class="account-divider"><span>or</span></div>
    <button class="account-switch" type="button" :disabled="busy" @click="$emit('switch')">Sign in with username instead</button>
    <button class="account-forget" type="button" :disabled="busy" @click="$emit('forget')">Forget this account</button>
  </section>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ account: { type: Object, required: true }, busy: Boolean, glass: Boolean });
defineEmits(['continue', 'switch', 'forget']);
const firstName = computed(() => props.account.displayName?.split(/\s+/)[0] || props.account.username);
const initials = computed(() => {
  const name = props.account.displayName || props.account.username.split('@')[0].replace(/[._-]/g, ' ');
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
});
</script>

<style scoped>
.remembered-account { box-sizing: border-box; width: 100%; padding: 28px; border-radius: 20px; border: 1px solid #cfdfd8; background: #ffffffed; color: #173f35; text-align: center; box-shadow: 0 12px 40px #08282114; }
.remembered-account--glass { background: #084d3c38; color: #fff; border-color: #ffffff55; backdrop-filter: blur(16px); }
.account-avatar { display: grid; place-items: center; width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 50%; background: linear-gradient(135deg, #f4fcff, #cde9f1); color: #146451; font-weight: 750; font-size: 27px; }
.account-details h3 { margin: 0 0 6px; color: inherit; font-size: 23px; line-height: 1.3; overflow-wrap: anywhere; }
.account-details p { margin: 0; color: inherit; font-size: 15px; overflow-wrap: anywhere; }
.account-details .account-context { margin-top: 12px; font-size: 13px; line-height: 1.6; }
.account-continue { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 56px; margin-top: 28px; padding: 14px 18px; border: 1px solid #d5e5df; border-radius: 12px; background: white; color: #20352e; font-family: inherit; font-weight: 600; font-size: 16px; cursor: pointer; }
.account-continue > span:not(.account-arrow) { flex: 1; overflow-wrap: anywhere; }
.account-google { width: 24px; height: 24px; flex-shrink: 0; }
.account-arrow { font-size: 24px; }
.account-continue:hover { background: #f0faf5; }
.account-divider { display: flex; align-items: center; gap: 16px; margin: 24px 0; font-size: 12px; text-transform: uppercase; opacity: .7; }
.account-divider::before, .account-divider::after { content: ''; flex: 1; border-top: 1px solid currentColor; opacity: .5; }
.account-switch, .account-forget { display: block; margin: 0 auto; padding: 8px; background: transparent; border: 0; color: inherit; font-family: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.account-switch { font-size: 15px; }
.account-forget { font-size: 12px; margin-top: 12px; }
button:focus-visible { outline: 3px solid #deb849; outline-offset: 4px; }
button:disabled { opacity: .6; cursor: wait; }
@media (max-width: 480px) { .remembered-account { padding: 22px 18px; } .account-details h3 { font-size: 21px; } }
</style>
