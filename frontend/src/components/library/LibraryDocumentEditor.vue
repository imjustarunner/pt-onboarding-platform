<template>
  <section class="document-editor" aria-label="Document editor">
    <div class="document-options">
      <label>Letterhead
        <select :value="brandingChoice" :disabled="readonly" @change="chooseBranding($event.target.value)">
          <option value="organization">Organization · Printable pages</option>
          <option value="plain">Plain paper</option>
          <option v-for="lh in letterheads" :key="lh.id" :value="`letterhead:${lh.id}`">{{ lh.name }}{{ lh.isPlatform ? ' (platform)' : '' }}</option>
          <option v-if="missingLetterhead" :value="brandingChoice">Selected letterhead (unavailable)</option>
        </select>
      </label>
      <button type="button" :aria-pressed="previewing" @click="togglePreview">{{ previewing ? (readonly ? 'Read document' : 'Back to writing') : 'Preview printed pages' }}</button>
      <span class="document-count">{{ wordCount }} words · {{ characterCount }} characters</span>
    </div>
    <p v-if="letterheadError" class="document-error" role="alert">{{ letterheadError }} <button type="button" @click="loadLetterheads">Retry</button></p>
    <template v-if="previewing">
      <div class="preview-actions">
        <span>Preview includes the selected letterhead and automatic page breaks.</span>
        <button type="button" :disabled="previewBusy" @click="loadPreview">Refresh preview</button>
        <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener">Open PDF</a>
      </div>
      <p v-if="previewBusy" role="status">Preparing pages…</p>
      <p v-if="previewError" class="document-error" role="alert">{{ previewError }}</p>
      <iframe v-if="previewUrl" :src="previewUrl" title="Document print preview" class="document-preview" />
    </template>
    <template v-else>
      <button v-if="!readonly" type="button" class="mobile-format-toggle" :aria-expanded="toolbarExpanded" @click="toolbarExpanded = !toolbarExpanded">{{ toolbarExpanded ? 'Hide formatting' : 'Formatting · Aa' }}</button>
      <div v-if="editor && !readonly" class="document-toolbar" :class="{ 'is-expanded': toolbarExpanded }" role="toolbar" aria-label="Text formatting">
        <select aria-label="Paragraph style" :value="headingLevel" @change="setHeading($event.target.value)">
          <option value="0">Body</option><option value="1">Title</option><option value="2">Heading</option><option value="3">Subheading</option>
        </select>
        <select aria-label="Font" :value="editor.getAttributes('textStyle').fontFamily || ''" @change="setFont($event.target.value)">
          <option value="">Default font</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="'Times New Roman'">Times New Roman</option>
        </select>
        <select aria-label="Font size" :value="editor.getAttributes('textStyle').fontSize || ''" @change="setFontSize($event.target.value)">
          <option value="">Default size</option><option v-for="size in [10, 11, 12, 14, 16, 18, 24, 30, 36]" :key="size" :value="`${size}pt`">{{ size }}</option>
        </select>
        <button v-for="tool in tools" :key="tool.label" type="button" :title="tool.label" :aria-label="tool.label" :aria-pressed="tool.active ? tool.active() : undefined" :disabled="tool.disabled?.()" @mousedown.prevent @click="tool.run()">{{ tool.text }}</button>
        <label class="color-tool" title="Text color">Color <input type="color" aria-label="Text color" :value="editor.getAttributes('textStyle').color || '#172033'" @input="editor.chain().focus().setColor($event.target.value).run()" /></label>
        <button type="button" :aria-expanded="showLink" @click="showLink = !showLink; linkUrl = editor.getAttributes('link').href || ''">Link</button>
        <button type="button" @mousedown.prevent @click="editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()">Table</button>
        <button type="button" @mousedown.prevent @click="editor.chain().focus().insertContent({ type: 'pageBreak' }).run()">Page break</button>
        <button type="button" @mousedown.prevent @click="editor.chain().focus().unsetAllMarks().clearNodes().run()">Clear formatting</button>
      </div>
      <form v-if="showLink && !readonly" class="link-form" @submit.prevent="applyLink">
        <label>Link address <input v-model="linkUrl" placeholder="https://…" type="text" /></label>
        <button type="submit">Apply link</button><button type="button" @click="editor.chain().focus().unsetLink().run(); showLink = false">Remove link</button>
        <span v-if="linkError" role="alert">{{ linkError }}</span>
      </form>
      <div v-if="editor?.isActive('table') && !readonly" class="table-tools" role="toolbar" aria-label="Table formatting">
        <button v-for="action in tableActions" :key="action.command" type="button" @mousedown.prevent @click="editor.chain().focus()[action.command]().run()">{{ action.label }}</button>
      </div>
      <div class="document-canvas">
        <div class="document-paper">
          <p class="paper-label">{{ selectedLetterheadName }} <span>Use preview to see the printed letterhead</span></p>
          <EditorContent :editor="editor" />
        </div>
      </div>
      <footer class="editor-hint">{{ readonly ? 'Read only. Make a personal copy to fill this document out.' : 'Paste formatted text, use keyboard shortcuts, or use your device’s keyboard dictation. Select text to format it.' }}</footer>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import DOMPurify from 'dompurify';
