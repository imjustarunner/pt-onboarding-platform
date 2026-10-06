<template>
          <section class="portal-credential-packet" aria-label="Accounts and access">
            <h2>Your accounts and access</h2><p>These details are provided by People Operations. Keep your passwords and PIN private.</p>
            <p v-if="!packet?.systems?.length">Account details are not available yet. Contact People Operations if you are ready to get started.</p>
            <article v-for="system in packet?.systems || []" :key="system.key" class="cred-card">
              <h3>{{ system.label }}</h3>
              <p class="cred-meta"><strong>{{ system.key === 'email' ? 'Work address' : 'Login' }}:</strong> {{ system.username || 'People Operations will provide this.' }}</p>
              <p v-if="system.key === 'grasshopper'" class="cred-meta"><strong>Extension:</strong> {{ system.extension || 'To be provided' }}</p>
              <p v-if="system.key === 'grasshopper'" class="cred-meta"><strong>PIN:</strong> {{ system.pin || 'To be provided' }}</p>
              <p v-if="system.key === 'email' && !system.hasTempPassword" class="cred-muted">Your platform password is set in the onboarding account step. People Operations will confirm any separate SSO access.</p>
              <div v-if="revealedPasswords[system.key]" class="cred-secret">Temporary password: <code>{{ revealedPasswords[system.key] }}</code><p>Save this securely before closing your portal. It can only be revealed once.</p></div>
              <button v-else-if="system.tempPasswordAvailable" class="btn-secondary-sm" @click="emit('reveal', system.key)">Reveal temporary password once</button>
              <p v-else-if="system.tempPasswordConsumed" class="cred-muted">Temporary password already revealed. Contact People Operations if you need a reset.</p>
              <p v-if="system.acknowledged" class="cred-ok">Account details acknowledged.</p>
              <button v-else class="btn-secondary-sm" :disabled="ackingSystem === system.key || !system.username" @click="emit('acknowledge', system.key)">I have saved my account details</button>
            </article>
          </section>

</template>
<script setup>
defineProps({ packet: Object, revealedPasswords: { type: Object, default: () => ({}) }, ackingSystem: String });
const emit = defineEmits(['reveal', 'acknowledge']);
</script>
<style scoped>
.portal-credential-packet{margin:20px 0}.cred-card{background:white;border:1px solid #d5e2dd;border-radius:10px;padding:18px;margin:12px 0}.cred-card h3{margin:0 0 12px}.cred-meta{margin:8px 0}.cred-muted{font-size:13px;color:#536b64}.cred-ok{color:#086553}.cred-secret{padding:12px;background:#fff5dc;border-radius:6px;overflow-wrap:anywhere}.cred-secret code{font-weight:bold}.btn-secondary-sm{font:inherit;background:white;color:#086553;border:1px solid #bdccc6;border-radius:6px;padding:10px;margin:8px 8px 0 0}
</style>
