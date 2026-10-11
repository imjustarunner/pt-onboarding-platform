<template>
  <section class="section-editor" :aria-label="anchorPrefix === 'school-practice-guide' ? 'Edit school practice guide sections' : anchorPrefix === 'provider-guide' ? 'Edit provider guide sections' : 'Edit handbook sections'">
    <div class="editor-header"><div><h3>Edit your company edition</h3><p>Save changes to the draft. Publish when the whole edition is ready.</p></div><button type="button" :disabled="busy" @click="choose('')">Add section</button></div>
    <label class="editor-field">Section <select :value="selectedId" :disabled="busy" @change="choose($event.target.value)"><option value="">New section</option><option v-for="section in sections" :key="section.id" :value="section.id">{{ section.content_status === 'pending' ? 'Complete · ' : '' }}{{ section.title }}</option></select></label>
    <p v-if="requiredTopic" class="setup-prompt">{{ requiredTopic.prompt }}</p>
    <form @submit.prevent="save">
      <div class="editor-fields"><label class="editor-field">Section title <input v-model="title" required maxlength="255" :disabled="busy" /></label><label class="editor-field order-field">Position <input v-model.number="sortOrder" type="number" min="0" step="1" required :disabled="busy" /></label></div>
      <p v-if="selected" class="section-link">Permanent link: #{{ anchorPrefix }}-{{ selected.slug }}</p>
      <div v-if="editor" class="format-toolbar" role="toolbar" aria-label="Section formatting">
        <select aria-label="Paragraph style" :disabled="busy" @change="heading($event.target.value)"><option value="0">Paragraph</option><option value="2">Heading</option><option value="3">Subheading</option></select>
        <button v-for="tool in formatTools" :key="tool.command" type="button" :disabled="busy" @click="editor.chain().focus()[tool.command]().run()">{{ tool.label }}</button>
        <button type="button" :disabled="busy" @click="editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()">Table</button>
        <button type="button" :disabled="busy" @click="showLink = !showLink">Link</button>
      </div>
      <div v-if="showLink" class="link-fields"><label>Link address <input v-model="link" type="text" placeholder="https://… or #handbook-section" /></label><button type="button" @click="applyLink">Apply link</button><button type="button" @click="editor.chain().focus().unsetLink().run(); showLink = false">Remove link</button></div>
      <EditorContent :editor="editor" class="section-writing" />
      <div v-if="editor?.isActive('table')" class="format-toolbar"><button v-for="action in tableTools" :key="action.command" type="button" :disabled="busy" @click="editor.chain().focus()[action.command]().run()">{{ action.label }}</button></div>
      <p v-if="error" role="alert" class="editor-error">{{ error }}</p>
      <div class="editor-actions"><button type="submit" class="save-section" :disabled="busy || !title.trim()">{{ busy ? 'Saving…' : 'Save section to draft' }}</button><button v-if="selected && !requiredTopic" type="button" :disabled="busy" @click="confirmRemove = true">Delete section…</button><span>{{ dirty ? 'Unsaved changes' : 'Draft only · Staff see the published edition' }}</span></div>
      <div v-if="confirmRemove" class="delete-confirm" role="alert"><p>Remove “{{ selected?.title }}” from this draft? Publishing will record its removal in {{ updatesLabel }}.</p><button type="button" :disabled="busy" @click="remove">Remove from draft</button><button type="button" @click="confirmRemove = false">Keep section</button></div>
    </form>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import DOMPurify from 'dompurify';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, versionId: { type: Number, required: true }, sections: { type: Array, required: true }, requiredSections: { type: Array, default: () => [] }, apiBase: { type: String, default: '/provider-update/handbook' }, anchorPrefix: { type: String, default: 'handbook' }, updatesLabel: { type: String, default: 'Handbook Updates' } });
