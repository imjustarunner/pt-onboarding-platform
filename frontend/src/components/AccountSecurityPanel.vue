<template>
  <section class="account-security">
    <h1>Security & sign-in activity</h1>
    <p>Manage two-step verification, remembered devices, and your own sign-in history.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="loading">Loading your account security…</p>
    <template v-if="state">
      <section class="security-card">
        <h2>{{ state.method === 'email' ? 'Email verification' : 'Two-step verification' }}</h2>
        <p v-if="state.ssoAuthenticated">You’re signed in with Google. No additional app verification is required.</p>
        <p v-if="!state.required">We’re rolling out two-step verification for people who sign in without Google SSO to help protect our clients’ information. Setup is optional for now, and we encourage you to get started. We plan to make it mandatory for non-SSO sign-ins over the next few months. Google SSO users do not need additional app verification.</p>
        <p v-if="state.verified">Your current sign-in is verified.</p>
        <p v-else-if="state.required">To protect client privacy, {{ state.enabled ? 'verify your sign-in' : 'set up two-step verification' }} to view full names and open client documents. You can keep using client codes and initials.</p>
        <div v-if="state.method === 'email' && !state.verified">
          <p>We’ll send a six-digit code to your school email, {{ state.maskedEmail || 'the address on your account' }}. No authenticator app is needed.</p>
          <button :disabled="busy" @click="sendEmailCode">{{ emailSent ? 'Send a new code' : 'Email me a code' }}</button>
          <p v-if="emailSent" role="status">Code sent. It expires in 10 minutes. Wait one minute before requesting another.</p>
          <form @submit.prevent="verifyEmailCode">
            <label>Email code<input v-model="emailCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required /></label>
            <button class="btn btn-primary" :disabled="busy">Verify email code</button>
          </form>
          <p class="hint">Verification lasts for this sign-in. If the address is incorrect or you cannot receive the code, contact IT.</p>
        </div>
        <div v-if="state.method !== 'email' || state.canReviewPrivacy">
        <p v-if="state.method === 'email' && state.required">Privacy reviewers also need an authenticator code to approve access requests.</p>
        <p>Use Google Authenticator, Microsoft Authenticator, or another authenticator app. No text message or phone number is needed.</p>
        <form v-if="!authenticatorEnabled && !setup" @submit.prevent="beginSetup">
          <label>Confirm your account password<input v-model="password" type="password" autocomplete="current-password" /></label>
          <p class="hint">If you just signed in with Google, you can leave this blank. Otherwise, sign in with Google again and return within five minutes.</p>
          <button class="btn btn-primary" :disabled="busy">Set up authenticator</button>
        </form>
        <div v-if="setup">
          <p>1. In your authenticator app, add an account and scan this QR code.</p>
          <img v-if="qr" :src="qr" width="220" height="220" alt="Authenticator setup QR code. Keep it private." />
          <details><summary>Enter the setup key manually</summary><code>{{ setup.secret }}</code></details>
          <p>2. Enter the six-digit code from the app to finish.</p>
        </div>
        <form v-if="setup || (authenticatorEnabled && (!state.verified || state.canReviewPrivacy))" @submit.prevent="verify">
          <label>{{ useRecoveryCode ? 'One-use recovery code' : 'Authenticator code' }}<input v-model="code" :inputmode="useRecoveryCode ? 'text' : 'numeric'" autocomplete="one-time-code" :maxlength="useRecoveryCode ? 40 : 6" required /></label>
          <label v-if="!setup" class="check"><input v-model="useRecoveryCode" type="checkbox" @change="code = ''" />Use a recovery code instead</label>
          <label v-if="!useRecoveryCode && state.rememberDays" class="check"><input v-model="remember" type="checkbox" />Remember this personal device for {{ state.rememberDays }} days</label>
          <p v-if="!useRecoveryCode && state.rememberDays" class="hint">Leave this unchecked on a shared school or public computer. Signing out will still end your app session.</p>
          <label v-if="remember && !useRecoveryCode">Device name<input v-model="deviceLabel" maxlength="100" placeholder="My laptop" /></label>
          <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Checking…' : setup ? 'Enable two-step verification' : 'Verify sign-in' }}</button>
        </form>
        <div v-if="recoveryCodes.length" class="recovery" role="status">
          <h3>Save your recovery codes</h3><p>Each code works once if you lose access to your authenticator. These codes are shown only now. Keep them somewhere private, separate from this device.</p>
          <ul><li v-for="item in recoveryCodes" :key="item"><code>{{ item }}</code></li></ul>
          <div class="actions"><button @click="saveRecovery">Download recovery codes</button><button @click="recoveryCodes = []">I have saved these codes</button></div>
        </div>
        <p v-if="authenticatorEnabled && state.verified && !recoveryCodes.length">Keep your authenticator and recovery codes available. If you lose both, contact IT to verify your identity and recover access.</p>
        <details v-if="authenticatorEnabled && !recoveryCodes.length" class="replace-authenticator">
          <summary>Replace a lost or changed authenticator</summary>
          <p>This ends all your sign-ins and forgets remembered devices. After signing in again, you can set up your new authenticator.</p>
          <form @submit.prevent="resetAuthenticator">
            <label>Confirm your account password<input v-model="replacementPassword" type="password" autocomplete="current-password" /></label>
            <p class="hint">A Google sign-in within the last five minutes also satisfies password confirmation.</p>
            <label>{{ replacementRecovery ? 'Unused recovery code' : 'Current authenticator code' }}<input v-model="replacementCode" autocomplete="one-time-code" required maxlength="40" /></label>
            <label class="check"><input v-model="replacementRecovery" type="checkbox" />Use an unused recovery code</label>
            <label class="check"><input v-model="confirmReplacement" type="checkbox" required />End my sessions and replace my authenticator</label>
            <button :disabled="busy || !confirmReplacement">Replace authenticator and sign out</button>
          </form>
        </details>
        </div>
        <button v-if="(!state.required || state.verified) && !recoveryCodes.length" @click="returnToWorkspace">Return to your workspace</button>
      </section>
      <section class="security-card">
        <h2>Remembered devices</h2>
        <p v-if="!state.devices.length">No devices are remembered.</p>
        <ul><li v-for="device in state.devices" :key="device.id"><strong>{{ device.label }}</strong> · expires {{ time(device.expires_at) }}<small>{{ device.user_agent || 'Browser not recorded' }} (reported by the browser)</small><button :disabled="busy" @click="forget(device)">Forget this device</button></li></ul>
      </section>
      <section class="security-card">
        <h2>Your sign-in sessions</h2><p>Times are shown in {{ zone }}. A browser closing or losing its connection may not send a logout; those endings are labeled separately. This history shows the account used, not who was behind the device.</p>
        <button :disabled="sessionsLoading" @click="loadSessions">Refresh sessions</button>
        <p v-if="!sessionsLoading && !sessions.length">No recorded sessions are available yet.</p>
        <article v-for="session in sessions" :key="session.reference" class="session">
          <h3>{{ session.current ? 'This sign-in' : 'Sign-in' }} · {{ time(session.startedAt) }}</h3>
          <p>Last activity: {{ time(session.lastActivityAt) }}<br />{{ session.endedAt ? `Ended: ${time(session.endedAt)} — ${session.endReason}${session.endInferred ? ' (inferred)' : ''}` : session.phase === 'unknown' ? 'No confirmed end recorded' : 'Session has not ended' }}</p>
          <small>{{ session.browser || 'Browser not recorded' }} (browser claim)<br />{{ session.clientIp || 'IP not recorded' }} · {{ session.ipSource === 'verified_google_lb' || session.ipSource === 'direct_peer' ? 'Source address recorded' : 'Source address not verified' }}</small>
          <div class="actions"><button @click="showActivity(session)">View activity</button><button v-if="!session.endedAt && session.phase !== 'unknown'" :disabled="busy" @click="endTarget = session">End this session</button></div>
        </article>
        <div class="actions"><button :disabled="page === 0 || sessionsLoading" @click="page--; loadSessions()">Newer sessions</button><button :disabled="!hasMore || sessionsLoading" @click="page++; loadSessions()">Older sessions</button></div>
      </section>
      <section v-if="endTarget" class="security-card" role="region" aria-label="Confirm ending a session">
        <p>End the sign-in from {{ time(endTarget.startedAt) }}? {{ endTarget.current ? 'You will need to sign in again.' : 'That session will no longer be able to access the app.' }}</p>
        <button :disabled="busy" @click="endSession">Confirm end session</button> <button @click="endTarget = null">Cancel</button>
      </section>
      <section v-if="selected" class="security-card">
        <h2>Activity for {{ time(selected.startedAt) }}</h2>
        <p>Newest first. File data sent by the server does not prove someone saved or read it. A download link issued does not prove the file was retrieved.</p>
        <p v-if="!events.length">No detailed activity is recorded for this session.</p>
        <ol><li v-for="event in events" :key="event.id"><strong>{{ time(event.occurred_at) }}</strong> — {{ label(event.action) }} · {{ label(event.outcome) }}<small>{{ event.method }} {{ event.route }} · {{ event.phase }}<template v-if="event.response_bytes != null"> · {{ event.response_bytes }} response bytes</template></small><small v-if="transferDescription(event.transfer)">{{ transferDescription(event.transfer) }}</small></li></ol>
        <button v-if="eventCursor" :disabled="busy" @click="loadEvents(true)">Earlier activity</button>
      </section>
      <ActivityProtectionPanel />
    </template>
  </section>
