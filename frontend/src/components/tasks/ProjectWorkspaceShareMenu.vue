<template>
  <div ref="rootEl" class="pw-share">
    <button
      type="button"
      class="pw-share__trigger"
      :class="{ 'pw-share__trigger--open': menuOpen }"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      title="Share, print, or export"
      @click="toggleMenu"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" stroke-width="2" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" stroke-width="2" />
      </svg>
      <span>Share</span>
    </button>

    <div v-if="menuOpen" class="pw-share__menu" role="menu">
      <button type="button" class="pw-share__item" role="menuitem" @click="copyLink">
        <span class="pw-share__icon" aria-hidden="true">🔗</span>
        <span>
          <strong>{{ linkCopied ? 'Link copied!' : 'Copy link' }}</strong>
          <small>Anyone with access can open this project after signing in</small>
        </span>
      </button>
      <div class="pw-share__divider" />
      <button type="button" class="pw-share__item" role="menuitem" @click="onPrintClick">
        <span class="pw-share__icon" aria-hidden="true">🖨</span>
        <span>
          <strong>Print</strong>
          <small>{{ printHint }}</small>
        </span>
      </button>
      <button type="button" class="pw-share__item" role="menuitem" @click="onExport">
        <span class="pw-share__icon" aria-hidden="true">📄</span>
        <span>
          <strong>Export full project</strong>
          <small>Download HTML with overview and every section</small>
        </span>
      </button>
    </div>

  </div>

  <!-- Print scope chooser (overview tab only) -->
  <Teleport to="body">
    <div v-if="printModalOpen" class="pw-print-modal-backdrop" @click.self="printModalOpen = false">
      <div class="pw-print-modal" role="dialog" aria-labelledby="pw-print-title">
        <header class="pw-print-modal__head">
          <h2 id="pw-print-title">What would you like to print?</h2>
          <button type="button" class="pw-print-modal__close" aria-label="Close" @click="printModalOpen = false">✕</button>
        </header>
        <p class="pw-print-modal__sub">Choose a print-friendly layout. Your browser print dialog will open in a new tab.</p>
        <div class="pw-print-modal__options">
          <button type="button" class="pw-print-option" @click="emitPrint('overview')">
            <strong>Overview only</strong>
            <span>KPIs, health, deadlines, and status charts</span>
          </button>
          <button type="button" class="pw-print-option pw-print-option--primary" @click="emitPrint('full')">
            <strong>Full project</strong>
            <span>Overview plus tasks, lists, activity, documents, and whiteboards</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  shareUrl: { type: String, required: true },
  currentTab: { type: String, default: 'overview' }
});

const emit = defineEmits(['print', 'export']);

const rootEl = ref(null);
const menuOpen = ref(false);
const linkCopied = ref(false);
const printModalOpen = ref(false);
let copyTimer = null;

const printHint = computed(() => {
  if (props.currentTab === 'overview') {
    return 'Overview only or the full project';
  }
  const labels = {
    tasks: 'Tasks table',
    lists: 'Attached shared lists',
    documents: 'Documents summary',
    activity: 'Recent activity feed',
    whiteboard: 'Whiteboard list'
  };
  return labels[props.currentTab] || 'Current tab';
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.shareUrl);
    linkCopied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { linkCopied.value = false; }, 2200);
  } catch {
    window.prompt('Copy this link:', props.shareUrl);
  }
  closeMenu();
}

function onPrintClick() {
  closeMenu();
  if (props.currentTab === 'overview') {
    printModalOpen.value = true;
    return;
  }
  emitPrint(props.currentTab);
}

function emitPrint(scope) {
  printModalOpen.value = false;
  emit('print', scope);
}

function onExport() {
  closeMenu();
  emit('export');
}

function onDocClick(ev) {
  if (!menuOpen.value) return;
  if (rootEl.value && !rootEl.value.contains(ev.target)) closeMenu();
}

function onKeydown(ev) {
  if (ev.key === 'Escape') {
    closeMenu();
    printModalOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<style scoped>
.pw-share { position: relative; }

.pw-share__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.pw-share__trigger svg { width: 16px; height: 16px; flex-shrink: 0; }
.pw-share__trigger:hover,
.pw-share__trigger--open { background: rgba(255, 255, 255, 0.24); }

.pw-share__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 280px;
  background: #fff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  padding: 6px;
  z-index: 200;
}
.pw-share__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.pw-share__item:hover { background: #f8fafc; }
.pw-share__item strong { display: block; font-size: 13px; color: #0f172a; }
.pw-share__item small { display: block; margin-top: 2px; font-size: 11px; color: #64748b; line-height: 1.35; }
.pw-share__icon { font-size: 16px; line-height: 1; margin-top: 1px; }
.pw-share__divider { height: 1px; background: #e2e8f0; margin: 4px 8px; }
</style>

<style>
.pw-print-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 10000;
}
.pw-print-modal {
  width: min(480px, 100%);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.25);
  padding: 20px 22px 22px;
}
.pw-print-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.pw-print-modal__head h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #0f172a;
}
.pw-print-modal__close {
  border: 0;
  background: #f1f5f9;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  color: #475569;
  font-size: 14px;
}
.pw-print-modal__sub {
  margin: 8px 0 16px;
  font-size: 13px;
  color: #64748b;
}
.pw-print-modal__options { display: flex; flex-direction: column; gap: 10px; }
.pw-print-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  text-align: left;
}
.pw-print-option strong { font-size: 14px; color: #0f172a; }
.pw-print-option span { font-size: 12px; color: #64748b; line-height: 1.4; }
.pw-print-option:hover { border-color: #86efac; background: #f0fdf4; }
.pw-print-option--primary { border-color: #14532d; background: #f0fdf4; }
.pw-print-option--primary:hover { background: #dcfce7; }
</style>