import { fetchLibraryLetterheads, previewLibraryDocument } from '../../services/library.js';

const props = defineProps({ modelValue: { type: String, default: '' }, name: { type: String, default: 'Document' }, brandingMode: { type: String, default: 'organization' }, letterheadTemplateId: { type: [Number, String], default: null }, agencyId: { type: [Number, String], default: null }, organizationId: { type: [Number, String], default: null }, readonly: Boolean });
const emit = defineEmits(['update:modelValue', 'update:brandingMode', 'update:letterheadTemplateId']);
const letterheads = ref([]);
const letterheadError = ref('');
const showLink = ref(false);
const toolbarExpanded = ref(false);
const linkUrl = ref('');
const linkError = ref('');
const previewing = ref(false);
const previewBusy = ref(false);
const previewError = ref('');
const previewUrl = ref('');
let previewSequence = 0;
let disposed = false;
const PageBreak = Node.create({ name: 'pageBreak', group: 'block', atom: true, parseHTML: () => [{ tag: 'div.page-break' }, { tag: 'hr.page-break' }, { tag: '[data-type="page-break"]' }], renderHTML: () => ['div', { class: 'page-break', 'data-type': 'page-break' }] });
const editor = useEditor({
  extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, protocols: ['http', 'https', 'mailto', 'tel'] } }), TextStyle, FontFamily, FontSize, Color, Highlight, TextAlign.configure({ types: ['heading', 'paragraph'] }), TaskList, TaskItem.configure({ nested: true }), TableKit, PageBreak],
  content: DOMPurify.sanitize(props.modelValue), editable: !props.readonly,
  editorProps: { attributes: { role: 'textbox', 'aria-label': 'Document body', 'aria-multiline': 'true', spellcheck: 'true' }, transformPastedHTML: (html) => DOMPurify.sanitize(html) },
  onUpdate: ({ editor: ed }) => emit('update:modelValue', ed.getHTML())
});
const headingLevel = computed(() => [1, 2, 3].find(level => editor.value?.isActive('heading', { level })) || 0);
const wordCount = computed(() => editor.value?.getText().trim().split(/\s+/).filter(Boolean).length || 0);
const characterCount = computed(() => editor.value?.getText().length || 0);
const brandingChoice = computed(() => props.brandingMode === 'letterhead' ? `letterhead:${props.letterheadTemplateId}` : props.brandingMode);
const missingLetterhead = computed(() => props.brandingMode === 'letterhead' && !letterheads.value.some(lh => Number(lh.id) === Number(props.letterheadTemplateId)));
const selectedLetterheadName = computed(() => props.brandingMode === 'plain' ? 'Plain paper' : props.brandingMode === 'organization' ? 'Organization · Printable pages' : letterheads.value.find(lh => Number(lh.id) === Number(props.letterheadTemplateId))?.name || 'Selected letterhead');
const command = (method, ...args) => () => editor.value?.chain().focus()[method](...args).run();
const tools = [
  { text: '↶', label: 'Undo (⌘/Ctrl+Z)', run: command('undo'), disabled: () => !editor.value?.can().undo() },
  { text: '↷', label: 'Redo (⌘/Ctrl+Shift+Z)', run: command('redo'), disabled: () => !editor.value?.can().redo() },
  ...[['B', 'Bold', 'bold'], ['I', 'Italic', 'italic'], ['U', 'Underline', 'underline'], ['S̶', 'Strikethrough', 'strike'], ['Highlight', 'Highlight', 'highlight'], ['• List', 'Bullet list', 'bulletList'], ['1. List', 'Numbered list', 'orderedList'], ['☑ List', 'Checklist', 'taskList'], ['❝', 'Quote', 'blockquote']].map(([text, label, mark]) => ({ text, label, run: command(`toggle${mark[0].toUpperCase()}${mark.slice(1)}`), active: () => editor.value?.isActive(mark) })),
  ...['left', 'center', 'right'].map(align => ({ text: align[0].toUpperCase() + align.slice(1), label: `Align ${align}`, run: command('setTextAlign', align), active: () => editor.value?.isActive({ textAlign: align }) }))
];
const tableActions = [{ label: '+ Row', command: 'addRowAfter' }, { label: '+ Column', command: 'addColumnAfter' }, { label: 'Delete row', command: 'deleteRow' }, { label: 'Delete column', command: 'deleteColumn' }, { label: 'Delete table', command: 'deleteTable' }];
const setHeading = (level) => Number(level) ? editor.value.chain().focus().setHeading({ level: Number(level) }).run() : editor.value.chain().focus().setParagraph().run();
const setFont = (font) => font ? command('setFontFamily', font)() : command('unsetFontFamily')();
const setFontSize = (size) => size ? command('setFontSize', size)() : command('unsetFontSize')();
function applyLink() {
  const url = linkUrl.value.trim();
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) { linkError.value = 'Use an https://, http://, mailto: or tel: address.'; return; }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  showLink.value = false; linkError.value = '';
}
function chooseBranding(choice) {
  const [mode, id] = choice.split(':');
  emit('update:brandingMode', mode);
  emit('update:letterheadTemplateId', id ? Number(id) : null);
}
async function loadLetterheads() {
  letterheadError.value = '';
  try { letterheads.value = await fetchLibraryLetterheads({ agencyId: props.agencyId || undefined, organizationId: props.organizationId || undefined }); }
  catch { letterheadError.value = 'Letterheads could not be loaded. Your selection has been kept.'; }
}
async function loadPreview() {
  const sequence = ++previewSequence;
  previewBusy.value = true; previewError.value = '';
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
  try {
    const blob = await previewLibraryDocument({ agencyId: props.agencyId || undefined, organizationId: props.organizationId || undefined, name: props.name, bodyHtml: props.modelValue, brandingMode: props.brandingMode, letterheadTemplateId: props.letterheadTemplateId });
    if (!disposed && sequence === previewSequence) previewUrl.value = URL.createObjectURL(blob);
  } catch { if (!disposed && sequence === previewSequence) previewError.value = 'Could not prepare the printed preview. Please retry. Your writing is unchanged.'; }
  finally { if (!disposed && sequence === previewSequence) previewBusy.value = false; }
}
function togglePreview() { previewing.value = !previewing.value; if (previewing.value) loadPreview(); }
watch(() => props.agencyId, loadLetterheads, { immediate: true });
watch(() => [props.brandingMode, props.letterheadTemplateId], () => { if (previewing.value) loadPreview(); });
watch(() => props.modelValue, value => { if (editor.value && value !== editor.value.getHTML()) editor.value.commands.setContent(DOMPurify.sanitize(value || ''), { emitUpdate: false }); });
watch(() => props.readonly, value => editor.value?.setEditable(!value));
onBeforeUnmount(() => { disposed = true; previewSequence++; if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); editor.value?.destroy(); });
</script>