</template>

<script setup>
import ActivityProtectionPanel from './ActivityProtectionPanel.vue';
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import QRCode from 'qrcode';
import api from '../services/api';
import { evidenceLabel, transferDescription } from '../utils/evidenceTransfer';
const state = ref(null), loading = ref(false), busy = ref(false), error = ref(''), message = ref('');
const emailCode = ref(''), emailSent = ref(false);
const authenticatorEnabled = computed(() => state.value?.authenticatorEnabled ?? state.value?.enabled);
async function sendEmailCode() { await run(async () => { await api.post('/account-security/email/send', {}, options); emailCode.value = ''; emailSent.value = true; }); }
async function verifyEmailCode() { await run(async () => { await api.post('/account-security/email/verify', { code: emailCode.value }, options); emailCode.value = ''; message.value = 'Your sign-in is verified.'; await load(); window.dispatchEvent(new Event('account-security-changed')); }); }
const password = ref(''), code = ref(''), setup = ref(null), qr = ref(''), recoveryCodes = ref([]), remember = ref(false), deviceLabel = ref(''), useRecoveryCode = ref(false);
const replacementPassword = ref(''), replacementCode = ref(''), replacementRecovery = ref(false), confirmReplacement = ref(false);
const sessions = ref([]), sessionsLoading = ref(false), page = ref(0), hasMore = ref(false), selected = ref(null), events = ref([]), eventCursor = ref(null), endTarget = ref(null);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const time = value => value ? new Date(value).toLocaleString(undefined, { timeZoneName: 'short' }) : 'Not recorded';
const label = evidenceLabel;
const options = { headers: { 'X-Account-Security': '1' } };
async function run(fn) { busy.value = true; error.value = ''; try { await fn(); } catch (e) { error.value = e.response?.data?.error?.message || 'The security change could not be completed. Please try again.'; } finally { busy.value = false; } }
async function load() { loading.value = true; try { state.value = (await api.get('/account-security')).data; } catch (e) { error.value = e.response?.data?.error?.message || 'Account security could not be loaded.'; } finally { loading.value = false; } }
async function beginSetup() { await run(async () => { const data = (await api.post('/account-security/authenticator/begin', { password: password.value }, options)).data; password.value = ''; setup.value = data; qr.value = await QRCode.toDataURL(data.uri, { width: 220, margin: 2 }); }); }
async function verify() { await run(async () => { const data = (await api.post(`/account-security/authenticator/${setup.value ? 'confirm' : 'verify'}`, { code: code.value, useRecoveryCode: useRecoveryCode.value, rememberDevice: remember.value, personalDevice: remember.value, deviceLabel: deviceLabel.value }, options)).data; code.value = ''; setup.value = null; qr.value = ''; recoveryCodes.value = data.recoveryCodes || []; message.value = 'Your sign-in is verified.'; await load(); window.dispatchEvent(new Event('account-security-changed')); }); }
function saveRecovery() { const url = URL.createObjectURL(new Blob([`PlotTwistHQ recovery codes — keep private\nEach code works once.\n\n${recoveryCodes.value.join('\n')}\n`], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'PlotTwistHQ-recovery-codes.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function forget(device) { await run(async () => { await api.delete(`/account-security/devices/${device.id}`, options); await load(); message.value = 'Device forgotten. It will need an authenticator code again.'; }); }
async function loadSessions() { sessionsLoading.value = true; try { const { data } = await api.get('/account-security/sessions', { params: { page: page.value } }); sessions.value = data.items; hasMore.value = data.hasMore; } catch (e) { error.value = e.response?.data?.error?.message || 'Session history could not be loaded.'; } finally { sessionsLoading.value = false; } }
async function showActivity(session) { selected.value = session; events.value = []; eventCursor.value = null; await loadEvents(false); }
async function loadEvents(append) { const reference = selected.value?.reference; if (!reference) return; await run(async () => { const { data } = await api.get(`/account-security/sessions/${reference}/events`, { params: { before: append ? eventCursor.value : undefined } }); if (selected.value?.reference !== reference) return; events.value = append ? [...events.value, ...data.items] : data.items; eventCursor.value = data.nextCursor; }); }
async function endSession() { await run(async () => { const { data } = await api.post(`/account-security/sessions/${endTarget.value.reference}/end`, {}, options); endTarget.value = null; if (data.current) { window.location.reload(); return; } await loadSessions(); message.value = 'That session has ended.'; }); }
const returnToWorkspace = () => window.location.assign('/dashboard');
async function resetAuthenticator() { await run(async () => { await api.post('/account-security/authenticator/reset', { password: replacementPassword.value, code: replacementCode.value, useRecoveryCode: replacementRecovery.value, confirmReset: confirmReplacement.value }, options); replacementPassword.value = ''; replacementCode.value = ''; window.location.reload(); }); }
onMounted(async () => { await load(); await loadSessions(); });
onBeforeUnmount(() => { emailCode.value = ''; password.value = ''; code.value = ''; replacementPassword.value = ''; replacementCode.value = ''; setup.value = null; qr.value = ''; recoveryCodes.value = []; });
</script>

<style scoped>
.account-security { max-width: 1000px; margin: auto; padding: 1rem; color: var(--text-primary); }
.security-card { padding: 1.25rem; margin: 1rem 0; border: 1px solid var(--border, #cbd5e1); border-radius: 10px; background: var(--bg-primary, white); }
h1 { font-size: 1.7rem; } h2 { font-size: 1.2rem; } h3 { font-size: 1rem; }
label { display: flex; flex-direction: column; gap: .4rem; margin: 1rem 0; max-width: 420px; }
input { padding: .65rem; border: 1px solid var(--border, #aaa); border-radius: 6px; font: inherit; min-width: 0; }
.check { flex-direction: row; align-items: flex-start; } .check input { margin-top: .25rem; }
.hint, small { font-size: .88rem; color: var(--text-secondary, #475569); } small { display: block; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: .6rem; margin: .7rem 0; }
button { cursor: pointer; padding: .6rem .8rem; border-radius: 6px; border: 1px solid var(--border, #aaa); font: inherit; background: var(--bg-secondary, #f1f5f9); color: inherit; }
.account-security button.btn-primary { background: #175c43; color: #fff; border-color: #175c43; }
.account-security button.btn-primary:hover:not(:disabled) { background: #104832; color: #fff; }
button:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
button:disabled { opacity: .6; cursor: default; }.error { color: #a52a1d; }.session { border-top: 1px solid var(--border, #ddd); padding: 1rem 0; }
code { overflow-wrap: anywhere; } li { margin: .7rem 0; } img { max-width: 100%; }
.recovery { border: 2px solid var(--primary, #426b9b); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
</style>
