<template>
  <aside v-if="current" class="announcement-toast" role="status" aria-live="polite" aria-atomic="true">
    <div>
      <small v-if="current.delivery_scope === 'auricwell_support'">AuricWell support</small>
      <strong>{{ current.title || 'Office announcement' }}</strong>
      <p>{{ current.message }}</p>
      <small v-if="visible.length > 1">{{ visible.length - 1 }} more announcement{{ visible.length > 2 ? 's' : '' }}</small>
    </div>
    <button type="button" aria-label="Dismiss announcement" @click="dismiss">×</button>
  </aside>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
const props = defineProps({
  loadItems: { type: Function, required: true },
  storageKey: { type: String, required: true },
  recordEvent: { type: Function, default: null }
});
const rows = ref([]);
const dismissed = ref({});
const now = ref(Date.now());
let generation = 0;
let pendingGeneration = null;
let poll;
let expiry;
const fingerprint = (item) => `${item.id}:${item.updated_at || item.starts_at}:${item.ends_at}`;
const storageName = () => `announcement-toasts:${props.storageKey}`;
const visible = computed(() => rows.value.filter((item) =>
  item.display_type === 'toast' && item.publish_status !== 'draft' &&
  new Date(item.starts_at).getTime() <= now.value && new Date(item.ends_at).getTime() > now.value &&
  !dismissed.value[fingerprint(item)]
));
const current = computed(() => visible.value[0] || null);
const event = (item, type) => {
  if (props.recordEvent) Promise.resolve(props.recordEvent(item, type)).catch(() => {});
};
watch(() => current.value && fingerprint(current.value), () => {
  if (current.value) { event(current.value, 'impression'); event(current.value, 'open'); }
});
function dismiss() {
  const item = current.value;
  if (!item) return;
  dismissed.value = { ...dismissed.value, [fingerprint(item)]: new Date(item.ends_at).getTime() };
  try { localStorage.setItem(storageName(), JSON.stringify(dismissed.value)); } catch { /* Session dismissal still works. */ }
  event(item, 'dismiss');
}
async function refresh() {
  const requestGeneration = generation;
  if (pendingGeneration === requestGeneration) return;
  pendingGeneration = requestGeneration;
  try {
    const result = await props.loadItems();
    if (requestGeneration !== generation) return;
    now.value = Date.now();
    rows.value = Array.isArray(result) ? result : [];
  } catch (error) {
    if (requestGeneration === generation && [401, 403].includes(error.status || error.response?.status)) rows.value = [];
    // Previously loaded announcements still expire locally if connectivity drops.
  } finally {
    if (pendingGeneration === requestGeneration) pendingGeneration = null;
  }
}
watch(() => props.storageKey, () => {
  generation++;
  rows.value = [];
  dismissed.value = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storageName()) || '{}');
    dismissed.value = Object.fromEntries(Object.entries(saved).filter(([, until]) => until > Date.now()));
  } catch { /* Storage is optional. */ }
  refresh();
}, { immediate: true });
onMounted(() => {
  poll = setInterval(refresh, 60000);
  expiry = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { generation++; clearInterval(poll); clearInterval(expiry); });
</script>

<style scoped>
.announcement-toast { position: fixed; top: 88px; right: 20px; z-index: 1200; display: flex; align-items: flex-start; gap: 16px; width: min(430px, calc(100vw - 40px)); max-height: calc(100dvh - 120px); overflow: auto; padding: 20px; box-sizing: border-box; border: 1px solid #bdd0c8; border-left: 5px solid #356352; border-radius: 12px; background: #f8fcfa; color: #203b32; box-shadow: 0 8px 30px #102e2526; font: 14px/1.5 system-ui, sans-serif; }
.announcement-toast strong, .announcement-toast small { display: block; }
.announcement-toast p { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.announcement-toast button { flex: 0 0 32px; min-height: 32px; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 24px; line-height: 1; padding: 2px; }
.announcement-toast button:focus-visible { outline: 2px solid #356352; }
</style>
