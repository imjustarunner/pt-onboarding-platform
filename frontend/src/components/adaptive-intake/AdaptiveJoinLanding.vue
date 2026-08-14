<template>
  <div
    class="ajl"
    :class="[
      `ajl--footer-${activeLayout.footerStyle}`,
      { 'ajl--editing': editing, 'ajl--with-sidebar': showLeftChrome }
    ]"
    :style="themeVars"
  >
    <link rel="stylesheet" :href="JOIN_FONT_HREF" />
    <div class="ajl-bg" :style="bgStyle" aria-hidden="true" />

    <aside v-if="showLeftChrome" class="ajl-sidebar">
      <div class="ajl-brand">
        <img v-if="logoUrl" class="ajl-logo" :src="logoUrl" :alt="agencyName" />
        <div v-else class="ajl-logo-fallback">{{ agencyInitial }}</div>
        <p class="ajl-tagline">
          <input v-if="editing" v-model="draft.sidebarTagline" class="ajl-inline" />
          <span v-else>{{ copy.sidebarTagline }}</span>
        </p>
        <p class="ajl-script">
          <input v-if="editing" v-model="draft.sidebarScript" class="ajl-inline ajl-inline--script" />
          <span v-else>{{ copy.sidebarScript }}</span>
        </p>
      </div>

      <ul class="ajl-values">
        <li>
          <span aria-hidden="true">♡</span>
          <input v-if="editing" v-model="draft.value1" class="ajl-inline" />
          <span v-else>{{ copy.value1 }}</span>
        </li>
        <li>
          <span aria-hidden="true">👥</span>
          <input v-if="editing" v-model="draft.value2" class="ajl-inline" />
          <span v-else>{{ copy.value2 }}</span>
        </li>
        <li>
          <span aria-hidden="true">🌿</span>
          <input v-if="editing" v-model="draft.value3" class="ajl-inline" />
          <span v-else>{{ copy.value3 }}</span>
        </li>
      </ul>

      <div class="ajl-help">
        <h2>
          <input v-if="editing" v-model="draft.helpTitle" class="ajl-inline" />
          <span v-else>{{ copy.helpTitle }}</span>
        </h2>
        <p>
          <input v-if="editing" v-model="draft.helpBody" class="ajl-inline" />
          <span v-else>{{ copy.helpBody }}</span>
        </p>
        <a v-if="contactTel" class="ajl-help-line" :href="`tel:${contactTel}`">{{ contactPhone }}</a>
        <a v-if="contactEmail" class="ajl-help-line" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
        <button type="button" class="ajl-help-btn" @click="$emit('contact-support')">
          <input v-if="editing" v-model="draft.sendMessage" class="ajl-inline" @click.stop />
          <span v-else>{{ copy.sendMessage }}</span>
        </button>
      </div>
    </aside>

    <main class="ajl-main">
      <div v-if="canEdit" class="ajl-editbar">
        <template v-if="!editing">
          <button type="button" class="ajl-edit-btn" @click="startEdit">Edit this page</button>
        </template>
        <template v-else>
          <button type="button" class="ajl-edit-btn ajl-edit-btn--ghost" @click="cancelEdit">Cancel</button>
          <button type="button" class="ajl-edit-btn" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <label class="ajl-edit-field">
            Footer
            <select v-model="draft.layout.footerStyle">
              <option value="hidden">Hidden</option>
              <option value="frost">Frosted white</option>
              <option value="white">Solid white</option>
              <option value="clear">Clear</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label class="ajl-edit-field">
            <input v-model="draft.layout.showSidebar" type="checkbox" />
            Edit left overlay
          </label>
          <label class="ajl-edit-field">
            Welcome font
            <select v-model="draft.layout.fonts.welcome">
              <option v-for="f in JOIN_FONT_OPTIONS" :key="`w-${f.id}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
          <label class="ajl-edit-field">
            Body font
            <select v-model="draft.layout.fonts.body">
              <option v-for="f in JOIN_FONT_OPTIONS" :key="`b-${f.id}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
          <label class="ajl-edit-field">
            Card title font
            <select v-model="draft.layout.fonts.cardTitle">
              <option v-for="f in JOIN_FONT_OPTIONS" :key="`c-${f.id}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
          <label v-if="selectedBlock" class="ajl-edit-field">
            {{ selectedBlock }} size
            <input
              v-model.number="draft.layout.sizes[selectedSizeKey]"
              type="range"
              min="0.7"
              :max="selectedBlock === 'welcome' ? 7 : selectedBlock === 'cards' ? 1.4 : 2.4"
              step="0.05"
            />
          </label>
        </template>
        <span v-if="saveError" class="ajl-edit-error">{{ saveError }}</span>
      </div>

      <div
        class="ajl-block"
        :class="{ 'ajl-block--selected': selectedBlock === 'welcome' }"
        :style="blockStyle('welcome')"
        @mousedown="selectBlock('welcome', $event)"
      >
        <button v-if="editing" type="button" class="ajl-drag" @mousedown.stop="startDrag('welcome', $event)">Move</button>
        <p class="ajl-welcome">
          <input v-if="editing" v-model="draft.welcomeTitle" class="ajl-inline ajl-inline--welcome" />
          <span v-else>{{ copy.welcomeTitle }}</span>
        </p>
      </div>

      <div
        class="ajl-block"
        :class="{ 'ajl-block--selected': selectedBlock === 'glad' }"
        :style="blockStyle('glad')"
        @mousedown="selectBlock('glad', $event)"
      >
        <button v-if="editing" type="button" class="ajl-drag" @mousedown.stop="startDrag('glad', $event)">Move</button>
        <p class="ajl-glad">
          <input v-if="editing" v-model="draft.welcomeGlad" class="ajl-inline" />
          <span v-else>{{ copy.welcomeGlad }}</span>
        </p>
      </div>

      <div
        class="ajl-block"
        :class="{ 'ajl-block--selected': selectedBlock === 'lead' }"
        :style="blockStyle('lead')"
        @mousedown="selectBlock('lead', $event)"
      >
        <button v-if="editing" type="button" class="ajl-drag" @mousedown.stop="startDrag('lead', $event)">Move</button>
        <p class="ajl-lead">
          <textarea v-if="editing" v-model="draft.welcomeLead" class="ajl-inline ajl-inline--area" rows="3" />
          <span v-else>{{ copy.welcomeLead }}</span>
        </p>
      </div>

      <div
        class="ajl-block ajl-block--cards"
        :class="{ 'ajl-block--selected': selectedBlock === 'cards' }"
        :style="blockStyle('cards')"
        @mousedown="selectBlock('cards', $event)"
      >
        <button v-if="editing" type="button" class="ajl-drag" @mousedown.stop="startDrag('cards', $event)">Move</button>
        <div class="ajl-cards">
          <article class="ajl-card ajl-card--quick">
            <div class="ajl-card-top">
              <span class="ajl-card-icon ajl-card-icon--quick" aria-hidden="true">⚡</span>
              <span class="ajl-card-time">
                <input v-if="editing" v-model="draft.quickDuration" class="ajl-inline" />
                <span v-else>{{ quick.duration }}</span>
              </span>
            </div>
            <h2>
              <input v-if="editing" v-model="draft.quickTitle" class="ajl-inline" />
              <span v-else>{{ quick.title }}</span>
            </h2>
            <p class="ajl-card-tag">
              <input v-if="editing" v-model="draft.quickTagline" class="ajl-inline" />
              <span v-else>{{ quick.tagline }}</span>
            </p>
            <p class="ajl-card-desc">
              <textarea v-if="editing" v-model="draft.quickDescription" class="ajl-inline ajl-inline--area" rows="2" />
              <span v-else>{{ quick.description }}</span>
            </p>
            <ul>
              <li v-for="(b, i) in (editing ? draft.quickBullets : quick.bullets)" :key="`q-${i}`">
                <input v-if="editing" v-model="draft.quickBullets[i]" class="ajl-inline" />
                <span v-else>{{ b }}</span>
              </li>
            </ul>
            <button type="button" class="ajl-cta ajl-cta--quick" @click="$emit('continue', 'quick')">
              <input v-if="editing" v-model="draft.quickCta" class="ajl-inline" @click.stop />
              <span v-else>{{ quick.cta }}</span>
            </button>
            <p class="ajl-card-foot">
              <input v-if="editing" v-model="draft.quickFooter" class="ajl-inline" />
              <span v-else>{{ quick.footer }}</span>
            </p>
          </article>

          <article class="ajl-card ajl-card--full" :class="{ 'ajl-card--disabled': !full.enabled }">
            <div class="ajl-card-top">
              <span class="ajl-card-icon ajl-card-icon--full" aria-hidden="true">📋</span>
              <span class="ajl-card-time">
                <input v-if="editing" v-model="draft.fullDuration" class="ajl-inline" />
                <span v-else>{{ full.duration }}</span>
              </span>
            </div>
            <h2>
              <input v-if="editing" v-model="draft.fullTitle" class="ajl-inline" />
              <span v-else>{{ full.title }}</span>
            </h2>
            <p class="ajl-card-tag">
              <input v-if="editing" v-model="draft.fullTagline" class="ajl-inline" />
              <span v-else>{{ full.tagline }}</span>
            </p>
            <p class="ajl-card-desc">
              <textarea v-if="editing" v-model="draft.fullDescription" class="ajl-inline ajl-inline--area" rows="2" />
              <span v-else>{{ full.description }}</span>
            </p>
            <ul>
              <li v-for="(b, i) in (editing ? draft.fullBullets : full.bullets)" :key="`f-${i}`">
                <input v-if="editing" v-model="draft.fullBullets[i]" class="ajl-inline" />
                <span v-else>{{ b }}</span>
              </li>
            </ul>
            <button
              type="button"
              class="ajl-cta ajl-cta--full"
              :disabled="!full.enabled"
              @click="$emit('continue', 'full')"
            >
              <input v-if="editing" v-model="draft.fullCta" class="ajl-inline" @click.stop />
              <span v-else>{{ full.enabled ? full.cta : (full.disabledReason || 'Not available yet') }}</span>
            </button>
            <p class="ajl-card-foot">
              <input v-if="editing" v-model="draft.fullFooter" class="ajl-inline" />
              <span v-else>{{ full.footer }}</span>
            </p>
          </article>
        </div>
      </div>
    </main>

    <footer v-if="activeLayout.footerStyle !== 'hidden'" class="ajl-footer">
      <span>🛡️ Your Information Is Secure</span>
      <span>🔒 HIPAA Protected</span>
      <span>⏱ Only Takes a Few Minutes</span>
      <span>♡ Real People. Real Support.</span>
      <strong class="ajl-slogan">
        <input v-if="editing" v-model="draft.slogan" class="ajl-inline" />
        <span v-else>{{ copy.slogan }}</span>
      </strong>
    </footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import api from '../../services/api';
