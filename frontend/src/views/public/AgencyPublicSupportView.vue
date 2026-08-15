<template>
  <DigitalFormShell
    class="pas-shell"
    :class="{ 'pas-shell--editing': layout.editing.value }"
    :style="pageStyle"
    :branding="{ logoUrl, colors: { primary: accent } }"
    :program-title-override="agencyName || 'Support & contact'"
    form-title-override="Support & contact"
    form-subtitle="Call, text, or send a message"
    :scenic-sidebar-url="themeUrl"
    cover-mode
    :show-header="false"
    :show-intake-sidebar-security="false"
  >
    <template #sidebar>
      <div class="pas-banner" :class="{ 'pas-banner--editing': layout.editing.value }">
        <div
          v-if="logoUrl"
          class="pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('logo') }"
          :style="layout.blockStyle('logo')"
          @mousedown="layout.onBlockMouseDown('logo', $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('logo', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'logo'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('logo', $event)"
          />
          <img :src="logoUrl" :alt="agencyName" class="pas-banner-logo" />
        </div>
        <div
          v-if="agencyName"
          class="pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('kicker') }"
          :style="layout.blockStyle('kicker')"
          @mousedown="layout.onBlockMouseDown('kicker', $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('kicker', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'kicker'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('kicker', $event)"
          />
          <p class="pas-banner-kicker">{{ agencyName }}</p>
        </div>
        <div
          class="pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('title') }"
          :style="layout.blockStyle('title')"
          @mousedown="layout.onBlockMouseDown('title', $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('title', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'title'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('title', $event)"
          />
          <h1 class="pas-banner-title">Support &amp; contact</h1>
        </div>
        <div
          class="pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('lead') }"
          :style="layout.blockStyle('lead')"
          @mousedown="layout.onBlockMouseDown('lead', $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('lead', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'lead'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('lead', $event)"
          />
          <p class="pas-banner-lead">Call, text, or send a message — our team is here to help with care, billing, portal access, and getting started.</p>
        </div>

        <button
          v-if="shortcuts.loginPath"
          type="button"
          class="pas-nav-btn pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('login') }"
          :style="layout.blockStyle('login')"
          @mousedown="layout.onBlockMouseDown('login', $event)"
          @click="goShortcut(shortcuts.loginPath, $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('login', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'login'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('login', $event)"
          />
          <span class="pas-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
          </span>
          <span class="pas-nav-copy">
            <strong>Login with your account details</strong>
            <small>Use your existing portal login</small>
          </span>
        </button>
        <button
          v-if="shortcuts.joinPath"
          type="button"
          class="pas-nav-btn pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('join') }"
          :style="layout.blockStyle('join')"
          @mousedown="layout.onBlockMouseDown('join', $event)"
          @click="goShortcut(shortcuts.joinPath, $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('join', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'join'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('join', $event)"
          />
          <span class="pas-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
          <span class="pas-nav-copy">
            <strong>Looking for a counselor?</strong>
            <small>Start the public interest form</small>
          </span>
        </button>
        <button
          v-if="shortcuts.careersPath"
          type="button"
          class="pas-nav-btn pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('careers') }"
          :style="layout.blockStyle('careers')"
          @mousedown="layout.onBlockMouseDown('careers', $event)"
          @click="goShortcut(shortcuts.careersPath, $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('careers', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'careers'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('careers', $event)"
          />
          <span class="pas-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </span>
          <span class="pas-nav-copy">
            <strong>Careers</strong>
            <small>Open roles and applications</small>
          </span>
        </button>
        <button
          v-if="shortcuts.bookingPath"
          type="button"
          class="pas-nav-btn pas-block"
          :class="{ 'pas-block--selected': layout.isSelected('booking') }"
          :style="layout.blockStyle('booking')"
          @mousedown="layout.onBlockMouseDown('booking', $event)"
          @click="goShortcut(shortcuts.bookingPath, $event)"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('booking', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'booking'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('booking', $event)"
          />
          <span class="pas-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>
          </span>
          <span class="pas-nav-copy">
            <strong>Book an appointment</strong>
            <small>Choose a time that works</small>
          </span>
        </button>
        <button
          type="button"
          class="pas-nav-btn pas-block"
          :class="{
            'pas-nav-btn--on': selectedTopic === 'billing',
            'pas-block--selected': layout.isSelected('billing')
          }"
          :style="layout.blockStyle('billing')"
          @mousedown="layout.onBlockMouseDown('billing', $event)"
          @click="selectTopic('billing')"
        >
          <div v-if="layout.editing.value" class="pas-block-tools">
            <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('billing', $event)">Move</button>
          </div>
          <div
            v-if="layout.editing.value && layout.selected.value === 'billing'"
            class="ajl-resize ajl-resize--e"
            @mousedown.stop="layout.startResize('billing', $event)"
          />
          <span class="pas-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/></svg>
          </span>
          <span class="pas-nav-copy">
            <strong>Billing questions</strong>
            <small>Insurance, invoices, or payment</small>
          </span>
        </button>
      </div>
    </template>

    <div class="pas-page">
      <div v-if="canEdit" class="pas-editor-bar">
        <span v-if="!layout.editing.value">You’re signed in as {{ editRoleLabel }}. Edit copy, contact, and drag each block independently.</span>
        <span v-else>{{ layout.selectedLabel.value }} — Shift-click to add more, then drag to move the group.</span>
        <button v-if="!layout.editing.value" type="button" class="pas-chip" @click="startEdit">Edit page</button>
        <template v-else>
          <label v-if="layout.sizeControl.value" class="pas-size">
            {{ layout.sizeControl.value.label }}
            <input
              v-model.number="layout.draft.sizes[layout.sizeControl.value.key]"
              type="range"
              :min="layout.sizeControl.value.min"
              :max="layout.sizeControl.value.max"
              :step="layout.sizeControl.value.step"
            />
          </label>
          <label v-if="layout.fontControl.value" class="pas-size">
            {{ layout.fontControl.value.label }}
            <input
              v-model.number="layout.draft.sizes[layout.fontControl.value.key]"
              type="range"
              :min="layout.fontControl.value.min"
              :max="layout.fontControl.value.max"
              :step="layout.fontControl.value.step"
            />
          </label>
          <button type="button" class="pas-chip" @click="layout.resetLayout">Reset layout</button>
          <button type="button" class="pas-chip" :disabled="saving" @click="cancelEdit">Cancel</button>
          <button type="button" class="pas-chip pas-chip--solid" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </template>
      </div>
      <p v-if="editError" class="pas-error pas-edit-msg">{{ editError }}</p>
      <p v-if="editSaved" class="pas-ok pas-edit-msg">Saved. This is the same support phone and email used for the tenant.</p>

      <div
        class="pas-card pas-block"
        :class="{ 'pas-block--selected': layout.isSelected('card') }"
        :style="layout.blockStyle('card')"
        @mousedown="layout.onBlockMouseDown('card', $event)"
      >
        <div v-if="layout.editing.value" class="pas-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="layout.startDrag('card', $event)">Move</button>
        </div>
        <div
          v-if="layout.editing.value && layout.selected.value === 'card'"
          class="ajl-resize ajl-resize--e"
          @mousedown.stop="layout.startResize('card', $event)"
        />
        <header class="pas-card-head">
          <h1>Send a message</h1>
          <p class="pas-tagline">{{ intro }}</p>
        </header>
        <div v-if="layout.editing.value || supportContact.phoneDisplay || supportContact.email" class="pas-contact">
          <h2>Call or text us</h2>
          <template v-if="layout.editing.value">
            <label class="pas-field-label">Page intro<textarea v-model="copyDraft.intro" class="pas-edit-area" rows="3" maxlength="800" /></label>
            <label class="pas-field-label">Support phone<input v-model.trim="copyDraft.phone" type="tel" /></label>
            <label class="pas-field-label">Extension<input v-model.trim="copyDraft.phoneExtension" type="text" maxlength="20" /></label>
            <label class="pas-field-label">Support email<input v-model.trim="copyDraft.email" type="email" /></label>
            <label class="pas-field-label">Hours or extra note<input v-model.trim="copyDraft.hoursNote" type="text" maxlength="240" /></label>
          </template>
          <template v-else>
            <p v-if="supportContact.phoneDisplay" class="pas-contact-phone">
              <a v-if="supportContact.telHref" :href="supportContact.telHref">{{ supportContact.phoneDisplay }}</a>
              <span v-else>{{ supportContact.phoneDisplay }}</span>
            </p>
            <p v-if="supportContact.smsHref && supportContact.telHref">
              Prefer to text? <a :href="supportContact.smsHref">Text this number</a>
            </p>
            <p v-if="supportContact.email">
              Email: <a :href="`mailto:${supportContact.email}`">{{ supportContact.email }}</a>
            </p>
            <p v-if="hoursNote" class="pas-hours">{{ hoursNote }}</p>
            <p class="pas-hours">You can call or text. If you send a message, leave a callback number and tell us if you prefer a text back.</p>
          </template>
        </div>
        <p v-if="loadError" class="pas-error">{{ loadError }}</p>
        <PublicAgencySupportForm
          v-else
          :agency-slug="agencySlug"
          :default-category="selectedTopic"
          :config="config"
          :join-path="shortcuts.joinPath"
          :login-path="shortcuts.loginPath"
          :accent="accent"
        />
      </div>
    </div>
  </DigitalFormShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { DigitalFormShell } from '../../components/digital-form';
