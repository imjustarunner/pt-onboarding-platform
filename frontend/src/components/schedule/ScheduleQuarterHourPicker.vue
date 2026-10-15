<template>
  <span ref="anchor" class="schedule-quarter-picker" @mouseenter="scheduleOpen" @mouseleave="scheduleClose"
    @mousedown.stop @pointerdown.stop @click.stop @keydown.stop>
    <button type="button" class="cell-plus-btn" :aria-label="`Choose a start time at ${timeLabel(0)}`"
      :aria-expanded="open" aria-haspopup="dialog" title="Choose a start time"
      @click="show(true)" @keydown.down.prevent="show(true)">+</button>
    <Teleport to="body">
      <div v-if="open" ref="menu" class="schedule-quarter-menu" role="dialog" aria-label="Choose a start time"
        :style="position" @mouseenter="cancelClose" @mouseleave="scheduleClose" @mousedown.stop @pointerdown.stop @click.stop
        @keydown.esc.prevent.stop="close(true)" @focusout="onFocusOut">
        <span class="schedule-quarter-menu__label">Start at</span>
        <button v-for="minute in [0, 15, 30, 45]" :key="minute" type="button" @click="select(minute)">
          {{ timeLabel(minute) }}
        </button>
      </div>
    </Teleport>
  </span>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
const props = defineProps({ hour: { type: Number, required: true } });
const emit = defineEmits(['select']);
const anchor = ref(null);
const menu = ref(null);
const open = ref(false);
const position = ref({});
let openTimer;
let closeTimer;
const timeLabel = minute => new Date(2000, 0, 1, props.hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const cancelClose = () => { clearTimeout(closeTimer); };
const show = async (focus = false) => {
  clearTimeout(openTimer); cancelClose();
  const rect = anchor.value?.getBoundingClientRect();
  if (!rect) return;
  position.value = {
    left: `${Math.max(8, Math.min(rect.right - 132, window.innerWidth - 140))}px`,
    top: `${Math.max(8, Math.min(rect.top, window.innerHeight - 218))}px`
  };
  open.value = true;
  if (focus === true) { await nextTick(); menu.value?.querySelector('button')?.focus(); }
};
const close = (focus = false) => {
  clearTimeout(openTimer); cancelClose(); open.value = false;
  if (focus) anchor.value?.querySelector('button')?.focus();
};
const scheduleOpen = (event) => {
  if (event?.buttons) return;
  cancelClose(); clearTimeout(openTimer);
  openTimer = setTimeout(() => show(), 1000);
};
const scheduleClose = () => { clearTimeout(openTimer); cancelClose(); closeTimer = setTimeout(() => close(), 180); };
const select = minute => { close(); emit('select', minute); };
const onFocusOut = event => { if (!menu.value?.contains(event.relatedTarget) && !anchor.value?.contains(event.relatedTarget)) close(); };
const onOutside = event => { if (!menu.value?.contains(event.target) && !anchor.value?.contains(event.target)) close(); };
const onScroll = event => { if (!(event.target instanceof Node) || !menu.value?.contains(event.target)) close(); };
watch(open, active => {
  const operation = active ? 'addEventListener' : 'removeEventListener';
  document[operation]('pointerdown', onOutside);
  window[operation]('scroll', onScroll, true);
  window[operation]('resize', onScroll);
});
onBeforeUnmount(() => { close(); document.removeEventListener('pointerdown', onOutside); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); });
</script>
<style scoped>
.schedule-quarter-picker { position: absolute; top: 50%; right: 1px; transform: translateY(-50%); width: 32px; height: 36px; display: grid; place-items: center; z-index: 12; }
.cell-plus-btn { width: 24px; height: 24px; border: 0; border-radius: 6px; background: rgba(255,255,255,.8); color: #64748b; font-size: 18px; line-height: 1; cursor: pointer; padding: 0; }
.cell-plus-btn:hover, .cell-plus-btn:focus-visible { color: #4338ca; background: #eef2ff; outline: 1px solid #a5b4fc; }
.schedule-quarter-menu { position: fixed; z-index: 18000; display: grid; gap: 3px; width: 132px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; color: #1e293b; box-shadow: 0 8px 28px rgba(15,23,42,.2); box-sizing: border-box; }
.schedule-quarter-menu__label { font-size: 11px; color: #64748b; padding: 2px 6px; }
.schedule-quarter-menu button { text-align: left; border: 0; border-radius: 5px; padding: 7px 6px; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 13px; }
.schedule-quarter-menu button:hover, .schedule-quarter-menu button:focus-visible { background: #eef2ff; outline: 1px solid #a5b4fc; }
</style>