import {
  JOIN_FONT_HREF,
  JOIN_FONT_OPTIONS,
  defaultJoinLayout,
  fontFamilyById,
  mergeJoinLayout
} from '../../utils/joinLandingTemplate.js';

const props = defineProps({
  config: { type: Object, default: null },
  agencySlug: { type: String, default: '' },
  serviceType: { type: String, default: '' },
  quick: { type: Object, required: true },
  full: { type: Object, required: true },
  contactPhone: { type: String, default: '' },
  contactTel: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  canEdit: { type: Boolean, default: false }
});

defineEmits(['continue', 'contact-support']);

const editing = ref(false);
const saving = ref(false);
const saveError = ref('');
const selectedBlock = ref('');
const draft = reactive(blankDraft());
let dragState = null;

const copy = computed(() => props.config?.copy || {});
const agencyName = computed(() => props.config?.agency?.name || 'Welcome');
const agencyInitial = computed(() => String(agencyName.value).trim().charAt(0) || '•');
const logoUrl = computed(() =>
  String(props.config?.branding?.logoUrl || props.config?.branding?.logo_url || '').trim()
);
const themeUrl = computed(() =>
  String(props.config?.themeImageUrl || '/assets/intake-themes/greenintakethemecounseling.jpg').trim()
);
const bgStyle = computed(() => ({
  backgroundImage: `url(${themeUrl.value})`
}));