import { PUBLIC_SUPPORT_THEME_URL } from '../../utils/joinLandingTemplate.js';
import { usePublicSupportLayoutEditor } from '../../composables/usePublicSupportLayoutEditor.js';
import PublicAgencySupportForm from '../../components/public/PublicAgencySupportForm.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const layout = usePublicSupportLayoutEditor();
const agencySlug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);
const config = ref(null);
const loadError = ref('');
const saving = ref(false);
const editError = ref('');
const editSaved = ref(false);
const selectedTopic = ref('');
const copyDraft = reactive({
  intro: '',
  hoursNote: '',
  phone: '',
  phoneExtension: '',
  email: ''
});

const agencyName = computed(() => config.value?.agency?.name || '');
const logoUrl = computed(() => config.value?.agency?.logoUrl || '');
const intro = computed(() => config.value?.intro || '');
const hoursNote = computed(() => config.value?.hoursNote || '');
const supportContact = computed(() => config.value?.supportContact || {});
const shortcuts = computed(() => config.value?.shortcuts || {});
const accent = computed(() => config.value?.agency?.colors?.primary || '#1b3d2f');
const themeUrl = PUBLIC_SUPPORT_THEME_URL;
const pageStyle = computed(() => ({
  '--pas-accent': accent.value,
  '--pas-ink': config.value?.agency?.colors?.secondary || '#143528'
}));

