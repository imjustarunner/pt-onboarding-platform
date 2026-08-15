<template>
  <div
    class="ajl"
    :class="[
      `ajl--footer-${activeLayout.footerStyle}`,
      { 'ajl--editing': editing }
    ]"
    :style="themeVars"
  >
    <link rel="stylesheet" :href="JOIN_FONT_HREF" />
    <div class="ajl-bg" :style="bgStyle" aria-hidden="true" />

    <aside class="ajl-rail" :class="{ 'ajl-rail--editing': editing }">
      <div
        class="ajl-block ajl-block--brand"
        :class="{ 'ajl-block--selected': selectedBlock === 'brand' }"
        :style="blockStyle('brand')"
        @mousedown="onBlockMouseDown('brand', $event)"
      >
        <div v-if="editing" class="ajl-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="startDrag('brand', $event)">Move</button>
        </div>
        <div v-if="editing && selectedBlock === 'brand'" class="ajl-resize ajl-resize--e" @mousedown.stop="startResize('brand', 'e', $event)" />
        <div class="ajl-brand">
          <img v-if="logoUrl" class="ajl-logo" :src="logoUrl" :alt="agencyName" :style="logoStyle" />
          <div v-else class="ajl-logo-fallback" :style="logoStyle">{{ agencyInitial }}</div>
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
      </div>

      <div
        class="ajl-block ajl-block--help"
        :class="{ 'ajl-block--selected': selectedBlock === 'help' }"
        :style="blockStyle('help')"
        @mousedown="onBlockMouseDown('help', $event)"
      >
        <div v-if="editing" class="ajl-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="startDrag('help', $event)">Move</button>
        </div>
        <div v-if="editing && selectedBlock === 'help'" class="ajl-resize ajl-resize--e" @mousedown.stop="startResize('help', 'e', $event)" />
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
      </div>
    </aside>

    <main class="ajl-main">
      <div v-if="canEdit" class="ajl-editbar">
        <template v-if="!editing">
          <button type="button" class="ajl-edit-btn" :disabled="holdEditClosed" @click="startEdit">Edit this page</button>
        </template>
        <template v-else>
          <button type="button" class="ajl-edit-btn ajl-edit-btn--ghost" @click="cancelEdit">Cancel</button>
          <button type="button" class="ajl-edit-btn" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="ajl-edit-btn ajl-edit-btn--ghost" @click="resetLayout">Reset layout</button>
          <button type="button" class="ajl-edit-btn ajl-edit-btn--ghost" @click="restoreOriginalCopy">Restore original text</button>
          <span class="ajl-edit-target">{{ selectedBlockLabel }}</span>
          <div v-if="selectedBlock" class="ajl-align-group" role="group" aria-label="Text alignment">
            <button
              v-for="opt in ALIGN_OPTIONS"
              :key="opt.id"
              type="button"
              class="ajl-align-btn"
              :class="{ 'ajl-align-btn--active': blockAlign(selectedBlock) === opt.id }"
              :title="opt.label"
              @click="setBlockAlign(selectedBlock, opt.id)"
            >{{ opt.glyph }}</button>
          </div>
          <label v-if="selectedBlock && selectedSizeKey" class="ajl-edit-field">
            {{ selectedSizeLabel }}
            <input
              v-model.number="draft.layout.sizes[selectedSizeKey]"
              type="range"
              :min="selectedSizeMin"
              :max="selectedSizeMax"
              :step="selectedSizeStep"
            />
          </label>
          <label v-if="selectedBlock === 'brand'" class="ajl-edit-field">
            Logo size
            <input v-model.number="draft.layout.sizes.logoWidth" type="range" min="48" max="360" step="4" />
          </label>
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
          <span class="ajl-edit-hint">Drag any block to move it, pull its blue handles to resize, and use the alignment buttons for left / center / right.</span>
        </template>
        <span v-if="saveError" class="ajl-edit-error">{{ saveError }}</span>
        <span v-if="saveOk" class="ajl-edit-ok">{{ saveOk }}</span>
      </div>

      <div
        v-if="editing || (copy.welcomeTitle && !isHidden('welcome'))"
        class="ajl-block ajl-block--overlay"
        :class="{ 'ajl-block--selected': selectedBlock === 'welcome' }"
        :style="blockStyle('welcome')"
        @mousedown="onBlockMouseDown('welcome', $event)"
      >
        <div v-if="editing" class="ajl-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="startDrag('welcome', $event)">Move</button>
          <button type="button" class="ajl-hide" @mousedown.stop @click.stop="toggleHidden('welcome')">
            {{ isHidden('welcome') ? 'Show' : 'Hide' }}
          </button>
        </div>
        <div v-if="editing && selectedBlock === 'welcome'" class="ajl-resize ajl-resize--se" @mousedown.stop="startResize('welcome', 'se', $event)" />
        <p class="ajl-welcome">
          <input
            v-if="editing"
            v-model="draft.welcomeTitle"
            class="ajl-inline ajl-inline--welcome"
            placeholder="Welcome line (leave blank to hide)"
            @mousedown.stop
          />
          <span v-else>{{ copy.welcomeTitle }}</span>
        </p>
      </div>

      <div
        v-if="editing || (copy.welcomeGlad && !isHidden('glad'))"
        class="ajl-block ajl-block--overlay"
        :class="{ 'ajl-block--selected': selectedBlock === 'glad' }"
        :style="blockStyle('glad')"
        @mousedown="onBlockMouseDown('glad', $event)"
      >
        <div v-if="editing" class="ajl-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="startDrag('glad', $event)">Move</button>
          <button type="button" class="ajl-hide" @mousedown.stop @click.stop="toggleHidden('glad')">
            {{ isHidden('glad') ? 'Show' : 'Hide' }}
          </button>
        </div>
        <div v-if="editing && selectedBlock === 'glad'" class="ajl-resize ajl-resize--se" @mousedown.stop="startResize('glad', 'se', $event)" />
        <p class="ajl-glad">
          <input
            v-if="editing"
            v-model="draft.welcomeGlad"
            class="ajl-inline"
            placeholder="Note under welcome (leave blank to hide)"
            @mousedown.stop
          />
          <span v-else>{{ copy.welcomeGlad }}</span>
        </p>
      </div>

      <div
        v-if="editing || (copy.welcomeLead && !isHidden('lead'))"
        class="ajl-block ajl-block--overlay"
        :class="{ 'ajl-block--selected': selectedBlock === 'lead' }"
        :style="blockStyle('lead')"
        @mousedown="onBlockMouseDown('lead', $event)"
      >
        <div v-if="editing" class="ajl-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="startDrag('lead', $event)">Move</button>
          <button type="button" class="ajl-hide" @mousedown.stop @click.stop="toggleHidden('lead')">
            {{ isHidden('lead') ? 'Show' : 'Hide' }}
          </button>
        </div>
        <div v-if="editing && selectedBlock === 'lead'" class="ajl-resize ajl-resize--se" @mousedown.stop="startResize('lead', 'se', $event)" />
        <p class="ajl-lead">
          <textarea
            v-if="editing"
            v-model="draft.welcomeLead"
            class="ajl-inline ajl-inline--area"
            rows="3"
            placeholder="Intro paragraph (leave blank to hide)"
            @mousedown.stop
          />
          <span v-else>{{ copy.welcomeLead }}</span>
        </p>
      </div>

      <div
        class="ajl-block ajl-block--cards"
        :class="{ 'ajl-block--selected': selectedBlock === 'cards' }"
        :style="blockStyle('cards')"
        @mousedown="onBlockMouseDown('cards', $event)"
      >
        <div v-if="editing" class="ajl-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="startDrag('cards', $event)">Move</button>
        </div>
        <div v-if="editing && selectedBlock === 'cards'" class="ajl-resize ajl-resize--e" @mousedown.stop="startResize('cards', 'e', $event)" />
        <div v-if="editing && selectedBlock === 'cards'" class="ajl-resize ajl-resize--s" @mousedown.stop="startResize('cards', 's', $event)" />
        <div v-if="editing && selectedBlock === 'cards'" class="ajl-resize ajl-resize--se" @mousedown.stop="startResize('cards', 'se', $event)" />
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
      <span>🛡️ {{ footerTrust[0] }}</span>
      <span>🔒 {{ footerTrust[1] }}</span>
      <span>⏱ {{ footerTrust[2] }}</span>
      <span>♡ {{ footerTrust[3] }}</span>
      <strong class="ajl-slogan">
        <input v-if="editing" v-model="draft.slogan" class="ajl-inline" />
        <span v-else>{{ copy.slogan }}</span>
      </strong>
    </footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, toRaw } from 'vue';