<style scoped>
.document-editor { background: #f0f2f5; border: 1px solid #dce1e7; border-radius: 12px; overflow: clip; color: #172033; }
.document-options,.document-toolbar,.table-tools,.link-form,.preview-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 10px 14px; background: #fff; border-bottom: 1px solid #e2e6eb; }
.document-options { gap: 12px; }
.document-options label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.document-editor button,.document-editor select,.link-form input { min-height: 36px; border: 1px solid #d6dce4; border-radius: 7px; background: #fff; padding: 6px 9px; color: #172033; font: inherit; font-size: 13px; }
.document-editor button { cursor: pointer; }
.document-editor button:hover,.document-editor button[aria-pressed="true"] { background: #e8eff8; border-color: #7d99bd; }
.document-editor button:disabled { opacity: .4; cursor: default; }
.document-editor :focus-visible { outline: 2px solid #527aa8; outline-offset: 2px; }
.document-count { margin-left: auto; font-size: 12px; color: #64748b; }
.document-toolbar { position: sticky; top: 0; z-index: 2; background: #fafbfc; }
.color-tool { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.color-tool input { width: 28px; height: 28px; padding: 0; border: 0; }
.document-canvas { padding: 24px; }
.document-paper { background: white; max-width: 816px; min-height: 740px; box-sizing: border-box; margin: auto; padding: 32px 64px 64px; box-shadow: 0 4px 20px #17203312; }
.paper-label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #64748b; padding-bottom: 22px; margin: 0; }
.paper-label span { color: #94a3b8; }
.document-paper :deep(.tiptap) { outline: none; min-height: 580px; font: 11pt/1.55 Arial, Helvetica, sans-serif; overflow-wrap: anywhere; }
.document-paper :deep(p) { margin: 0 0 10pt; }
.document-paper :deep(h1) { font-size: 26pt; line-height: 1.2; }
.document-paper :deep(h2) { font-size: 20pt; line-height: 1.3; }
.document-paper :deep(h3) { font-size: 16pt; }
.document-paper :deep(blockquote) { border-left: 3px solid #cbd5e1; margin-left: 0; padding-left: 12pt; }
.document-paper :deep(table) { border-collapse: collapse; width: 100%; table-layout: fixed; }
.document-paper :deep(td),.document-paper :deep(th) { border: 1px solid #b7bec9; padding: 7pt; vertical-align: top; position: relative; min-width: 40px; }
.document-paper :deep(th) { background: #f1f5f9; }
.document-paper :deep(.selectedCell) { background: #e8eff8; }
.document-paper :deep(ul[data-type="taskList"]) { list-style: none; padding-left: 0; }
.document-paper :deep(ul[data-type="taskList"] li) { display: flex; gap: 8px; }
.document-paper :deep(ul[data-type="taskList"] li > div) { flex: 1; }
.document-paper :deep(.page-break) { border-top: 2px dashed #cbd5e1; margin: 24px 0; }
.document-paper :deep(.page-break)::after { content: 'Page break'; color: #64748b; font-size: 10px; }
.document-paper :deep(ul[data-type="taskList"] li > label) { flex: 0 0 auto; padding-top: 2px; }
.mobile-format-toggle { display: none; }
.document-paper :deep(pre) { white-space: pre-wrap; }
.editor-hint,.preview-actions { font-size: 12px; color: #64748b; padding: 12px; }
.document-preview { display: block; width: 100%; height: 75vh; border: 0; }
.document-error { padding: 12px; color: #a12d2d; }
@media (max-width: 640px) { .mobile-format-toggle { display: block; margin: 8px; } .document-toolbar:not(.is-expanded) { display: none; } .document-canvas { padding: 8px; } .document-paper { padding: 24px 18px; } .document-toolbar { gap: 4px; padding: 8px; } .document-options select { max-width: 230px; } .document-count { margin-left: 0; } }
</style>
