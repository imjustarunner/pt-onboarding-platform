<template>
  <section>
    <h3>Agency campaigns and numbers</h3>
    <p>Save pending campaigns now. Keep each agency disabled until Notifyre approves the campaign, assigns both numbers, and the signed webhook test succeeds. Number verification checks ownership; record Notifyre’s campaign approval separately.</p>
    <p>Webhook address: <code>{{ webhookUrl }}</code>. In Notifyre → Developer → Webhooks, select SMS received and SMS sent. Copy the endpoint’s signing secret below.</p>
    <p v-if="settings.notifyre.webhookSecretManaged" class="muted">Webhook signing secret is configured in Google Secret Manager.</p>
    <label v-else>Notifyre webhook signing secret<input v-model="settings.notifyre.webhookSecret" type="password" autocomplete="new-password" :placeholder="settings.notifyre.hasWebhookSecret?'Saved securely — leave blank to keep':'Paste the webhook secret here'" /></label>
    <p>{{ settings.notifyre.webhookVerifiedAt ? 'A signed webhook has been received successfully.' : 'Waiting for a correctly signed webhook.' }}</p>
    <article v-for="(r,index) in settings.clientMessaging.routes" :key="index" class="route-card">
      <div class="section-heading"><h4>{{ r.brand || 'New agency' }}</h4><button type="button" class="outline" @click="settings.clientMessaging.routes.splice(index,1)">Remove</button></div>
      <div class="grid">
        <label>Practice<select v-model="r.practiceId" required><option value="">Choose a practice</option><option v-for="p in practices" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label>Patient-facing agency name<input v-model="r.brand" required maxlength="150" /></label>
        <label>Main notifications and support number<input v-model="r.mainNumber" type="tel" placeholder="+17196577444" /></label>
        <label>Provider conversation number<input v-model="r.providerNumber" type="tel" placeholder="+17193684020" /></label>
        <label>Campaign ID<input v-model="r.campaignId" maxlength="100" /></label>
        <label>Carrier approval<select v-model="r.approval"><option value="draft">Draft</option><option value="submitted">Submitted — awaiting approval</option><option value="approved">Approved by carrier</option><option value="rejected">Needs correction</option></select></label>
        <label>Approval evidence/reference<input v-model="r.approvalReference" maxlength="1000" placeholder="Notifyre approval email or reference" /></label>
        <label>HELP contact<input v-model="r.support" maxlength="254" placeholder="Support email or phone" required /></label>
      </div>
      <p v-if="r.verifiedAt">Numbers verified for {{ r.verifiedProvider }} on {{ new Date(r.verifiedAt).toLocaleString() }}.</p>
      <label class="check"><input v-model="r.enabled" type="checkbox" /><span>Enable this agency after approval and verification</span></label>
      <button type="button" class="outline" :disabled="busy||!r.practiceId" @click="$emit('verify',r.practiceId)">Verify saved agency numbers</button>
    </article>
    <button type="button" class="outline" @click="add">Add agency campaign</button>
    <p class="muted">The two example numbers belong to ITSCO only. Saving here does not port a number or change voice service. Configure other agencies with their own numbers.</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
const props=defineProps({settings:Object,practices:{type:Array,default:()=>[]},busy:Boolean});defineEmits(['verify']);
const webhookUrl=computed(()=>`${window.location.origin}/api/notifyre/webhook`);
const add=()=>props.settings.clientMessaging.routes.push({practiceId:'',brand:'',mainNumber:'',providerNumber:'',campaignId:'',approval:'submitted',approvalReference:'',support:'',enabled:false});
</script>
<style scoped>.route-card{border:1px solid #d5ded8;border-radius:14px;padding:20px;margin:18px 0;background:#f7faf8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.check{display:flex;flex-direction:row;gap:12px;align-items:center;margin:18px 0}.check input{width:22px;height:22px}code{overflow-wrap:anywhere}</style>
