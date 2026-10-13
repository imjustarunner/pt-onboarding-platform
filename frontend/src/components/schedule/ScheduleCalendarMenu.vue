<template>
  <details v-if="agencyIds.length" ref="menu" class="schedule-calendar-menu" @toggle="open = $event.target.open">
    <summary>Add my schedule to a personal calendar</summary>
    <div v-if="open" class="schedule-calendar-menu__panel">
      <button type="button" class="schedule-calendar-menu__close" @click="close">Close</button>
      <div v-for="id in agencyIds" :key="id">
        <h3 v-if="agencyIds.length > 1">{{ agencyLabel(id) }}</h3>
        <CalendarSharing :agency-id="id" />
      </div>
    </div>
  </details>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import CalendarSharing from '../CalendarSharing.vue';
import { useAgencyStore } from '../../store/agency';

defineProps({ agencyIds: { type: Array, default: () => [] } });
const agencies = useAgencyStore();
const menu = ref(null);
const open = ref(false);
const agencyLabel = id => (agencies.userAgencies || []).find(a => Number(a.id) === Number(id))?.name || `Organization ${id}`;
function close() {
  if (!menu.value) return;
  menu.value.open = false;
  open.value = false;
  menu.value.querySelector('summary')?.focus();
}
function outside(event) {
  if (open.value && !menu.value?.contains(event.target)) {
    menu.value.open = false;
    open.value = false;
  }
}
function keydown(event) { if (event.key === 'Escape' && open.value) close(); }
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keydown); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keydown); });
</script>

<style scoped>
.schedule-calendar-menu { position: relative; color: inherit; }
summary { padding: 4px 8px; white-space: nowrap; cursor: pointer; font-size: 12px; font-weight: 650; color: #166534; border-radius: 6px; }
summary:hover { background: #ecfdf5; }
.schedule-calendar-menu__panel { position: absolute; z-index: 80; top: calc(100% + 8px); right: 0; width: min(560px, calc(100vw - 48px)); max-height: 65vh; overflow: auto; padding: 18px; box-sizing: border-box; border: 1px solid var(--border, #d6d5ce); border-radius: 12px; background: var(--bg-card, #fff); color: var(--text-primary, #0f172a); box-shadow: 0 12px 32px #0f172a24; white-space: normal; }
.schedule-calendar-menu__close { display: block; margin-left: auto; padding: 5px 10px; border: 1px solid var(--border, #d6d5ce); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
@media (max-width: 1100px) { .schedule-calendar-menu__panel { left: 0; right: auto; } }
@media (max-width: 600px) { .schedule-calendar-menu__panel { position: fixed; top: 15vh; left: 24px; } }
</style>
