<template>
  <section v-if="actions.length" class="profile-quick-actions" aria-label="Quick actions">
    <span class="profile-quick-actions__label">Quick actions</span>
    <div class="profile-quick-actions__items">
      <button v-for="(action, index) in actions" :key="action.id" type="button" :class="{ 'is-primary': index === 0 }" @click="$emit('action', action)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <template v-if="action.icon === 'users'"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M20 21v-2a4 4 0 0 0-3-3.9"/><circle cx="9" cy="7" r="4"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></template>
          <template v-else-if="action.icon === 'edit'"><path d="m16 3 5 5L9 20l-6 1 1-6ZM14 5l5 5"/></template>
          <template v-else-if="action.icon === 'message'"><path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8M8 14h5"/></template>
          <template v-else-if="action.icon === 'file'"><path d="M14 2H5v20h14V7ZM14 2v6h5M8 12h8M8 16h6"/></template>
          <template v-else-if="action.icon === 'calendar'"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3"/></template>
          <template v-else-if="action.icon === 'send'"><path d="m22 2-7 20-4-9L2 9ZM22 2 11 13"/></template>
          <template v-else-if="action.icon === 'chart'"><path d="M4 3v18h17M8 16v-5M13 16V7M18 16v-8"/></template>
          <template v-else><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="9" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></template>
        </svg>
        {{ action.label }}
      </button>
    </div>
  </section>
</template>
<script setup>
defineProps({ actions: { type: Array, default: () => [] } });
defineEmits(['action']);
</script>
<style scoped>
.profile-quick-actions { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--border,#e2e8f0); background:var(--bg-alt,#f8fafc); }
.profile-quick-actions__label { font-size:13px; font-weight:650; color:var(--text-secondary,#64748b); }
.profile-quick-actions__items { display:flex; flex-wrap:wrap; gap:8px; min-width:0; }
.profile-quick-actions button { display:inline-flex; align-items:center; gap:8px; min-height:40px; padding:8px 12px; border:1px solid var(--border,#dbe4ee); border-radius:10px; background:var(--bg,#fff); color:var(--text-primary,#173c62); font:600 14px/1.35 var(--font-body,system-ui); cursor:pointer; text-align:left; }
.profile-quick-actions button.is-primary { border-color:color-mix(in srgb,var(--primary,#2563a0) 35%,var(--border,#dbe4ee)); color:var(--primary,#2563a0); }
.profile-quick-actions button:hover { background:color-mix(in srgb,var(--primary,#2563a0) 7%,white); }
.profile-quick-actions button:focus-visible { outline:2px solid var(--primary,#2563a0); outline-offset:2px; }
.profile-quick-actions svg { width:18px; height:18px; flex-shrink:0; }
@media(max-width:600px) { .profile-quick-actions { padding:12px; } .profile-quick-actions__label { width:100%; } .profile-quick-actions__items { width:100%; } .profile-quick-actions button { flex:1 1 auto; } }
</style>