const activeLayout = computed(() =>
  mergeJoinLayout(editing.value ? draft.layout : copy.value.layout)
);

const showLeftChrome = computed(() => !!activeLayout.value.showSidebar);

const selectedSizeKey = computed(() => {
  if (selectedBlock.value === 'welcome') return 'welcome';
  if (selectedBlock.value === 'glad') return 'glad';
  if (selectedBlock.value === 'lead') return 'lead';
  if (selectedBlock.value === 'cards') return 'cards';
  return 'welcome';
});

const themeVars = computed(() => {
  const layout = activeLayout.value;
  return {
    '--ajl-welcome-font': fontFamilyById(layout.fonts.welcome),
    '--ajl-script-font': fontFamilyById(layout.fonts.script || layout.fonts.welcome),
    '--ajl-body-font': fontFamilyById(layout.fonts.body),
    '--ajl-card-title-font': fontFamilyById(layout.fonts.cardTitle),
    '--ajl-welcome-size': `${layout.sizes.welcome}rem`,
    '--ajl-glad-size': `${layout.sizes.glad}rem`,
    '--ajl-lead-size': `${layout.sizes.lead}rem`,
    '--ajl-card-title-size': `${layout.sizes.cardTitle}rem`,
    '--ajl-cards-scale': String(layout.sizes.cards || 1)
  };
});