const editRoleLabel = computed(() => String(authStore.user?.role || '').replace('_', ' '));
const canEdit = computed(() => {
  if (!authStore.isAuthenticated || !config.value?.agency?.id) return false;
  const role = String(authStore.user?.role || '').toLowerCase();
  if (!['admin', 'support', 'super_admin'].includes(role)) return false;
  if (role === 'super_admin') return true;
  const id = Number(config.value.agency.id);
  const lists = [authStore.user?.agencyIds, authStore.user?.agencies];
  try {
    const stored = JSON.parse(localStorage.getItem('userAgencies') || 'null');
    if (stored) lists.push(stored);
  } catch { /* ignore */ }
  return lists.some((list) =>
    Array.isArray(list) && list.some((a) => Number(a?.id ?? a) === id)
  );
});

function topicFromQuery() {
  return String(route.query.topic || route.query.category || '').trim().toLowerCase();
}

function selectTopic(id) {
  if (layout.editing.value) return;
  selectedTopic.value = id;
}

function goShortcut(path, event) {
  if (layout.editing.value) {
    event.preventDefault();
    return;
  }
  router.push(path);
}

function applyConfig(data) {
  config.value = data;
  selectedTopic.value = topicFromQuery() || selectedTopic.value || '';
  layout.hydrate(data?.layout);
}