import api from '../../services/api';
import {
  JOIN_FONT_HREF,
  JOIN_FONT_OPTIONS,
  alignBlockStyle,
  clampOffsetValue,
  defaultJoinLayout,
  fontFamilyById,
  mergeJoinLayout,
  normalizeAlign,
  restoreJoinWelcomeCopy,
  writeJoinLandingCache
} from '../../utils/joinLandingTemplate.js';

const ALIGN_OPTIONS = [
  { id: 'left', label: 'Align left', glyph: '⭰' },
  { id: 'center', label: 'Center', glyph: '↔' },
  { id: 'right', label: 'Align right', glyph: '⭲' }
];

const BLOCK_LABELS = {
  brand: 'Logo & tagline',
  help: 'Need help card',
  welcome: 'Welcome line',
  glad: 'Note under welcome',
  lead: 'Intro paragraph',
  cards: 'Intake cards'
};

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
const saveOk = ref('');
const holdEditClosed = ref(false);
const selectedBlock = ref('');
const draft = reactive(blankDraft());
let dragState = null;
let resizeState = null;
let saveOkTimer = null;
let holdEditTimer = null;

const copy = computed(() => restoreJoinWelcomeCopy(props.config?.copy || {}, props.config?.agency?.name));
const footerTrust = computed(() => {
  const loc = String(props.config?.locale || props.config?.language || document.documentElement?.lang || 'en').toLowerCase();
  if (loc.startsWith('es')) {
    return [
      'Su información está segura',
      'Protegido por HIPAA',
      'Solo toma unos minutos',
      'Personas reales. Apoyo real.'
    ];
  }
  return [
    'Your Information Is Secure',
    'HIPAA Protected',
    'Only Takes a Few Minutes',
    'Real People. Real Support.'
  ];
});
const agencyName = computed(() => props.config?.agency?.name || 'Welcome');
const agencyInitial = computed(() => String(agencyName.value).trim().charAt(0) || '•');
const logoUrl = computed(() => {
  const branding = props.config?.branding || {};
  const fromApi = String(
    branding.logoUrl
    || branding.agencyLogoUrl
    || branding.organizationLogoUrl
    || props.config?.agency?.logo_url
    || props.config?.agency?.logoUrl
    || ''
  ).trim();
  if (fromApi) return fromApi;
  const slug = String(props.config?.agency?.slug || props.agencySlug || '').toLowerCase();
  if (slug === 'itsco') return '/assets/provider-action/itsco-logo.png';
  return '';
});
const themeUrl = computed(() =>
  String(props.config?.themeImageUrl || '/assets/intake-themes/greenintakethemecounseling.jpg').trim()
);
const bgStyle = computed(() => ({
  backgroundImage: `url(${themeUrl.value})`
}));

