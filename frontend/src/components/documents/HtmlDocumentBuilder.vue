<template>
  <div class="html-builder">
    <div class="toolbar">
      <button type="button" class="tool-btn" @click="exec('bold')" title="Bold"><strong>B</strong></button>
      <button type="button" class="tool-btn" @click="exec('italic')" title="Italic"><em>I</em></button>
      <button type="button" class="tool-btn" @click="exec('underline')" title="Underline"><u>U</u></button>
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
      <button type="button" class="tool-btn" @click="exec('removeFormat')" title="Clear formatting">Clear</button>
    </div>

    <div
      ref="editorRef"
      class="editor"
      contenteditable="true"
      :placeholder="placeholder"
      @input="emitHtml"
      @blur="emitHtml"
    />

    <div v-if="showHtmlSource" class="source">
      <label class="source-label">HTML Source</label>
      <textarea class="source-textarea" :value="modelValue" @input="emitSource($event)" rows="10" />
    </div>

    <div class="footer">
      <label class="toggle">
        <input type="checkbox" v-model="showHtmlSource" />
        Show HTML source
      </label>
      <small class="hint">Tip: you can paste formatted content directly into the editor.</small>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Start typing…'
  }
});

const emit = defineEmits(['update:modelValue']);

const editorRef = ref(null);
const showHtmlSource = ref(false);

const setEditorHtml = (html) => {
  if (!editorRef.value) return;
  const next = html || '';
  // Avoid resetting the caret on every keystroke; only sync when the content differs.
  if (editorRef.value.innerHTML !== next) {
    editorRef.value.innerHTML = next;
  }
};

const emitHtml = () => {
  if (!editorRef.value) return;
  emit('update:modelValue', editorRef.value.innerHTML || '');
};

const emitSource = (event) => {
  const html = event?.target?.value ?? '';
  emit('update:modelValue', html);
};

const exec = (command) => {
  try {
    document.execCommand(command, false, null);
    emitHtml();
  } catch (e) {
    console.error('HtmlDocumentBuilder: execCommand failed:', command, e);
  }
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

.toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px;
  border-bottom: 1px solid var(--border, #ddd);
  background: var(--bg-secondary, #f8f9fa);
}

.tool-btn {
  border: 1px solid var(--border, #ddd);
  background: white;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.tool-btn:hover {
  border-color: var(--primary-color, #007bff);
}

.tool-sep {
  width: 1px;
  height: 22px;
  background: var(--border, #ddd);
  margin: 0 4px;
}

.editor {
  min-height: 260px;
  padding: 14px;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
}

.editor:empty:before {
  content: attr(placeholder);
  color: var(--text-secondary, #999);
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
</style>