function startEdit() {
  editError.value = '';
  editSaved.value = false;
  copyDraft.intro = intro.value;
  copyDraft.hoursNote = hoursNote.value;
  copyDraft.phone = supportContact.value.phone || '';
  copyDraft.phoneExtension = supportContact.value.phoneExtension || '';
  copyDraft.email = supportContact.value.email || '';
  layout.startEdit();
}

function cancelEdit() {
  layout.cancelEdit();
}

async function saveEdit() {
  saving.value = true;
  editError.value = '';
  editSaved.value = false;
  try {
    const { data } = await api.patch(
      `/public/agency-support/${encodeURIComponent(agencySlug.value)}/settings`,
      { ...copyDraft, layout: layout.snapshot() }
    );
    applyConfig(data);
    layout.commitSaved(data?.layout);
    editSaved.value = true;
  } catch (e) {
    editError.value = e?.response?.data?.error?.message || 'Unable to save.';
  } finally {
    saving.value = false;
  }
}

watch(() => route.query.topic, () => {
  const next = topicFromQuery();
  if (next) selectedTopic.value = next;
});

onMounted(async () => {
  selectedTopic.value = topicFromQuery();
  try {
    const { data } = await api.get(`/public/agency-support/${encodeURIComponent(agencySlug.value)}`, {
      skipGlobalLoading: true
    });
    applyConfig(data);
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'This support page is not available.';
  }
});
</script>