const activeLayout = computed(() =>
  mergeJoinLayout(editing.value ? draft.layout : copy.value.layout)
);

const selectedBlockLabel = computed(() =>
  selectedBlock.value ? BLOCK_LABELS[selectedBlock.value] || selectedBlock.value : 'Click a block to edit it'
);

const logoStyle = computed(() => {
  const width = Number(activeLayout.value.sizes?.logoWidth) || 150;
  return { width: `${width}px`, maxWidth: '100%', height: 'auto' };
});

const selectedSizeKey = computed(() => {
  if (selectedBlock.value === 'welcome') return 'welcome';
  if (selectedBlock.value === 'glad') return 'glad';
  if (selectedBlock.value === 'lead') return 'lead';
  if (selectedBlock.value === 'cards') return 'cardsWidth';
  if (selectedBlock.value === 'brand') return 'brandWidth';
  if (selectedBlock.value === 'help') return 'helpWidth';
  return '';
});

const selectedSizeLabel = computed(() => {
  if (selectedBlock.value === 'cards') return 'Cards width';
  if (selectedBlock.value === 'brand' || selectedBlock.value === 'help') return `${selectedBlock.value} width`;
  return `${selectedBlock.value} size`;
});

const selectedSizeMin = computed(() => {
  if (selectedBlock.value === 'cards') return 360;
  if (selectedBlock.value === 'brand' || selectedBlock.value === 'help') return 140;
  return 0.7;
});

