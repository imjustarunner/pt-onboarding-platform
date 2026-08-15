<template>
  <div v-if="part === 'rail'" class="intake-start-rail" :class="{ 'intake-start-rail--editing': ctx.editingStartLayout.value }">
    <div class="intake-start-brand">
      <div
        class="intake-start-block intake-start-block--logo"
        :class="{ 'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'logo' }"
        :style="ctx.officeStartBlockStyle('logo')"
        @mousedown="ctx.onOfficeStartBlockMouseDown('logo', $event)"
      >
        <div v-if="ctx.editingStartLayout.value" class="intake-start-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="ctx.startOfficeBlockDrag('logo', $event)">Move</button>
        </div>
        <div
          v-if="ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'logo'"
          class="ajl-resize ajl-resize--e"
          @mousedown.stop="ctx.startOfficeStartResize('logo', $event)"
        />
        <img
          v-if="logoUrl"
          class="intake-start-logo"
          :src="logoUrl"
          :alt="agencyName"
          :style="ctx.officeStartLogoStyle.value"
        />
        <div v-else class="intake-start-logo-fallback" :style="ctx.officeStartLogoStyle.value">{{ agencyInitial }}</div>
      </div>
      <div
        class="intake-start-block intake-start-block--tagline"
        :class="{ 'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'tagline' }"
        :style="ctx.officeStartBlockStyle('tagline')"
        @mousedown="ctx.onOfficeStartBlockMouseDown('tagline', $event)"
      >
        <div v-if="ctx.editingStartLayout.value" class="intake-start-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="ctx.startOfficeBlockDrag('tagline', $event)">Move</button>
        </div>
        <p class="intake-start-tagline">
          <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.sidebarTagline" class="ajl-inline" @mousedown.stop />
          <span v-else>{{ ctx.startCopy.value.sidebarTagline }}</span>
        </p>
      </div>
      <div
        class="intake-start-block intake-start-block--script"
        :class="{ 'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'script' }"
        :style="ctx.officeStartBlockStyle('script')"
        @mousedown="ctx.onOfficeStartBlockMouseDown('script', $event)"
      >
        <div v-if="ctx.editingStartLayout.value" class="intake-start-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="ctx.startOfficeBlockDrag('script', $event)">Move</button>
        </div>
        <p class="intake-start-script">
          <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.sidebarScript" class="ajl-inline ajl-inline--script" @mousedown.stop />
          <span v-else>{{ ctx.startCopy.value.sidebarScript }}</span>
        </p>
      </div>
      <div
        class="intake-start-block intake-start-block--values"
        :class="{ 'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'values' }"
        :style="ctx.officeStartBlockStyle('values')"
        @mousedown="ctx.onOfficeStartBlockMouseDown('values', $event)"
      >
        <div v-if="ctx.editingStartLayout.value" class="intake-start-block-tools">
          <button type="button" class="ajl-drag" @mousedown.stop="ctx.startOfficeBlockDrag('values', $event)">Move</button>
        </div>
        <ul class="intake-start-values">
          <li>
            <span aria-hidden="true">♡</span>
            <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.value1" class="ajl-inline" @mousedown.stop />
            <span v-else>{{ ctx.startCopy.value.value1 }}</span>
          </li>
          <li>
            <span aria-hidden="true">👥</span>
            <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.value2" class="ajl-inline" @mousedown.stop />
            <span v-else>{{ ctx.startCopy.value.value2 }}</span>
          </li>
          <li>
            <span aria-hidden="true">🌿</span>
            <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.value3" class="ajl-inline" @mousedown.stop />
            <span v-else>{{ ctx.startCopy.value.value3 }}</span>
          </li>
        </ul>
      </div>
    </div>
    <div
      class="intake-start-block intake-start-block--help"
      :class="{ 'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'help' }"
      :style="ctx.officeStartBlockStyle('help')"
      @mousedown="ctx.onOfficeStartBlockMouseDown('help', $event)"
    >
      <div v-if="ctx.editingStartLayout.value" class="intake-start-block-tools">
        <button type="button" class="ajl-drag" @mousedown.stop="ctx.startOfficeBlockDrag('help', $event)">Move</button>
      </div>
      <div
        v-if="ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'help'"
        class="ajl-resize ajl-resize--e"
        @mousedown.stop="ctx.startOfficeStartResize('help', $event)"
      />
      <div class="intake-start-help">
        <h2>
          <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.helpTitle" class="ajl-inline" @mousedown.stop />
          <span v-else>{{ ctx.startCopy.value.helpTitle }}</span>
        </h2>
        <p>
          <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.helpBody" class="ajl-inline" @mousedown.stop />
          <span v-else>{{ ctx.startCopy.value.helpBody }}</span>
        </p>
        <a v-if="contactTel" class="intake-start-help-line" :href="`tel:${contactTel}`">{{ contactPhone }}</a>
        <a v-if="contactEmail" class="intake-start-help-line" :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
        <button type="button" class="intake-start-help-btn" @click="$emit('support')">
          <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.sendMessage" class="ajl-inline" @click.stop @mousedown.stop />
          <span v-else>{{ ctx.startCopy.value.sendMessage }}</span>
        </button>
      </div>
    </div>
  </div>

  <div v-else class="step intake-start-page">
    <link rel="stylesheet" :href="ctx.JOIN_FONT_HREF" />
    <div v-if="ctx.canEditOfficeStart.value" class="intake-start-editbar">
      <template v-if="!ctx.editingStartLayout.value">
        <button type="button" class="ajl-edit-btn" @click="ctx.startOfficeStartEdit">Edit this page</button>
      </template>
      <template v-else>
        <button type="button" class="ajl-edit-btn ajl-edit-btn--ghost" @click="ctx.cancelOfficeStartEdit">Cancel</button>
        <button type="button" class="ajl-edit-btn" :disabled="ctx.savingStartLayout.value" @click="ctx.saveOfficeStartLayout">
          {{ ctx.savingStartLayout.value ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="ajl-edit-btn ajl-edit-btn--ghost" @click="ctx.resetOfficeStartLayout">Reset layout</button>
        <button type="button" class="ajl-edit-btn ajl-edit-btn--ghost" @click="ctx.restoreOriginalStartCopy">Restore original text</button>
        <span class="intake-start-edit-target">{{ ctx.selectedStartBlockLabel.value }}</span>
        <div v-if="ctx.selectedStartBlock.value" class="ajl-align-group" role="group" aria-label="Alignment">
          <button
            v-for="opt in ctx.START_ALIGN_OPTIONS"
            :key="opt.id"
            type="button"
            class="ajl-align-btn"
            :class="{ 'ajl-align-btn--active': ctx.officeStartAlign(ctx.selectedStartBlock.value) === opt.id }"
            :title="opt.label"
            @click="ctx.setOfficeStartAlign(ctx.selectedStartBlock.value, opt.id)"
          >{{ opt.glyph }}</button>
        </div>
        <label v-if="ctx.selectedStartSizeKey.value" class="ajl-edit-field">
          {{ ctx.selectedStartSizeLabel.value }}
          <input
            v-model.number="ctx.startLayoutDraft.sizes[ctx.selectedStartSizeKey.value]"
            type="range"
            :min="ctx.selectedStartSizeMin.value"
            :max="ctx.selectedStartSizeMax.value"
            :step="ctx.selectedStartSizeStep.value"
          />
        </label>
        <label v-if="ctx.selectedStartBlock.value === 'card'" class="ajl-edit-field">
          Card width
          <input v-model.number="ctx.startLayoutDraft.width" type="range" min="420" max="1200" step="10" />
        </label>
        <span class="intake-start-edit-hint">Drag to move, including up over this bar and left into the photo. Pull the blue handle to resize. Alignment is left / center / right. Hide keeps the original wording — it does not delete it.</span>
      </template>
      <button
        v-if="canDevFill"
        type="button"
        class="ajl-edit-btn ajl-edit-btn--ghost"
        @click="$emit('dev-fill')"
      >Dev Fill</button>
      <span v-if="ctx.startLayoutError.value" class="intake-start-edit-error">{{ ctx.startLayoutError.value }}</span>
      <span v-if="ctx.startLayoutOk.value" class="intake-start-edit-ok">{{ ctx.startLayoutOk.value }}</span>
    </div>
    <div
      v-if="ctx.editingStartLayout.value || (ctx.startCopy.value.welcomeTitle && !ctx.isStartHidden('welcome'))"
      class="intake-start-welcome-block"
      :class="{
        'intake-start-block--editing': ctx.editingStartLayout.value,
        'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'welcome'
      }"
      :style="ctx.officeStartBlockStyle('welcome')"
      @mousedown="ctx.onOfficeStartBlockMouseDown('welcome', $event)"
    >
      <div v-if="ctx.editingStartLayout.value" class="intake-start-block-tools">
        <button type="button" class="ajl-drag" @mousedown.stop="ctx.startOfficeBlockDrag('welcome', $event)">Move</button>
        <button type="button" class="ajl-hide" @mousedown.stop @click.stop="ctx.toggleStartHidden('welcome')">
          {{ ctx.isStartHidden('welcome') ? 'Show' : 'Hide' }}
        </button>
      </div>
      <p class="intake-start-welcome-title">
        <input
          v-if="ctx.editingStartLayout.value"
          v-model="ctx.startCopyDraft.welcomeTitle"
          class="ajl-inline ajl-inline--welcome"
          placeholder="Welcome line"
          @mousedown.stop
        />
        <span v-else>{{ ctx.startCopy.value.welcomeTitle }}</span>
      </p>
    </div>
    <div
      v-if="ctx.editingStartLayout.value || (ctx.startCopy.value.welcomeGlad && !ctx.isStartHidden('glad'))"
      class="intake-start-glad-block"
      :class="{
        'intake-start-block--editing': ctx.editingStartLayout.value,
        'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'glad'
      }"
      :style="ctx.officeStartBlockStyle('glad')"
      @mousedown="ctx.onOfficeStartBlockMouseDown('glad', $event)"
    >
      <div v-if="ctx.editingStartLayout.value" class="intake-start-block-tools">
        <button type="button" class="ajl-drag" @mousedown.stop="ctx.startOfficeBlockDrag('glad', $event)">Move</button>
        <button type="button" class="ajl-hide" @mousedown.stop @click.stop="ctx.toggleStartHidden('glad')">
          {{ ctx.isStartHidden('glad') ? 'Show' : 'Hide' }}
        </button>
      </div>
      <p class="intake-start-welcome-glad">
        <input
          v-if="ctx.editingStartLayout.value"
          v-model="ctx.startCopyDraft.welcomeGlad"
          class="ajl-inline"
          placeholder="Note under welcome"
          @mousedown.stop
        />
        <span v-else>{{ ctx.startCopy.value.welcomeGlad }}</span>
      </p>
    </div>
    <div
      class="intake-start-card"
      :class="{
        'intake-start-card--editing': ctx.editingStartLayout.value,
        'intake-start-block--selected': ctx.editingStartLayout.value && ctx.selectedStartBlock.value === 'card'
      }"
      :style="ctx.officeStartBlockStyle('card')"
      @mousedown="ctx.onOfficeStartBlockMouseDown('card', $event)"
    >
      <button
        v-if="ctx.editingStartLayout.value"
        type="button"
        class="ajl-drag"
        @mousedown.stop="ctx.startOfficeBlockDrag('card', $event)"
      >Move</button>
      <div
        v-if="ctx.editingStartLayout.value"
        class="ajl-resize ajl-resize--e"
        @mousedown.stop="ctx.startOfficeStartResize('card', $event)"
      />
      <div class="intake-start-heart" aria-hidden="true">♡</div>
      <h1 class="ai-page-title">
        <input v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.startTitle" class="ajl-inline" @mousedown.stop />
        <span v-else>{{ ctx.startCopy.value.startTitle }}</span>
      </h1>
      <p class="ai-page-lead">
        <textarea v-if="ctx.editingStartLayout.value" v-model="ctx.startCopyDraft.startLead" class="ajl-inline ajl-inline--area" rows="2" @mousedown.stop />
        <span v-else>{{ ctx.startCopy.value.startLead }}</span>
      </p>
      <slot />
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue';

