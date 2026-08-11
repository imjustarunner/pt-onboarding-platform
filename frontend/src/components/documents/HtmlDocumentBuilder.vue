<template>
  <div class="html-builder" :class="{ 'html-builder--paper': paperMode }">
    <div class="toolbar">
      <button type="button" class="tool-btn" @click="exec('bold')" title="Bold"><strong>B</strong></button>
      <button type="button" class="tool-btn" @click="exec('italic')" title="Italic"><em>I</em></button>
      <button type="button" class="tool-btn" @click="exec('underline')" title="Underline"><u>U</u></button>
      <span class="tool-sep" />
      <button type="button" class="tool-btn" @click="exec('justifyLeft')" title="Align left">Left</button>
      <button type="button" class="tool-btn" @click="exec('justifyCenter')" title="Align center">Center</button>
      <button type="button" class="tool-btn" @click="exec('justifyRight')" title="Align right">Right</button>
      <button type="button" class="tool-btn" @click="exec('justifyFull')" title="Justify">Justify</button>
      <span class="tool-sep" />
      <button type="button" class="tool-btn" @click="exec('insertUnorderedList')" title="Bullets">• List</button>
      <button type="button" class="tool-btn" @click="exec('insertOrderedList')" title="Numbered">1. List</button>
      <span class="tool-sep" />
      <button type="button" class="tool-btn" @click="setBlock('p')" title="Paragraph">P</button>
      <button type="button" class="tool-btn" @click="setBlock('h2')" title="Heading">H2</button>
      <button type="button" class="tool-btn" @click="setBlock('h3')" title="Subheading">H3</button>
      <span class="tool-sep" />
      <button type="button" class="tool-btn" @click="promptLink" title="Insert link">Link</button>
      <button type="button" class="tool-btn" @click="removeLink" title="Remove link">Unlink</button>
      <span class="tool-sep" />
      <button type="button" class="tool-btn" @click="insertDivider" title="Insert divider">Divider</button>
      <button type="button" class="tool-btn" @click="insertPageBreak" title="Insert page break">Page Break</button>
      <button type="button" class="tool-btn" @click="setWatermark" title="Set watermark (preview only)">Watermark</button>
      <span class="tool-sep" />
      <button type="button" class="tool-btn" @click="exec('removeFormat')" title="Clear formatting">Clear</button>
      <button
        v-if="paperMode"
        type="button"
        class="tool-btn"
        :class="{ active: showPreview }"
        @click="showPreview = !showPreview"
        title="Toggle paged preview"
      >
        {{ showPreview ? 'Edit' : 'Preview pages' }}
      </button>
    </div>

    <div v-if="mergeTokens.length || sectionLinks.length" class="builder-aside-row">
      <div v-if="sectionLinks.length" class="section-nav" aria-label="Jump to section">
        <div class="aside-label">Sections</div>
        <button
          v-for="(sec, idx) in sectionLinks"
          :key="`sec-${idx}-${sec.text}`"
          type="button"
          class="section-chip"
          @click="jumpToSection(sec.text)"
        >
          {{ sec.text }}
        </button>
      </div>
      <div v-if="mergeTokens.length" class="token-nav" aria-label="Insert merge tokens">
        <div class="aside-label">Insert token</div>
        <button
          v-for="tok in mergeTokens"
          :key="tok.token"
          type="button"
          class="token-chip"
          :title="tok.label || tok.token"
          @click="insertToken(tok.token)"
        >
          {{ tok.token }}
        </button>
      </div>
    </div>

    <div v-if="showPreview && paperMode" class="paper-preview-wrap">
      <div class="paper-preview-note muted">
        Read-only page preview. Watermark (if set) appears here — not as floating text while editing.
      </div>
      <div class="paper-stack">
        <div
          v-for="(pageHtml, idx) in previewPages"
          :key="`page-${idx}`"
          class="paper-page"
        >
          <div v-if="watermarkText" class="paper-watermark" aria-hidden="true">{{ watermarkText }}</div>
          <div class="paper-page-body" v-html="pageHtml" />
          <div class="paper-page-footer">Page {{ idx + 1 }} of {{ previewPages.length }}</div>
        </div>
      </div>
    </div>

    <div
      v-show="!(showPreview && paperMode)"
      class="editor-shell"
      :class="{ 'editor-shell--paper': paperMode }"
    >
      <div
        ref="editorRef"
        class="editor"
        :class="{ 'editor--paper': paperMode }"
        contenteditable="true"
        :placeholder="placeholder"
        @input="onEditorInput"
        @blur="emitHtml"
      />
    </div>

    <div v-if="showHtmlSource" class="source">
      <label class="source-label">HTML Source (advanced)</label>
      <textarea class="source-textarea" :value="modelValue" @input="emitSource($event)" rows="10" />
    </div>

    <div class="footer">
      <label class="toggle">
        <input v-model="showHtmlSource" type="checkbox" />
        Show HTML source
      </label>
      <small class="hint">
        {{ paperMode
          ? 'Edit inside the page frame. Use Preview pages to check breaks before saving.'
          : 'Tip: you can paste formatted content directly into the editor.' }}
      </small>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Start typing…'
  },
  /** When true: page chrome, section nav, safer watermark handling. */
  paperMode: {
    type: Boolean,
    default: false
  },
  /** Optional merge tokens: [{ token: '{{X}}', label: '...' }] */
  mergeTokens: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:modelValue']);

