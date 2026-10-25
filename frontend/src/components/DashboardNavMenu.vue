<template>
  <span ref="anchor" class="dashboard-nav-menu" @pointerenter="enter" @pointerleave="leave">
    <RouterLink :to="to" custom v-slot="{ href, isActive }">
      <a ref="trigger" :href="href" class="dashboard-nav-trigger" :class="{ 'router-link-active': isActive }" :aria-expanded="open" :aria-controls="menuId"
        data-testid="desktop-dashboard-menu-trigger" @click="click" @keydown.space.prevent="click" @keydown.down.prevent="show(true)">
        My Dashboard <span aria-hidden="true" class="dashboard-nav-caret">▾</span>
      </a>
    </RouterLink>
    <Teleport to="body">
      <nav v-if="open" :id="menuId" ref="panel" class="dashboard-nav-panel" :style="position" aria-label="My Dashboard sections"
        @pointerenter="cancelClose" @pointerleave="leave">
        <template v-if="rows.length">
          <div v-for="row in rows" :key="row.id" class="dashboard-nav-row" :style="{ '--depth': row.depth }">
            <button type="button" class="dashboard-nav-item" :aria-expanded="row.kind === 'nest' ? expanded.has(row.id) : undefined"
              @click="row.kind === 'nest' ? toggle(row) : select(row)">
              <img v-if="row.iconUrl && !failedIcons.has(row.iconUrl)" :src="row.iconUrl" alt="" @error="failedIcons.add(row.iconUrl)" />
              <span v-else class="dashboard-nav-icon" aria-hidden="true">{{ row.children?.length ? '▤' : '▦' }}</span>
              <span class="dashboard-nav-label">{{ row.label }}</span>
              <span v-if="row.badgeCount" class="dashboard-nav-badge">{{ row.badgeCount }}</span>
              <span v-if="row.kind === 'nest'" aria-hidden="true">{{ expanded.has(row.id) ? '▾' : '▸' }}</span>
            </button>
            <button v-if="row.children?.length && row.kind !== 'nest'" type="button" class="dashboard-nav-disclosure"
              :aria-label="`${expanded.has(row.id) ? 'Collapse' : 'Expand'} ${row.label}`" :aria-expanded="expanded.has(row.id)" @click="toggle(row)">{{ expanded.has(row.id) ? '▾' : '▸' }}</button>
          </div>
        </template>
        <button v-else type="button" class="dashboard-nav-item" @click="loadDashboard">Open My Dashboard <span aria-hidden="true">↗</span></button>
      </nav>
    </Teleport>
  </span>
