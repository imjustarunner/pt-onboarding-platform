<template>
  <section class="portal-credential-packet" aria-label="Accounts and access">
    <h2>Your accounts and access</h2><p>These details are provided by People Operations. Keep your passwords and PIN private.</p>
    <p v-if="!employee">You can return to this page throughout onboarding. Once People Operations activates your account, find these details in <strong>My Dashboard → My Account → Accounts &amp; access</strong>.</p>
    <p v-else>Your assigned account details remain available here after onboarding. Contact People Operations for updates or help signing in.</p>
    <p>Your saved logins, extensions, PINs and account passwords remain available here. You can show a saved password again whenever you return. If you change it in another service, use your new password; the saved setup password does not update automatically.</p>
    <p v-if="!packet?.systems?.length">Account details are not available yet. Contact People Operations if you are ready to get started.</p>
    <article v-for="system in packet?.systems || []" :key="system.key" class="cred-card">
      <h3>{{ system.label }}</h3>
      <p class="cred-meta"><strong>{{ system.key === 'email' ? 'Work address' : 'Login' }}:</strong> {{ system.username || 'People Operations will provide this.' }}</p>
      <p v-if="system.key === 'grasshopper'" class="cred-meta"><strong>Extension:</strong> {{ system.extension || 'To be provided' }}</p>
      <p v-if="system.key === 'grasshopper'" class="cred-meta"><strong>PIN:</strong> {{ system.pin || 'To be provided' }}</p>
      <p v-if="system.key === 'email' && !system.hasTempPassword" class="cred-muted">Use the platform sign-in method provided by People Operations. Separate SSO details appear here when assigned.</p>
      <div v-if="revealedPasswords[system.key]" class="cred-secret">Temporary password: <code>{{ revealedPasswords[system.key] }}</code><p>This is the setup password saved by People Operations. You can view it again here while it remains on file.</p></div>
      <button v-else-if="system.tempPasswordAvailable" class="btn-secondary-sm" @click="emit('reveal', system.key)">Show saved password</button>

    </article>
    <template v-if="showAcknowledgement && availableSystems.length">
      <p v-if="allAcknowledged" class="cred-ok" role="status">Your account information acknowledgement is saved. You can still return to view these details.</p>
      <button v-else type="button" class="btn-secondary-sm" :disabled="saving" @click="emit('acknowledge')">{{ saving ? 'Saving…' : 'I have saved my account info' }}</button>
    </template>
  </section>

</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ packet: Object, revealedPasswords: { type: Object, default: () => ({}) }, saving: Boolean, employee: Boolean, showAcknowledgement: { type: Boolean, default: true } });
const availableSystems = computed(() => (props.packet?.systems || []).filter(system => system.username));
const allAcknowledged = computed(() => availableSystems.value.length > 0 && availableSystems.value.every(system => system.acknowledged));
const emit = defineEmits(['reveal', 'acknowledge']);
</script>
<style scoped>
.portal-credential-packet{margin:20px 0}.cred-card{background:white;border:1px solid #d5e2dd;border-radius:10px;padding:18px;margin:12px 0}.cred-card h3{margin:0 0 12px}.cred-meta{margin:8px 0}.cred-muted{font-size:13px;color:#536b64}.cred-ok{color:#086553}.cred-secret{padding:12px;background:#fff5dc;border-radius:6px;overflow-wrap:anywhere}.cred-secret code{font-weight:bold}.btn-secondary-sm{font:inherit;background:white;color:#086553;border:1px solid #bdccc6;border-radius:6px;padding:10px;margin:8px 8px 0 0}
</style>