function blockStyle(key) {
  const pos = activeLayout.value.positions?.[key] || { x: 0, y: 0 };
  return {
    transform: `translate(${Number(pos.x) || 0}px, ${Number(pos.y) || 0}px)`
  };
}

function blankDraft() {
  return {
    welcomeTitle: '',
    welcomeGlad: '',
    welcomeLead: '',
    sidebarScript: '',
    sidebarTagline: '',
    value1: '',
    value2: '',
    value3: '',
    helpTitle: '',
    helpBody: '',
    sendMessage: '',
    slogan: '',
    quickTitle: '',
    quickTagline: '',
    quickDescription: '',
    quickDuration: '',
    quickBullets: ['', '', ''],
    quickCta: '',
    quickFooter: '',
    fullTitle: '',
    fullTagline: '',
    fullDescription: '',
    fullDuration: '',
    fullBullets: ['', '', ''],
    fullCta: '',
    fullFooter: '',
    layout: defaultJoinLayout()
  };
}

function startEdit() {
  const c = copy.value;
  const q = props.quick || {};
  const f = props.full || {};
  Object.assign(draft, {
    welcomeTitle: c.welcomeTitle || '',
    welcomeGlad: c.welcomeGlad || '',
    welcomeLead: c.welcomeLead || c.welcomeSubtitle || '',
    sidebarScript: c.sidebarScript || '',
    sidebarTagline: c.sidebarTagline || '',
    value1: /non-?judgmental/i.test(c.value1 || '') ? 'Supportive & Welcoming' : (c.value1 || ''),
    value2: c.value2 || '',
    value3: c.value3 || '',
    helpTitle: c.helpTitle || '',
    helpBody: c.helpBody || '',
    sendMessage: c.sendMessage || '',
    slogan: c.slogan || '',
    quickTitle: q.title || c.quickTitle || '',
    quickTagline: q.tagline || c.quickTagline || '',
    quickDescription: q.description || c.quickDescription || '',
    quickDuration: String(q.duration || c.quickDuration || '').replace(/^~\s*/, ''),
    quickBullets: [...(q.bullets || c.quickBullets || ['', '', ''])].slice(0, 3),
    quickCta: q.cta || c.quickCta || '',
    quickFooter: q.footer || c.quickFooter || '',
    fullTitle: f.title || c.fullTitle || '',
    fullTagline: f.tagline || c.fullTagline || '',
    fullDescription: f.description || c.fullDescription || '',
    fullDuration: String(f.duration || c.fullDuration || '').replace(/^~\s*/, ''),
    fullBullets: [...(f.bullets || c.fullBullets || ['', '', ''])].slice(0, 3),
    fullCta: f.cta || c.fullCta || '',
    fullFooter: f.footer || c.fullFooter || '',
    layout: mergeJoinLayout(c.layout)
  });
  while (draft.quickBullets.length < 3) draft.quickBullets.push('');
  while (draft.fullBullets.length < 3) draft.fullBullets.push('');
  saveError.value = '';
  selectedBlock.value = 'cards';
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  selectedBlock.value = '';
  saveError.value = '';
}

function selectBlock(key, event) {
  if (!editing.value) return;
  if (event?.target?.closest('input, textarea, select, button.ajl-cta')) return;
  selectedBlock.value = key;
}