const editorRef = ref(null);
const showHtmlSource = ref(false);
const showPreview = ref(false);
const watermarkText = ref('');

const sectionLinks = computed(() => {
  const html = String(props.modelValue || '');
  const links = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = String(m[1] || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) links.push({ text });
  }
  return links.slice(0, 40);
});

const previewPages = computed(() => {
  const html = String(props.modelValue || '');
  const cleaned = html
    .replace(/<div[^>]*class=["'][^"']*document-watermark[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  const parts = cleaned.split(/<div[^>]*class=["'][^"']*page-break[^"']*["'][^>]*>\s*<\/div>/i);
  if (parts.length <= 1) {
    // Also split on HR page markers some templates use
    const byHr = cleaned.split(/<hr[^>]*class=["'][^"']*page-break[^"']*["'][^>]*>/i);
    return byHr.map((p) => p.trim()).filter(Boolean).length ? byHr.map((p) => p.trim()).filter(Boolean) : [cleaned];
  }
  return parts.map((p) => p.trim()).filter((p) => p.length);
});

const syncWatermarkFromHtml = (html) => {
  const match = String(html || '').match(
    /class=["'][^"']*document-watermark[^"']*["'][^>]*data-watermark=["']([^"']+)["']/i
  )
    || String(html || '').match(
      /data-watermark=["']([^"']+)["'][^>]*class=["'][^"']*document-watermark[^"']*["']/i
    );
  watermarkText.value = match?.[1] ? String(match[1]).trim() : '';
};

const setEditorHtml = (html) => {
  if (!editorRef.value) return;
  const next = html || '';
  if (editorRef.value.innerHTML !== next) {
    editorRef.value.innerHTML = next;
  }
  syncWatermarkFromHtml(next);
};

const emitHtml = () => {
  if (!editorRef.value) return;
  emit('update:modelValue', editorRef.value.innerHTML || '');
  syncWatermarkFromHtml(editorRef.value.innerHTML || '');
};

const onEditorInput = () => {
  emitHtml();
};

const emitSource = (event) => {
  const html = event?.target?.value ?? '';
  emit('update:modelValue', html);
  syncWatermarkFromHtml(html);
};

const exec = (command) => {
  try {
    document.execCommand(command, false, null);
    emitHtml();
  } catch (e) {
    console.error('HtmlDocumentBuilder: execCommand failed:', command, e);
  }
};

const insertHtmlAtCursor = (html) => {
  if (!editorRef.value) return;
  editorRef.value.focus();
  try {
    document.execCommand('insertHTML', false, html);
  } catch (e) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const fragment = document.createDocumentFragment();
    while (temp.firstChild) fragment.appendChild(temp.firstChild);
    range.insertNode(fragment);
  }
  emitHtml();
};

const insertDivider = () => insertHtmlAtCursor('<hr class="document-divider" />');
const insertPageBreak = () => insertHtmlAtCursor('<div class="page-break" contenteditable="false"></div>');
const insertToken = (token) => insertHtmlAtCursor(`<code class="merge-token">${token}</code>&nbsp;`);

const buildWatermarkMetaNode = (text) => {
  // Marker only — never position:fixed in the editable surface.
  const node = document.createElement('div');
  node.className = 'document-watermark';
  node.setAttribute('data-watermark', text);
  node.setAttribute('contenteditable', 'false');
  node.setAttribute('aria-hidden', 'true');
  node.style.cssText = [
    'display: none',
    'height: 0',
    'overflow: hidden',
    'margin: 0',
    'padding: 0'
  ].join(';');
  node.textContent = text;
  return node;
};

const setWatermark = () => {
  if (!editorRef.value) return;
  const text = window.prompt('Watermark text (leave blank to remove). Shows in Preview / PDF, not as floating editor text.');
  if (text === null) return;
  const existing = editorRef.value.querySelector('.document-watermark');
  const trimmed = text.trim();
  if (!trimmed) {
    if (existing) existing.remove();
    watermarkText.value = '';
    emitHtml();
    return;
  }
  if (existing) {
    existing.textContent = trimmed;
    existing.setAttribute('data-watermark', trimmed);
    existing.style.cssText = 'display:none;height:0;overflow:hidden;margin:0;padding:0';
  } else {
    editorRef.value.prepend(buildWatermarkMetaNode(trimmed));
  }
  watermarkText.value = trimmed;
  emitHtml();
};

const setBlock = (tag) => {
  try {
    document.execCommand('formatBlock', false, tag);
    emitHtml();
  } catch (e) {
    console.error('HtmlDocumentBuilder: formatBlock failed:', tag, e);
  }
};

const promptLink = () => {
  const url = window.prompt('Enter URL (https://...)');
  if (!url) return;
  try {
    document.execCommand('createLink', false, url);
    emitHtml();
  } catch (e) {
    console.error('HtmlDocumentBuilder: createLink failed:', e);
  }
};

const removeLink = () => exec('unlink');

const jumpToSection = async (headingText) => {
  showPreview.value = false;
  await nextTick();
  if (!editorRef.value) return;
  const headings = editorRef.value.querySelectorAll('h2');
  const target = [...headings].find(
    (h) => String(h.textContent || '').replace(/\s+/g, ' ').trim() === headingText
  );
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.classList.add('section-flash');
  setTimeout(() => target.classList.remove('section-flash'), 1400);
};

onMounted(() => {
  setEditorHtml(props.modelValue);
});

watch(
  () => props.modelValue,
  (val) => {
    setEditorHtml(val);
  }
);
</script>

<style scoped>
.html-builder {
  border: 1px solid var(--border, #ddd);
  border-radius: 10px;
  overflow: hidden;
  background: white;
}

.html-builder--paper {
  background: #e8e4dc;
}

.toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px;
  border-bottom: 1px solid var(--border, #ddd);
  background: var(--bg-secondary, #f8f9fa);
  position: sticky;
  top: 0;
  z-index: 2;
}

.tool-btn {
  border: 1px solid var(--border, #ddd);
  background: white;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.tool-btn:hover,
.tool-btn.active {
  border-color: var(--primary-color, #007bff);
}

.tool-sep {
  width: 1px;
  height: 22px;
  background: var(--border, #ddd);
  margin: 0 4px;
}

.builder-aside-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fafafa;
}

.aside-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  margin-bottom: 6px;
}

.section-nav,
.token-nav {
  flex: 1 1 220px;
  min-width: 0;
}

.section-chip,
.token-chip {
  display: inline-flex;
  margin: 0 6px 6px 0;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-chip {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}

.section-chip:hover,
.token-chip:hover {
  border-color: #0f766e;
}

.editor-shell--paper {
  padding: 20px 16px 28px;
  background:
    radial-gradient(circle at 20% 10%, rgba(255,255,255,0.55), transparent 40%),
    linear-gradient(180deg, #ebe6dc 0%, #e2ddd3 100%);
}

.editor {
  min-height: 260px;
  padding: 14px;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  position: relative;
  background: #fff;
}

.editor--paper {
  min-height: 720px;
  max-width: 816px;
  margin: 0 auto;
  padding: 48px 56px;
  border-radius: 2px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 18px 40px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.editor:empty:before {
  content: attr(placeholder);
  color: var(--text-secondary, #999);
}

.editor :deep(.page-break) {
  border: 0;
  border-top: 2px dashed #9ca3af;
  margin: 28px -8px;
  height: 0;
  position: relative;
}

.editor :deep(.page-break)::after {
  content: 'Page break';
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  color: #6b7280;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0 8px;
}

.editor :deep(.document-divider) {
  border: none;
  border-top: 1px solid #cfcfcf;
  margin: 12px 0;
}

.editor :deep(.document-watermark) {
  display: none !important;
}

.editor :deep(.section-flash) {
  outline: 2px solid #14b8a6;
  outline-offset: 4px;
  background: #f0fdfa;
}

.editor :deep(.merge-token) {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.92em;
}

.paper-preview-wrap {
  padding: 16px;
}

.paper-preview-note {
  margin-bottom: 12px;
  font-size: 13px;
}

.paper-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
}

.paper-page {
  position: relative;
  width: min(100%, 816px);
  min-height: 1056px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.14);
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.paper-page-body {
  padding: 48px 56px 64px;
  font-size: 14px;
  line-height: 1.6;
}

.paper-page-footer {
  position: absolute;
  bottom: 14px;
  right: 20px;
  font-size: 11px;
  color: #9ca3af;
  font-weight: 600;
}

.paper-watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  opacity: 0.12;
  font-size: 72px;
  width: 100%;
  text-align: center;
  pointer-events: none;
  z-index: 0;
  color: #000;
  font-weight: 800;
}

.source {
  border-top: 1px solid var(--border, #ddd);
  padding: 10px;
  background: #fcfcfc;
}

.source-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-secondary, #666);
}

.source-textarea {
  width: 100%;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid var(--border, #ddd);
  background: var(--bg-secondary, #f8f9fa);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary, #333);
}

.hint {
  color: var(--text-secondary, #666);
  font-size: 12px;
}

.muted { color: #6b7280; }
</style>