<style scoped>
.pas-shell :deep(.df-page--scenic-side) {
  background-position: left center;
}
.pas-shell :deep(.df-sidebar) {
  width: min(36vw, 380px);
  min-width: 280px;
  padding: clamp(1.1rem, 2.4vw, 1.8rem) clamp(0.9rem, 1.8vw, 1.35rem);
}
.pas-shell :deep(.df-main-body),
.pas-shell :deep(.df-main-body--cover) {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: clamp(1rem, 3vw, 2rem) clamp(1.1rem, 3.2vw, 2.4rem);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  text-align: left;
}
.pas-banner {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100%;
  gap: 0.7rem;
  color: #123c6d;
}
.pas-banner--editing { gap: 0.85rem; }
.pas-banner-logo {
  width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  background: rgba(255,255,255,0.72);
  padding: 0.2rem;
}
.pas-banner-kicker {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1f6b4a;
}
.pas-banner-title {
  margin: 0;
  line-height: 1.1;
  color: #123c6d;
}
.pas-banner-lead {
  margin: 0;
  line-height: 1.4;
  color: #1e3a4c;
}
.pas-page {
  width: 100%;
  display: grid;
  gap: 0.85rem;
  justify-items: start;
}
.pas-card {
  position: relative;
  background: #fff;
  border-radius: 18px;
  padding: 1.2rem 1.25rem 1.15rem;
  display: grid;
  gap: 0.9rem;
  box-shadow:
    0 4px 6px rgba(15, 23, 42, 0.04),
    0 18px 48px rgba(15, 23, 42, 0.12);
  border-top: 6px solid var(--pas-accent, #1b3d2f);
}
.pas-card-head { display: grid; gap: 0.3rem; }
.pas-card-head h1 {
  margin: 0;
  font-size: 1.45rem;
  color: var(--pas-ink, #143528);
}
.pas-tagline {
  margin: 0;
  color: #475569;
  line-height: 1.45;
  font-size: 0.92rem;
}
.pas-block {
  position: relative;
  box-sizing: border-box;
}
.pas-banner-kicker,
.pas-banner-title,
.pas-banner-lead {
  width: 100%;
}
.pas-block-tools {
  position: absolute;
  top: -0.7rem;
  left: 0.2rem;
  z-index: 3;
}
.ajl-drag {
  border: 0;
  border-radius: 999px;
  background: #143528;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  cursor: grab;
}
.ajl-resize {
  position: absolute;
  top: 20%;
  right: -6px;
  width: 10px;
  height: 60%;
  border-radius: 999px;
  background: #2563eb;
  cursor: ew-resize;
  z-index: 4;
}
.pas-block--selected {
  outline: 2px dashed #2563eb;
  outline-offset: 4px;
}
.pas-nav-btn {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.65rem;
  text-align: left;
  text-decoration: none;
  border: 1px solid rgba(18, 60, 109, 0.16);
  background: rgba(255, 255, 255, 0.78);
  color: #123c6d;
  border-radius: 14px;
  padding: 0.62rem 0.7rem;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(18, 60, 109, 0.08);
  backdrop-filter: blur(8px);
  transition: background 0.15s ease, transform 0.12s ease, box-shadow 0.12s ease;
}
.pas-nav-btn:hover {
  background: rgba(255, 255, 255, 0.96);
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(18, 60, 109, 0.14);
}
.pas-nav-btn--on {
  background: #1b3d2f;
  color: #fff;
  border-color: #1b3d2f;
}
.pas-nav-btn--on:hover {
  background: #143528;
  color: #fff;
}
.pas-nav-icon {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgba(31, 107, 74, 0.12);
  color: #1f6b4a;
}
.pas-nav-btn--on .pas-nav-icon {
  background: rgba(255,255,255,0.16);
  color: #fff;
}
.pas-nav-icon svg { width: 1.05rem; height: 1.05rem; }
.pas-nav-copy { display: grid; gap: 0.05rem; min-width: 0; }
.pas-nav-copy strong { font-size: 0.84rem; line-height: 1.2; }
.pas-nav-copy small { color: #4b6475; font-size: 0.72rem; line-height: 1.25; }
.pas-nav-btn--on .pas-nav-copy small { color: rgba(255,255,255,0.82); }
.pas-editor-bar {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
  background: #143528;
  color: #fff;
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.84rem;
}
.pas-size {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
}
.pas-chip {
  border: 1px solid rgba(255,255,255,0.35);
  background: transparent;
  color: #fff;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.pas-chip--solid { background: #fff; color: #143528; border-color: #fff; }
.pas-hours { margin: 0; color: #334155; line-height: 1.45; }
.pas-contact {
  background: color-mix(in srgb, var(--pas-accent, #1b3d2f) 8%, white);
  border-radius: 12px;
  padding: 0.85rem;
  display: grid;
  gap: 0.35rem;
}
.pas-contact h2 { margin: 0; font-size: 0.95rem; color: var(--pas-ink, #143528); }
.pas-contact a { color: var(--pas-accent, #1b3d2f); font-weight: 700; }
.pas-contact-phone { font-size: 1.15rem; font-weight: 800; }
.pas-field-label { display: grid; gap: 0.25rem; font-size: 0.82rem; font-weight: 700; }
.pas-field-label input,
.pas-edit-area {
  min-height: 2.3rem;
  border: 1px solid #d7e3dc;
  border-radius: 10px;
  padding: 0.4rem 0.65rem;
  font: inherit;
}
.pas-error { color: #b42318; }
.pas-ok { color: #166534; }
.pas-edit-msg { width: 100%; margin: 0 0 0.5rem; }
@media (max-width: 860px) {
  .pas-shell :deep(.df-sidebar) {
    width: 100%;
    min-width: 0;
  }
}
</style>
