<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @click.self="$emit('close')">
      <aside class="settings-drawer" role="dialog" aria-modal="true" aria-label="Notification type settings">
        <header>
          <strong>Filter &amp; Settings</strong>
          <button type="button" aria-label="Close settings" @click="$emit('close')">×</button>
        </header>
        <div class="drawer-body">
          <NotificationTypeSettingsPanel :focused-type="type" :agency-id="agencyId" @changed="$emit('changed', $event)" />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup>
import NotificationTypeSettingsPanel from './NotificationTypeSettingsPanel.vue';
defineProps({ open: Boolean, type: { type: String, default: null }, agencyId: { type: [Number, String], default: null } });
defineEmits(['close', 'changed']);
</script>

<style scoped>
.drawer-backdrop { position:fixed; inset:0; z-index:3000; background:rgba(15,23,42,.45); display:flex; justify-content:flex-end; }
.settings-drawer { width:min(720px,96vw); height:100%; background:var(--background,#fff); box-shadow:-18px 0 50px rgba(15,23,42,.2); display:flex; flex-direction:column; }
.settings-drawer>header { display:flex; justify-content:space-between; align-items:center; padding:17px 20px; border-bottom:1px solid var(--border); }
.settings-drawer>header button { border:0; background:none; font-size:28px; cursor:pointer; }
.drawer-body { padding:20px; overflow:auto; }
</style>