defineProps({
  part: { type: String, default: 'page' },
  logoUrl: { type: String, default: '' },
  agencyName: { type: String, default: 'Welcome' },
  agencyInitial: { type: String, default: '•' },
  contactPhone: { type: String, default: '' },
  contactTel: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  canDevFill: { type: Boolean, default: false }
});

defineEmits(['support', 'dev-fill']);

const ctx = inject('officeIntakeStart');
if (!ctx) {
  throw new Error('OfficeIntakeStartPage requires officeIntakeStart provide()');
}
</script>

<style>



.intake-start-page {
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

.intake-start-welcome {
  margin: 0 0 1rem 0.15rem;
}

.intake-start-welcome-block,
.intake-start-glad-block {
  position: relative;
  width: fit-content;
  max-width: min(46rem, 100%);
  margin-bottom: 0.45rem;
  z-index: 3;
}

.intake-start-block {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.intake-start-block--values {
  width: 100%;
}

.intake-start-block--help {
  margin-top: auto;
}

.intake-start-block--editing,
.intake-start-rail--editing .intake-start-block {
  outline: 1px dashed rgba(29, 78, 216, 0.3);
  outline-offset: 6px;
  border-radius: 12px;
  cursor: move;
  z-index: 6;
}

.intake-start-block--selected {
  outline: 2px dashed rgba(29, 78, 216, 0.65);
  z-index: 8;
}

.intake-start-block-tools {
  position: absolute;
  top: -1.4rem;
  left: 0;
  display: flex;
  gap: 0.35rem;
  z-index: 7;
}

/* The rail has no room above its first block, so keep those chips inside. */
.intake-start-block--brand .intake-start-block-tools,
.intake-start-block--help .intake-start-block-tools {
  top: 0.15rem;
  left: 0.15rem;
}

.intake-start-block-tools .ajl-hide,
.intake-start-block-tools .ajl-drag {
  position: static;
  border: 0;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: grab;
}

.intake-start-rail .intake-start-block-tools {
  top: 0.15rem;
  left: 0.15rem;
}

.intake-start-block-tools .ajl-drag {
  background: #1d4ed8;
  color: #fff;
}

.intake-start-block-tools .ajl-hide {
  background: #fff;
  color: #7f1d1d;
  border: 1px solid #fecaca;
}

.intake-start-welcome-title {
  margin: 0;
  font-family: 'Great Vibes', cursive;
  font-size: inherit;
  line-height: 1.05;
  color: #123c6d;
  text-align: inherit;
}

.intake-start-welcome-glad {
  margin: 0.2rem 0 0.75rem;
  font-weight: 700;
  font-size: inherit;
  color: #10231f;
  text-align: inherit;
  text-decoration: underline;
  text-decoration-color: #f5c518;
  text-underline-offset: 0.28rem;
}

.intake-start-rail {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1.1rem;
  color: #123c6d;
}

.intake-start-logo {
  height: auto;
  object-fit: contain;
  display: block;
}

.intake-start-logo-fallback {
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(18, 60, 109, 0.1);
  color: #123c6d;
  font-weight: 700;
}

.intake-start-tagline {
  margin: 0.55rem 0 0;
  letter-spacing: 0.1em;
  font-size: inherit;
  text-transform: uppercase;
  font-weight: 700;
  color: #1f6b4a;
}

.intake-start-script {
  margin: 0.25rem 0 0;
  font-family: 'Great Vibes', cursive;
  font-size: inherit;
  line-height: 1.05;
  color: #123c6d;
}

.intake-start-values {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
  font-size: inherit;
  line-height: 1.35;
}

.intake-start-values li {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.intake-start-help {
  border: 1px solid rgba(18, 60, 109, 0.16);
  background: rgba(255, 255, 255, 0.55);
  border-radius: 12px;
  padding: 0.75rem 0.8rem;
}

.intake-start-help h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.intake-start-help p,
.intake-start-help-line {
  margin: 0 0 0.35rem;
  color: inherit;
  text-decoration: none;
  display: block;
  font-weight: 600;
}

.intake-start-help-btn {
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

.intake-start-page .ajl-inline {
  width: 100%;
  border: 1px dashed #94a3b8;
  background: #fff;
  color: #111827;
  font: inherit;
  border-radius: 8px;
  padding: 0.2rem 0.4rem;
}

.intake-start-rail .ajl-inline {
  width: 100%;
  border: 1px dashed #94a3b8;
  background: #fff;
  color: #111827;
  font: inherit;
  border-radius: 8px;
  padding: 0.2rem 0.4rem;
}

.intake-start-page .ajl-inline--area {
  resize: both;
  min-width: 8rem;
  max-width: 100%;
}


.intake-start-editbar {
  position: fixed;
  top: 12px;
  left: 50%;
  translate: -50% 0;
  z-index: 80;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  width: min(1100px, calc(100vw - 1.5rem));
  margin-bottom: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  pointer-events: none;
}
.intake-start-editbar > * {
  pointer-events: auto;
}

.intake-start-edit-target {
  font-size: 0.72rem;
  font-weight: 800;
  color: #0f172a;
  background: #fde68a;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  white-space: nowrap;
}

.intake-start-page .ajl-align-group {
  display: inline-flex;
  gap: 2px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 2px;
}

.intake-start-page .ajl-align-btn {
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

.intake-start-page .ajl-align-btn--active {
  background: #1d4ed8;
  color: #fff;
}

.intake-start-page .ajl-edit-field {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #111827;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
}

.intake-start-page .ajl-edit-field input[type='range'] {
  max-width: 8.5rem;
}

.intake-start-edit-hint,
.intake-start-edit-ok {
  font-size: 0.8rem;
  color: #123c6d;
}

.intake-start-edit-error {
  font-size: 0.8rem;
  color: #b42318;
}

.intake-start-page .ajl-edit-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  background: #1f6b4a;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.intake-start-page .ajl-edit-btn--ghost {
  background: rgba(255, 255, 255, 0.85);
  color: #123c6d;
  border: 1px solid rgba(18, 60, 109, 0.2);
}

.intake-start-card {
  position: relative;
  z-index: 1;
  background: #fff;
  border: 1px solid var(--df-border, #dce8e2);
  border-radius: 24px;
  padding: clamp(1.35rem, 3vw, 2.15rem);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  width: min(860px, 100%);
  margin: 0 auto;
  text-align: left;
}

.intake-start-card--editing {
  outline: 1px dashed rgba(29, 78, 216, 0.45);
  cursor: move;
}

.intake-start-card .ajl-drag {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 4;
  border: 0;
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  background: #1d4ed8;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: grab;
}

.intake-start-card .ajl-resize {
  position: absolute;
  z-index: 4;
  background: #1d4ed8;
  border: 2px solid #fff;
}

.intake-start-card .ajl-resize--e,
.intake-start-block .ajl-resize--e {
  top: 50%;
  right: -7px;
  width: 12px;
  height: 28px;
  margin-top: -14px;
  border-radius: 999px;
  cursor: ew-resize;
}

.intake-start-block .ajl-resize {
  position: absolute;
  z-index: 7;
  background: #1d4ed8;
  border: 2px solid #fff;
}

.intake-start-heart {
  width: 3rem;
  height: 3rem;
  margin: 0 auto 0.85rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--df-primary, #1b3d2f) 14%, #fff);
  color: var(--df-primary, #1b3d2f);
  font-size: 1.35rem;
}

.intake-start-page .ai-page-title {
  text-align: center;
}

.intake-start-page .ai-page-lead {
  text-align: center;
  max-width: 42rem;
  margin-left: auto;
  margin-right: auto;
}

.intake-start-col-num {
  color: var(--df-primary, #1b3d2f);
  margin-right: 0.2rem;
}

.intake-start-list--checks {
  list-style: none;
  padding-left: 0;
}

.intake-start-list--checks li {
  position: relative;
  padding-left: 1.35rem;
  margin-bottom: 0.4rem;
}

.intake-start-list--checks li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--df-primary, #1b3d2f);
  font-weight: 700;
}

.intake-start-basics-icon {
  margin-right: 0.35rem;
}

.intake-start-continue {
  width: 100%;
  margin-top: 1.35rem;
  min-height: 3rem;
  border-radius: 12px;
  font-weight: 700;
}

.intake-start-support {
  margin: 0.85rem 0 0;
  text-align: center;
  color: var(--df-muted, #64748b);
  font-size: 0.88rem;
}

.intake-start-support-link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--df-primary, #1b3d2f);
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}

.intake-start-page select {
  width: 100%;
  min-height: 2.5rem;
  border-radius: 10px;
  border: 1px solid var(--df-border, #dce8e2);
  padding: 0.45rem 0.7rem;
  background: #fff;
}

.intake-start-page .ai-pathway-card {
  min-height: 5.5rem;
  text-align: left;
  padding: 0.9rem 1rem;
}

.intake-start-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
  margin: 1.25rem 0 1.75rem;
}

.intake-start-col-title,
.intake-start-basics-title {
  margin: 0 0 0.65rem;
  font-size: 1rem;
  color: var(--df-primary, #1b3d2f);
}

.intake-start-page .intake-start-basics-title {
  text-align: center;
  margin-top: 0.35rem;
}

.intake-start-page .intake-identity-grid {
  max-width: 36rem;
  margin-left: auto;
  margin-right: auto;
}

.intake-start-list {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--df-muted, #64748b);
  font-size: 0.92rem;
  line-height: 1.55;
}

.intake-who-stack {
  display: grid;
  gap: 0.65rem;
}

.intake-who-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.intake-who-icon {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  margin-bottom: 0.35rem;
}


@media (max-width: 960px) {
  .intake-start-rail:not(.intake-start-rail--editing) .intake-start-block,
  .intake-start-page:not(:has(.intake-start-block--editing)):not(:has(.intake-start-card--editing)) .intake-start-welcome-block,
  .intake-start-page:not(:has(.intake-start-block--editing)):not(:has(.intake-start-card--editing)) .intake-start-glad-block,
  .intake-start-page:not(:has(.intake-start-card--editing)) .intake-start-card {
    transform: none !important;
  }
}
</style>