const selectedSizeMax = computed(() => {
  if (selectedBlock.value === 'welcome') return 7;
  if (selectedBlock.value === 'cards') return 1200;
  if (selectedBlock.value === 'brand' || selectedBlock.value === 'help') return 300;
  return 2.4;
});

const selectedSizeStep = computed(() => (
  selectedBlock.value === 'cards' || selectedBlock.value === 'brand' || selectedBlock.value === 'help'
    ? 10
    : 0.05
));

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
    '--ajl-card-title-size': `${layout.sizes.cardTitle}rem`
  };
});

function isHidden(key) {
  return activeLayout.value.hidden?.[key] === true;
}

function toggleHidden(key) {
  if (!editing.value) return;
  if (!draft.layout.hidden) draft.layout.hidden = { welcome: false, glad: false, lead: false };
  draft.layout.hidden[key] = !draft.layout.hidden[key];
}

function restoreOriginalCopy() {
  const restored = restoreJoinWelcomeCopy({}, props.config?.agency?.name);
  draft.welcomeTitle = restored.welcomeTitle;
  draft.welcomeGlad = restored.welcomeGlad;
  draft.welcomeLead = restored.welcomeLead;
  if (!draft.layout.hidden) draft.layout.hidden = { welcome: false, glad: false, lead: false };
  draft.layout.hidden.welcome = false;
  draft.layout.hidden.glad = false;
  draft.layout.hidden.lead = false;
}

function resetLayout() {
  draft.layout = defaultJoinLayout();
  restoreOriginalCopy();
}

function blockAlign(key) {
  return normalizeAlign(activeLayout.value.align?.[key], key === 'brand' || key === 'help' ? 'left' : 'left');
}

function setBlockAlign(key, align) {
  if (!editing.value || !key) return;
  if (!draft.layout.align) draft.layout.align = {};
  draft.layout.align[key] = normalizeAlign(align);
}

