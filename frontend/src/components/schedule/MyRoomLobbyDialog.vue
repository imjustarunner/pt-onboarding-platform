<template>
  <Teleport to="body">
    <div class="room-dialog-backdrop" @click.self="$emit('close')" @keydown.esc.stop="$emit('close')">
      <section ref="dialog" class="room-dialog" role="dialog" aria-modal="true" aria-labelledby="my-room-dialog-title" tabindex="-1">
        <header class="room-dialog-header">
          <h2 id="my-room-dialog-title">My Room · Virtual office</h2>
          <button type="button" class="btn btn-secondary btn-sm" @click="$emit('close')">Close</button>
        </header>
        <div class="room-dialog-content"><MyRoomLobbyPanel /></div>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import MyRoomLobbyPanel from './MyRoomLobbyPanel.vue';
defineEmits(['close']);
const dialog = ref(null);
let previousFocus;
onMounted(() => { previousFocus = document.activeElement; dialog.value?.focus({ preventScroll: true }); });
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>
<style scoped>
.room-dialog-backdrop { position:fixed; inset:0; z-index:5000; display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; background:rgba(17,24,39,.55); backdrop-filter:blur(8px); }
.room-dialog { display:flex; flex-direction:column; width:min(1280px,100%); min-width:0; max-height:calc(100dvh - 32px); overflow:hidden; box-sizing:border-box; background:#fff; color:#213449; border-radius:16px; box-shadow:0 22px 60px #0f172a55; }
.room-dialog-header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-shrink:0; padding:14px 20px; border-bottom:1px solid #e1e8ef; }
.room-dialog-header h2 { margin:0; font:600 18px/1.4 system-ui,sans-serif; }
.room-dialog-content { min-height:0; overflow:auto; overscroll-behavior:contain; }
@media(max-width:720px) { .room-dialog-backdrop { padding:6px; } .room-dialog { max-height:calc(100dvh - 12px); } .room-dialog-header { padding:12px; } }
</style>