const emit = defineEmits(['saved', 'dirty']);
const selectedId = ref(''); const title = ref(''); const sortOrder = ref(0); const busy = ref(false); const error = ref(''); const dirty = ref(false); const confirmRemove = ref(false); const showLink = ref(false); const link = ref('');
let snapshot = null;
const selected = computed(() => props.sections.find(s => String(s.id) === String(selectedId.value)));
const requiredTopic = computed(() => props.requiredSections.find(s => s.slug === selected.value?.slug));
const markDirty = () => { dirty.value = true; };
const editor = useEditor({ extensions: [StarterKit.configure({ link: { openOnClick: false } }), TableKit], content: '', onUpdate: markDirty, editorProps: { attributes: { 'aria-label': 'Section content', role: 'textbox', 'aria-multiline': 'true' } } });
const formatTools = [{ command: 'toggleBold', label: 'Bold' }, { command: 'toggleItalic', label: 'Italic' }, { command: 'toggleBulletList', label: 'Bullets' }, { command: 'toggleOrderedList', label: 'Numbered list' }, { command: 'undo', label: 'Undo' }];
const tableTools = [{ command: 'addRowAfter', label: 'Add row' }, { command: 'addColumnAfter', label: 'Add column' }, { command: 'deleteRow', label: 'Delete row' }, { command: 'deleteColumn', label: 'Delete column' }, { command: 'deleteTable', label: 'Remove table' }];
function choose(id, force = false) {
  if (!force && dirty.value && !window.confirm('Discard unsaved changes to this section?')) return;
  selectedId.value = String(id || ''); snapshot = selected.value ? structuredClone({ title: selected.value.title, bodyHtml: selected.value.body_html, sortOrder: selected.value.sort_order }) : null;
  title.value = selected.value?.title || ''; sortOrder.value = selected.value?.sort_order ?? Math.max(-1, ...props.sections.map(s => Number(s.sort_order))) + 1;
  editor.value?.commands.setContent(DOMPurify.sanitize(selected.value?.body_html || ''), { emitUpdate: false });
  dirty.value = false; confirmRemove.value = false; error.value = ''; showLink.value = false;
}
function heading(value) { const chain = editor.value.chain().focus(); Number(value) ? chain.toggleHeading({ level: Number(value) }).run() : chain.setParagraph().run(); }
function applyLink() {
  if (!/^(https?:\/\/|mailto:|tel:|#handbook-|#provider-guide-|#school-practice-guide-)/i.test(link.value.trim())) { error.value = 'Use a web, email, phone or handbook section link.'; return; }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: link.value.trim() }).run(); showLink.value = false; error.value = '';
}
async function save() {
  busy.value = true; error.value = ''; editor.value?.setEditable(false);
  try {
    const bodyHtml = editor.value?.getHTML() || '';
    if (!editor.value?.getText().trim()) throw new Error('Write section content before saving.');
    await api.post(`${props.apiBase}/sections`, { agencyId: Number(props.agencyId), expectedVersionId: props.versionId, sectionId: selected.value?.id || null, title: title.value, bodyHtml, sortOrder: sortOrder.value, expectedSection: snapshot });
    dirty.value = false; emit('saved');
  } catch (e) { error.value = e?.response?.data?.error?.message || e.message || 'The section could not be saved.'; }
  finally { busy.value = false; editor.value?.setEditable(true); }
}
async function remove() {
  busy.value = true; error.value = '';
  try { await api.delete(`${props.apiBase}/sections/${selected.value.id}`, { data: { agencyId: Number(props.agencyId), expectedVersionId: props.versionId, expectedSection: snapshot } }); dirty.value = false; selectedId.value = ''; emit('saved'); }
  catch (e) { error.value = e?.response?.data?.error?.message || 'The section could not be removed.'; }
  finally { busy.value = false; }
}
watch(dirty, value => emit('dirty', value));
watch([() => props.sections, editor], () => { if (!dirty.value) choose(selected.value?.id || props.sections.find(s => s.content_status === 'pending')?.id || props.sections[0]?.id || '', true); }, { immediate: true });
watch([title, sortOrder], (value, previous) => { if (snapshot && (value[0] !== snapshot.title || Number(value[1]) !== Number(snapshot.sortOrder))) markDirty(); else if (!snapshot && previous && value[0]) markDirty(); }, { flush: 'sync' });
const beforeUnload = event => { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } };
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); editor.value?.destroy(); });
</script>
<style scoped>
.section-editor{font-family:var(--handbook-font, var(--font-ptco));padding:22px;border:1px solid #cdd9cf;background:#fff;border-radius:10px;color:#243c31}.editor-header{display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap;margin-bottom:20px}h3{font-size:18px;margin:0 0 7px}.editor-header p{font-size:12px;color:#647368;margin:0}.editor-field{display:grid;gap:6px;font-size:12px;min-width:0}.editor-fields{display:grid;grid-template-columns:minmax(0,1fr) 95px;gap:14px;margin:16px 0}.section-editor input,.section-editor select,.section-editor button{font:inherit;font-size:12px;border:1px solid #ced9d0;border-radius:5px;padding:10px;background:white;color:#243c31;max-width:100%}.section-editor input{width:100%}.section-editor button{cursor:pointer}.section-editor button:disabled{opacity:.6;cursor:default}.setup-prompt{padding:14px;background:#f3f5e9;border-left:3px solid #79946c;font-size:13px;line-height:1.8}.section-link{font-size:11px;color:#65786c;overflow-wrap:anywhere}.format-toolbar{display:flex;gap:5px;flex-wrap:wrap;background:#f4f7f2;padding:8px;border:1px solid #d7e0d7}.section-writing{border:1px solid #d7e0d7;border-top:0;background:white;max-height:600px;overflow:auto}.section-writing :deep(.tiptap){min-height:240px;padding:18px;line-height:1.8;font-size:14px;outline:none}.section-writing :deep(.tiptap:focus-visible){box-shadow:inset 0 0 0 2px #426c60}.section-writing :deep(table){border-collapse:collapse;width:100%}.section-writing :deep(td),.section-writing :deep(th){border:1px solid #aebdaf;padding:8px;min-width:60px}.section-writing :deep(a){color:#246c4b;text-decoration:underline}.editor-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:16px}.editor-actions span{font-size:11px;color:#65786c}.editor-actions .save-section{background:#284c3c;color:white}.link-fields{display:flex;gap:8px;flex-wrap:wrap;padding:12px;font-size:12px}.editor-error{color:#9b3126;font-size:13px}.delete-confirm{background:#fff3ed;border:1px solid #e5c8b5;padding:14px;border-radius:8px;font-size:13px;margin-top:15px}.delete-confirm button{margin:0 10px 0 0}:focus-visible{outline:2px solid #426c60;outline-offset:2px}@media(max-width:480px){.section-editor{font-family:var(--handbook-font, var(--font-ptco));padding:13px}.editor-fields{grid-template-columns:1fr}.format-toolbar button{padding:8px;font-size:11px}}
.section-writing :deep(.tiptap h1), .section-writing :deep(.tiptap h2), .section-writing :deep(.tiptap h3) { font-family: var(--handbook-font, var(--font-ptco)); }
</style>
