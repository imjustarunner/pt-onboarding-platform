<template>
  <section class="remembered-account" aria-label="Remembered account">
    <div class="account-heading"><span class="account-eyebrow">WELCOME BACK</span><span class="account-badge">Saved on this browser</span></div>
    <div class="account-identity">
      <div class="account-avatar" aria-hidden="true">{{ initials }}</div>
      <div class="account-details"><h3>{{ account.displayName || account.username }}</h3><p>{{ account.username }}</p></div>
    </div>
    <button class="account-continue" type="button" :disabled="busy" @click="$emit('continue')">
      <span class="account-person" aria-hidden="true">{{ initials }}</span>
      <span>{{ busy ? 'Connecting…' : `Continue as ${account.displayName || account.username}` }}</span><span class="account-arrow" aria-hidden="true">→</span>
    </button>
    <div class="account-actions"><button type="button" :disabled="busy" @click="$emit('switch')">Choose another username</button><button type="button" :disabled="busy" @click="$emit('forget')">Forget this account</button></div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ account: { type: Object, required: true }, busy: Boolean });
defineEmits(['continue', 'switch', 'forget']);
const initials = computed(() => {
  const name = props.account.displayName || props.account.username.split('@')[0].replace(/[._-]/g, ' ');
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
});
</script>

<style scoped>
.remembered-account{box-sizing:border-box;width:100%;padding:24px;border-radius:22px;border:1px solid rgba(255,255,255,.72);background:rgba(255,255,255,.95);box-shadow:0 16px 48px rgba(8,40,33,.18);color:#173f35;text-align:left;backdrop-filter:blur(16px)}.account-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.account-eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em}.account-badge{font-size:10px;color:#4c685f;background:#edf4ef;border-radius:20px;padding:5px 8px}.account-identity{display:flex;align-items:center;gap:14px;margin:24px 0}.account-avatar{display:grid;place-items:center;flex:0 0 56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#d9eee2,#b1d7c6);color:#185b43;font-weight:800;font-size:20px;border:3px solid #fff;box-shadow:0 3px 10px #193f3510}.account-details{min-width:0}.account-details h3{font-size:19px;margin:0 0 5px;color:#173f35;line-height:1.3}.account-details p{margin:0;font-size:13px;color:#47655b;overflow-wrap:anywhere}.account-continue{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:52px;padding:12px 16px;border:1px solid #b7c9c0;border-radius:12px;background:white;color:#243e34;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer}.account-continue svg{width:22px;height:22px;flex-shrink:0}.account-person{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#e5f1e9;font-size:12px;flex-shrink:0}.account-arrow{margin-left:auto;font-size:22px}.account-continue:hover{background:#f2f8f4;border-color:#608977}.account-actions{display:flex;justify-content:space-between;gap:14px;margin-top:18px;flex-wrap:wrap}.account-actions button{border:0;background:transparent;padding:4px 0;color:#35624e;font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}button:focus-visible{outline:3px solid #d7a936;outline-offset:4px}button:disabled{opacity:.6;cursor:wait}@media(max-width:480px){.remembered-account{padding:20px}.account-heading{flex-wrap:wrap;gap:7px}.account-details h3{font-size:17px}}
</style>