</template>
<script setup>
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
const props = defineProps({ to: { type: [String, Object], required: true }, items: { type: Array, default: () => [] }, contextKey: String });
const emit = defineEmits(['select', 'open-dashboard']);
const route = useRoute();
const router = useRouter();
const menuId = `dashboard-nav-${getCurrentInstance().uid}`;
const anchor = ref(null), trigger = ref(null), panel = ref(null), open = ref(false), position = ref({});
const expanded = ref(new Set()), failedIcons = ref(new Set());
let hoverTimer, closeTimer;
let loadingDashboard = false;
const rows = computed(() => {
  const walk = (items, depth = 0) => items.flatMap(item => [{ ...item, depth }, ...(expanded.value.has(item.id) ? walk(item.children || [], depth + 1) : [])]);
  return walk(props.items.filter(item => !item.nestedUnder));
});
function cancelClose() { clearTimeout(closeTimer); }
function reposition() {
  if (!open.value || !anchor.value) return;
  const r = anchor.value.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) { close(); return; }
  const width = Math.min(340, innerWidth - 24);
  const headerBottom = anchor.value.closest('.navbar')?.getBoundingClientRect().bottom || 0;
  const top = Math.min(Math.max(r.bottom, headerBottom) + 6, innerHeight - 80);
  position.value = { width: `${width}px`, left: `${Math.max(12, Math.min(r.left, innerWidth - width - 12))}px`, top: `${Math.max(12, top)}px`, maxHeight: `${Math.max(60, innerHeight - top - 12)}px` };
}
function show(focus = false) {
  clearTimeout(hoverTimer); cancelClose();
  if (!open.value) expanded.value = new Set(props.items.filter(item => item.nestedUnder).map(item => item.nestedUnder));
  open.value = true; reposition();
  void nextTick(() => { reposition(); if (focus) panel.value?.querySelector('button')?.focus(); });
}
function close(restoreFocus = false) { clearTimeout(hoverTimer); cancelClose(); open.value = false; loadingDashboard = false; if (restoreFocus) trigger.value?.focus(); }
function loadDashboard() { loadingDashboard = true; emit('open-dashboard'); }
function enter(event) { if (event.pointerType === 'touch') return; cancelClose(); clearTimeout(hoverTimer); hoverTimer = setTimeout(() => show(), 500); }
function leave() { clearTimeout(hoverTimer); cancelClose(); closeTimer = setTimeout(() => { if (!panel.value?.contains(document.activeElement)) close(); }, 250); }
function click(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
  event.preventDefault();
  if (open.value && props.items.length) close(); else { show(true); if (!props.items.length) loadDashboard(); }
}
function toggle(row) { const next = new Set(expanded.value); next.has(row.id) ? next.delete(row.id) : next.add(row.id); expanded.value = next; }
function select(row) { close(); emit('select', row); }
function outside(event) { if (!anchor.value?.contains(event.target) && !panel.value?.contains(event.target)) close(); }
function keys(event) {
  if (!open.value) return;
  if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
  if (!panel.value?.contains(event.target) || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...panel.value.querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
function focusOutside(event) { if (open.value && !anchor.value?.contains(event.target) && !panel.value?.contains(event.target)) close(); }
watch(() => props.contextKey, () => close());
watch(() => route.path, () => {
  if (loadingDashboard) { loadingDashboard = false; return; }
  close();
});
watch(() => props.items.length, count => {
  if (count && route.path === router.resolve(props.to).path) void nextTick(() => { loadingDashboard = false; });
});
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keys); document.addEventListener('focusin', focusOutside); window.addEventListener('resize', reposition); document.addEventListener('scroll', reposition, true); });
onBeforeUnmount(() => { close(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); document.removeEventListener('focusin', focusOutside); window.removeEventListener('resize', reposition); document.removeEventListener('scroll', reposition, true); });
</script>
<style scoped>
.dashboard-nav-menu { display:inline-flex; flex-shrink:0; }
.dashboard-nav-trigger { display:inline-flex; align-items:center; gap:5px; color:inherit; font:inherit; font-size:16px; text-decoration:none; white-space:nowrap; padding:6px 12px; border-radius:5px; }
.dashboard-nav-trigger:hover, .dashboard-nav-trigger.router-link-active, .dashboard-nav-trigger[aria-expanded="true"] { background:#ffffff1a; }
.dashboard-nav-caret { font-size:10px; }
.dashboard-nav-panel { position:fixed; z-index:10110; box-sizing:border-box; overflow:auto; overscroll-behavior:contain; padding:8px; border:1px solid var(--border,#cbd5e1); border-radius:12px; background:var(--bg-card,#fff); color:var(--text-primary,#183a37); box-shadow:0 10px 35px #0003; }
.dashboard-nav-row { display:flex; padding-left:calc(var(--depth) * 12px); }
.dashboard-nav-item, .dashboard-nav-disclosure { border:0; background:transparent; color:inherit; font:inherit; font-size:14px; cursor:pointer; border-radius:7px; padding:10px 8px; }
.dashboard-nav-item { display:flex; align-items:center; gap:10px; text-align:left; width:100%; min-width:0; }
.dashboard-nav-item:hover, .dashboard-nav-disclosure:hover { background:var(--bg-alt,#f1f5f9); }
.dashboard-nav-item:focus-visible, .dashboard-nav-disclosure:focus-visible, .dashboard-nav-trigger:focus-visible { outline:2px solid var(--primary,#247252); outline-offset:1px; }
.dashboard-nav-item img, .dashboard-nav-icon { width:24px; height:24px; flex:0 0 24px; object-fit:contain; text-align:center; }
.dashboard-nav-label { flex:1; overflow-wrap:anywhere; }
.dashboard-nav-badge { padding:1px 6px; border-radius:10px; background:var(--bg-alt,#f1f5f9); font-size:11px; }
</style>
