<template>
  <div v-if="agencyIds.length" class="schedule-calendar-menu">
    <button type="button" class="btn btn-secondary btn-sm" aria-haspopup="dialog" @click="show">Connect a personal calendar</button>
    <Teleport to="body">
      <dialog ref="dialog" class="schedule-calendar-dialog" aria-labelledby="schedule-calendar-dialog-title" @close="open = false" @click="closeOnBackdrop">
        <div class="schedule-calendar-dialog__heading"><h2 id="schedule-calendar-dialog-title">Connect a personal calendar</h2><button type="button" class="btn btn-secondary btn-sm" @click="close">Close</button></div>
        <p>Subscribe to your AuricWell schedule in your preferred calendar app.</p>
        <template v-if="open">
          <div v-for="id in agencyIds" :key="id">
            <h3 v-if="agencyIds.length > 1">{{ agencyLabel(id) }}</h3>
            <CalendarSharing :agency-id="id" />
          </div>
        </template>
      </dialog>
    </Teleport>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue';
import CalendarSharing from '../CalendarSharing.vue';
import { useAgencyStore } from '../../store/agency';

defineProps({ agencyIds: { type: Array, default: () => [] } });
const agencies = useAgencyStore();
const dialog = ref(null);
const open = ref(false);
const agencyLabel = id => (agencies.userAgencies || []).find(a => Number(a.id) === Number(id))?.name || `Organization ${id}`;
async function show() { open.value = true; await nextTick(); dialog.value?.showModal(); }
function close() { dialog.value?.close(); open.value = false; }
function closeOnBackdrop(event) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
}
</script>

<style scoped>
.schedule-calendar-dialog { position: fixed; inset: 0; margin: auto; width: min(620px, calc(100vw - 32px)); max-height: 80vh; overflow: auto; padding: 24px; box-sizing: border-box; border: 1px solid #dbe5e3; border-radius: 16px; background: var(--bg-card, #fff); color: var(--text-primary, #0f172a); box-shadow: 0 20px 60px #0f172a40; }
.schedule-calendar-dialog::backdrop { background: #0f172a66; }
.schedule-calendar-dialog__heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
h2 { margin: 0; font-size: 20px; }
p { font-size: 14px; line-height: 1.5; color: #475569; }
</style>