function startDrag(key, event) {
  if (!editing.value) return;
  event.preventDefault();
  selectedBlock.value = key;
  const pos = draft.layout.positions[key] || { x: 0, y: 0 };
  dragState = {
    key,
    startX: event.clientX,
    startY: event.clientY,
    origX: Number(pos.x) || 0,
    origY: Number(pos.y) || 0
  };
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', stopDrag);
}

function onDragMove(event) {
  if (!dragState) return;
  draft.layout.positions[dragState.key] = {
    x: dragState.origX + event.clientX - dragState.startX,
    y: dragState.origY + event.clientY - dragState.startY
  };
}

function stopDrag() {
  dragState = null;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', stopDrag);
}

onBeforeUnmount(stopDrag);

function applyDraftToConfig() {
  if (!props.config) return;
  const next = { ...(props.config.copy || {}) };
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'layout') next.layout = mergeJoinLayout(value);
    else if (key === 'quickBullets' || key === 'fullBullets') next[key] = Array.isArray(value) ? [...value] : [];
    else next[key] = value;
  }
  props.config.copy = next;
}

async function saveEdit() {
  applyDraftToConfig();
  editing.value = false;
  selectedBlock.value = '';
  saving.value = true;
  saveError.value = '';
  try {
    const { data } = await api.patch(`/public/adaptive-intake/${props.agencySlug}/landing`, {
      serviceType: props.serviceType || undefined,
      copy: { ...draft, layout: mergeJoinLayout(draft.layout) }
    });
    if (props.config && data?.copy) {
      props.config.copy = { ...props.config.copy, ...data.copy, layout: mergeJoinLayout(data.copy.layout || draft.layout) };
    }
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Could not save.';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.ajl {
  --ajl-teal: #0f3d3a;
  --ajl-green: #1f6b4a;
  --ajl-blue: #1d4ed8;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr auto;
  position: relative;
  color: #10231f;
  font-family: var(--ajl-body-font, 'Source Sans 3', sans-serif);
  overflow: hidden;
}

.ajl-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}

.ajl--with-sidebar {
  grid-template-columns: minmax(240px, 300px) 1fr;
}

.ajl-sidebar,
.ajl-main,
.ajl-footer {
  position: relative;
  z-index: 2;
}

.ajl-sidebar {
  grid-row: 1 / 2;
  background: transparent;
  color: #123c6d;
  padding: 1.5rem 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.ajl-logo {
  width: min(160px, 100%);
  height: auto;
  object-fit: contain;
  filter: none;
}

.ajl-logo-fallback {
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.16);
  font-weight: 700;
}

.ajl-tagline {
  margin: 0.65rem 0 0;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  text-transform: uppercase;
  opacity: 0.85;
}

.ajl-script {
  margin: 0.35rem 0 0;
  font-family: var(--ajl-script-font, 'Great Vibes', cursive);
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  line-height: 1.1;
}

.ajl-values {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
  font-size: 0.92rem;
}