function blockStyle(key) {
  const pos = activeLayout.value.positions?.[key] || { x: 0, y: 0 };
  const sizes = activeLayout.value.sizes || {};
  const style = {
    transform: `translate(${Number(pos.x) || 0}px, ${Number(pos.y) || 0}px)`,
    ...alignBlockStyle(blockAlign(key))
  };
  if (key === 'cards') {
    style.width = `${Number(sizes.cardsWidth) || 860}px`;
    style.maxWidth = '100%';
    if (Number(sizes.cardsMinHeight) > 0) {
      style.minHeight = `${Number(sizes.cardsMinHeight)}px`;
    }
  }
  if ((key === 'brand' || key === 'help') && Number(sizes[`${key}Width`]) > 0) {
    style.width = `${Number(sizes[`${key}Width`])}px`;
  }
  if (editing.value && (key === 'welcome' || key === 'glad' || key === 'lead')) {
    style.zIndex = selectedBlock.value === key ? 8 : 6;
  }
  return style;
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

function closeEditor() {
  editing.value = false;
  selectedBlock.value = '';
  holdEditClosed.value = true;
  if (holdEditTimer) clearTimeout(holdEditTimer);
  holdEditTimer = setTimeout(() => { holdEditClosed.value = false; }, 500);
}

function startEdit() {
  if (holdEditClosed.value) return;
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
  saveOk.value = '';
  selectedBlock.value = 'cards';
  editing.value = true;
}

function cancelEdit() {
  saveError.value = '';
  closeEditor();
}

function selectBlock(key, event) {
  if (!editing.value) return;
  if (event?.target?.closest('input, textarea, select, button.ajl-cta')) return;
  selectedBlock.value = key;
}

/** Clicking a block selects it; dragging from anywhere except a control moves it. */
function onBlockMouseDown(key, event) {
  if (!editing.value) return;
  if (event?.target?.closest('input, textarea, select, button, .ajl-resize')) {
    selectBlock(key, event);
    return;
  }
  selectedBlock.value = key;
  startDrag(key, event);
}

function startDrag(key, event) {
  if (!editing.value || event.button !== 0) return;
  event.preventDefault();
  selectedBlock.value = key;
  if (!draft.layout.positions[key]) draft.layout.positions[key] = { x: 0, y: 0 };
  const pos = draft.layout.positions[key];
  const el = event.target?.closest('.ajl-block');
  const container = el?.closest('.ajl-main, .ajl-rail');
  dragState = {
    key,
    startX: event.clientX,
    startY: event.clientY,
    origX: Number(pos.x) || 0,
    origY: Number(pos.y) || 0,
    rect: el ? el.getBoundingClientRect() : null,
    bounds: container ? container.getBoundingClientRect() : null
  };
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', stopDrag);
}

function onDragMove(event) {
  if (!dragState) return;
  let x = dragState.origX + event.clientX - dragState.startX;
  let y = dragState.origY + event.clientY - dragState.startY;
  const { rect, bounds } = dragState;
  if (rect && bounds) {
    x = clampOffsetValue({
      value: x,
      base: rect.left - dragState.origX,
      size: rect.width,
      min: bounds.left,
      max: bounds.right
    });
    y = clampOffsetValue({
      value: y,
      base: rect.top - dragState.origY,
      size: rect.height,
      min: bounds.top,
      max: bounds.bottom
    });
  }
  draft.layout.positions[dragState.key] = { x: Math.round(x), y: Math.round(y) };
}

function stopDrag() {
  dragState = null;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', stopDrag);
}

function startResize(key, edge, event) {
  if (!editing.value) return;
  event.preventDefault();
  selectedBlock.value = key;
  const sizes = draft.layout.sizes;
  resizeState = {
    key,
    edge,
    startX: event.clientX,
    startY: event.clientY,
    origW: Number(sizes.cardsWidth) || 860,
    origH: Number(sizes.cardsMinHeight) || 0,
    origBrandW: Number(sizes.brandWidth) || 220,
    origHelpW: Number(sizes.helpWidth) || 220,
    origSize: Number(sizes[key]) || 1
  };
  window.addEventListener('mousemove', onResizeMove);
  window.addEventListener('mouseup', stopResize);
}

function onResizeMove(event) {
  if (!resizeState) return;
  const dx = event.clientX - resizeState.startX;
  const dy = event.clientY - resizeState.startY;
  const { key, edge } = resizeState;
  if (key === 'cards') {
    if (edge.includes('e')) {
      draft.layout.sizes.cardsWidth = Math.round(Math.min(1200, Math.max(360, resizeState.origW + dx)));
    }
    if (edge.includes('s')) {
      draft.layout.sizes.cardsMinHeight = Math.round(Math.min(900, Math.max(0, resizeState.origH + dy)));
    }
    return;
  }
  if (key === 'brand' && edge.includes('e')) {
    draft.layout.sizes.brandWidth = Math.round(Math.min(300, Math.max(140, resizeState.origBrandW + dx)));
    return;
  }
  if (key === 'help' && edge.includes('e')) {
    draft.layout.sizes.helpWidth = Math.round(Math.min(300, Math.max(140, resizeState.origHelpW + dx)));
    return;
  }
  const delta = edge === 'e' ? dx / 80 : dy / 80;
  const max = key === 'welcome' ? 7 : 2.4;
  draft.layout.sizes[key] = Math.round(Math.min(max, Math.max(0.7, resizeState.origSize + delta)) * 100) / 100;
}

function stopResize() {
  resizeState = null;
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', stopResize);
}

onBeforeUnmount(() => {
  stopDrag();
  stopResize();
  if (saveOkTimer) clearTimeout(saveOkTimer);
  if (holdEditTimer) clearTimeout(holdEditTimer);
});

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
  saving.value = true;
  saveError.value = '';
  saveOk.value = '';
  try {
    const serviceType = String(
      props.serviceType || props.config?.activeService?.serviceType || 'default'
    ).trim().toLowerCase();
    const payload = JSON.parse(JSON.stringify({
      ...toRaw(draft),
      layout: mergeJoinLayout(draft.layout)
    }));
    const { data } = await api.patch(`/public/adaptive-intake/${props.agencySlug}/landing`, {
      serviceType,
      copy: payload
    }, { skipGlobalLoading: true });
    applyDraftToConfig();
    if (props.config) {
      writeJoinLandingCache(props.agencySlug, serviceType, props.config);
    }
    if (props.config && data?.copy) {
      props.config.copy = {
        ...props.config.copy,
        ...data.copy,
        layout: mergeJoinLayout(data.copy.layout || draft.layout)
      };
    }
    closeEditor();
    saveOk.value = 'Saved.';
    if (saveOkTimer) clearTimeout(saveOkTimer);
    saveOkTimer = setTimeout(() => { saveOk.value = ''; }, 4000);
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || e?.message || 'Could not save.';
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
  --ajl-rail-width: clamp(230px, 24vw, 320px);
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--ajl-rail-width) minmax(0, 1fr);
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

.ajl-rail,
.ajl-main,
.ajl-footer {
  position: relative;
  z-index: 2;
}

.ajl-rail {
  grid-column: 1;
  grid-row: 1 / 2;
  padding: clamp(1.25rem, 2.5vw, 1.75rem) clamp(1rem, 2vw, 1.5rem) 1.25rem clamp(1.35rem, 2.4vw, 2rem);
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  color: #123c6d;
  max-width: var(--ajl-rail-width);
  overflow: visible;
  z-index: 3;
}

.ajl-rail--editing {
  outline: 1px dashed rgba(29, 78, 216, 0.35);
  outline-offset: -4px;
}

.ajl-block--brand,
.ajl-block--help {
  width: 100%;
}

.ajl-block--help {
  margin-top: auto;
}

.ajl-block--help .ajl-help {
  margin-top: 0;
}

.ajl-logo {
  width: min(150px, 100%);
  height: auto;
  object-fit: contain;
  filter: none;
  display: block;
}

.ajl-logo-fallback {
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(18, 60, 109, 0.1);
  color: #123c6d;
  font-weight: 700;
}

.ajl-tagline {
  margin: 0.55rem 0 0;
  letter-spacing: 0.1em;
  font-size: 0.68rem;
  text-transform: uppercase;
  font-weight: 700;
  color: #1f6b4a;
}

.ajl-script {
  margin: 0.25rem 0 0;
  font-family: var(--ajl-script-font, 'Great Vibes', cursive);
  font-size: clamp(1.65rem, 2.2vw, 2.15rem);
  line-height: 1.05;
  color: #123c6d;
}

.ajl-values {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
  font-size: 0.84rem;
  line-height: 1.35;
}

.ajl-values li {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.ajl-help {
  margin-top: auto;
  border: 1px solid rgba(18, 60, 109, 0.16);
  background: rgba(255, 255, 255, 0.55);
  border-radius: 12px;
  padding: 0.75rem 0.8rem;
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
  grid-column: 2;
  grid-row: 1 / 2;
  min-width: 0;
  padding: clamp(2rem, 6vh, 3.5rem) clamp(1.25rem, 3vw, 2.5rem) 4.5rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: visible;
}

.ajl-block--overlay {
  z-index: 6;
}

.ajl--editing .ajl-block {
  cursor: move;
  outline: 1px dashed rgba(29, 78, 216, 0.28);
  outline-offset: 6px;
  border-radius: 12px;
}

.ajl-block--brand .ajl-block-tools,
.ajl-block--help .ajl-block-tools {
  top: 0.15rem;
  left: 0.15rem;
}

/* Room for the Move / Hide chips that sit above each block while editing. */
.ajl--editing .ajl-block--overlay,
.ajl--editing .ajl-block--cards {
  margin-top: 1.75rem;
}

.ajl--editing .ajl-block--overlay {
  width: min(48rem, 100%);
}

.ajl-block-tools {
  position: absolute;
  top: -1.35rem;
  left: 0;
  display: flex;
  gap: 0.35rem;
  z-index: 7;
}

.ajl-block-tools .ajl-drag {
  position: static;
  top: auto;
  left: auto;
}

.ajl-hide {
  border: 1px solid #fecaca;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  background: #fff;
  color: #7f1d1d;
  cursor: pointer;
}

.ajl-block {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.ajl-block--cards {
  width: min(860px, 100%);
  margin: 0.35rem auto 0;
  box-sizing: border-box;
}

.ajl-block--selected {
  outline: 2px dashed rgba(29, 78, 216, 0.45);
  outline-offset: 6px;
  border-radius: 12px;
}

.ajl-block--brand .ajl-drag,
.ajl-block--help .ajl-drag {
  top: 0.2rem;
  left: 0.2rem;
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

.ajl-resize {
  position: absolute;
  z-index: 4;
  background: #1d4ed8;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
}

.ajl-resize--e {
  top: 50%;
  right: -7px;
  width: 12px;
  height: 28px;
  margin-top: -14px;
  border-radius: 999px;
  cursor: ew-resize;
}

.ajl-resize--s {
  left: 50%;
  bottom: -7px;
  width: 28px;
  height: 12px;
  margin-left: -14px;
  border-radius: 999px;
  cursor: ns-resize;
}

.ajl-resize--se {
  right: -8px;
  bottom: -8px;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  cursor: nwse-resize;
}

.ajl-welcome {
  margin: 0;
  font-family: var(--ajl-welcome-font, 'Great Vibes', cursive);
  font-size: var(--ajl-welcome-size, 4.2rem);
  color: #123c6d;
  line-height: 1;
  text-align: inherit;
}

.ajl-glad {
  margin: 0.35rem 0 0.75rem;
  font-size: var(--ajl-glad-size, 1.25rem);
  font-weight: 700;
  color: #16324a;
  text-align: inherit;
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
  text-align: inherit;
}

.ajl-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.1rem;
  width: 100%;
  min-height: 100%;
  align-items: stretch;
  text-align: left;
}

.ajl-brand,
.ajl-help {
  text-align: left;
}

.ajl-card {
  background: #fff;
  border-radius: 18px;
  padding: 1.25rem 1.25rem 1.45rem;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
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
  margin-top: auto;
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

.ajl-edit-target {
  font-size: 0.72rem;
  font-weight: 800;
  color: #0f172a;
  background: #fde68a;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  white-space: nowrap;
}

.ajl-align-group {
  display: inline-flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 2px;
}

.ajl-align-btn {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
  line-height: 1.2;
}

.ajl-align-btn--active {
  background: #1d4ed8;
  color: #fff;
}

.ajl-editbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.5rem 0.65rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
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
.ajl-edit-ok { color: #166534; font-size: 0.85rem; font-weight: 700; }
.ajl-edit-hint {
  font-size: 0.72rem;
  font-weight: 600;
  color: #1f2937;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
}

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
.ajl-rail .ajl-inline,
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
  resize: both;
  min-width: min(28rem, 100%);
  max-width: 100%;
}

@media (max-width: 1100px) {
  .ajl-cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .ajl:not(.ajl--editing) .ajl-block {
    transform: none !important;
  }
}

@media (max-width: 860px) {
  .ajl {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }
  .ajl-rail {
    grid-column: 1;
    grid-row: 1;
    max-width: none;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.75rem 1rem;
    padding-bottom: 0.5rem;
  }
  .ajl-brand {
    flex: 1 1 160px;
  }
  .ajl-values {
    flex: 1 1 180px;
  }
  .ajl-help {
    flex: 1 1 220px;
    margin-top: 0;
  }
  .ajl-main {
    grid-column: 1;
    grid-row: 2;
  }
  .ajl:not(.ajl--editing) .ajl-cards {
    grid-template-columns: 1fr;
  }
}
</style>