.ajl-values li {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.ajl-help {
  margin-top: auto;
  border: 1px solid rgba(18, 60, 109, 0.2);
  background: rgba(255, 255, 255, 0.72);
  border-radius: 14px;
  padding: 0.9rem;
}

.ajl-help h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.ajl-help p,
.ajl-help-line {
  margin: 0 0 0.35rem;
  color: inherit;
  text-decoration: none;
  display: block;
  font-weight: 600;
}

.ajl-help-btn {
  width: 100%;
  margin-top: 0.4rem;
  border: 0;
  border-radius: 999px;
  padding: 0.65rem 0.85rem;
  background: #3b82f6;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.ajl-main {
  padding: clamp(1.25rem, 3vw, 2.5rem) clamp(1.25rem, 3vw, 2.5rem) 4.5rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: auto;
}

.ajl-block {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.ajl-block--cards {
  width: min(860px, 100%);
  margin-top: 0.35rem;
}

.ajl-block--selected {
  outline: 2px dashed rgba(29, 78, 216, 0.45);
  outline-offset: 6px;
  border-radius: 12px;
}

.ajl-drag {
  position: absolute;
  top: -1.35rem;
  left: 0;
  z-index: 3;
  border: 0;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  background: #111827;
  color: #fff;
  cursor: grab;
}

.ajl-welcome {
  margin: 0;
  font-family: var(--ajl-welcome-font, 'Great Vibes', cursive);
  font-size: var(--ajl-welcome-size, 4.2rem);
  color: #123c6d;
  line-height: 1;
}

.ajl-glad {
  margin: 0.35rem 0 0.75rem;
  font-size: var(--ajl-glad-size, 1.25rem);
  font-weight: 700;
  color: #16324a;
  text-decoration: underline;
  text-decoration-color: #f5c518;
  text-underline-offset: 0.28rem;
}

.ajl-lead {
  max-width: 46rem;
  margin: 0 0 1.6rem;
  color: #243b36;
  line-height: 1.5;
  font-size: var(--ajl-lead-size, 1rem);
}

.ajl-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.1rem;
  width: 100%;
  transform: scale(var(--ajl-cards-scale, 1));
  transform-origin: top left;
}

.ajl-card {
  background: #fff;
  border-radius: 18px;
  padding: 1.25rem 1.25rem 1.45rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
}

.ajl-card h2 {
  margin: 0.35rem 0 0.2rem;
  font-family: var(--ajl-card-title-font, Georgia, serif);
  font-size: var(--ajl-card-title-size, 1.45rem);
}

.ajl-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ajl-card-icon {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
}

.ajl-card-icon--quick { background: #dcfce7; }
.ajl-card-icon--full { background: #dbeafe; }

.ajl-card-time {
  font-size: 0.82rem;
  font-weight: 700;
  color: #4b5563;
}

.ajl-card-tag {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ajl-green);
  font-weight: 700;
}

.ajl-card-desc,
.ajl-card ul,
.ajl-card-foot {
  color: #3f4b48;
  font-size: 0.92rem;
}

.ajl-card ul {
  margin: 0.65rem 0 1rem;
  padding-left: 1.1rem;
}

.ajl-cta {
  width: 100%;
  border: 0;
  border-radius: 12px;
  padding: 0.8rem 1rem;
  font-weight: 800;
  color: #fff;
  cursor: pointer;
}

.ajl-cta--quick { background: var(--ajl-green); }
.ajl-cta--full { background: var(--ajl-blue); }
.ajl-card--disabled { opacity: 0.72; }
.ajl-cta:disabled { cursor: not-allowed; }

.ajl-card-foot {
  margin: 0.85rem 0 0;
  font-size: 0.78rem;
}

.ajl-footer {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem 1.4rem;
  justify-content: center;
  align-items: center;
  padding: 0.85rem 1rem 1rem;
  font-size: 0.78rem;
}

.ajl--footer-frost .ajl-footer {
  background: rgba(255, 255, 255, 0.86);
  color: #3d4f4a;
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255, 255, 255, 0.7);
}

.ajl--footer-white .ajl-footer {
  background: #fff;
  color: #3d4f4a;
  border-top: 1px solid #e5ece8;
}

.ajl--footer-clear .ajl-footer {
  background: transparent;
  color: #1f2d2a;
}

.ajl--footer-dark .ajl-footer {
  background: #0b1220;
  color: #9cb4ae;
}

.ajl-slogan {
  color: #2563eb;
}

.ajl--footer-dark .ajl-slogan {
  color: #93c5fd;
}

.ajl-editbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}

.ajl-edit-field {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #111827;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
}

.ajl-edit-field select,
.ajl-edit-field input[type='range'] {
  max-width: 9.5rem;
}

.ajl-edit-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.4rem 0.8rem;
  background: #111827;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.ajl-edit-btn--ghost {
  background: transparent;
  color: #111827;
  border: 1px solid #111827;
}

.ajl-edit-error { color: #b91c1c; font-size: 0.85rem; }

.ajl-inline {
  width: 100%;
  border: 1px dashed rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  font: inherit;
  border-radius: 8px;
  padding: 0.2rem 0.4rem;
}

.ajl-main .ajl-inline,
.ajl-footer .ajl-inline {
  border-color: #94a3b8;
  background: #fff;
  color: #111827;
}

.ajl-inline--welcome,
.ajl-inline--script {
  font-family: inherit;
}

.ajl-inline--area {
  resize: vertical;
}

@media (max-width: 860px) {
  .ajl {
    grid-template-columns: 1fr;
  }
  .ajl-sidebar {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .ajl-cards {
    grid-template-columns: 1fr;
  }
}
</style>
