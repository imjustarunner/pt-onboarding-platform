<template>
  <div class="rich-text-editor">
    <div v-if="editor" class="editor-toolbar">
      <button
        type="button"
        @click="editor.chain().focus().toggleBold().run()"
        :class="{ 'is-active': editor.isActive('bold') }"
        class="toolbar-btn"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        @click="editor.chain().focus().toggleItalic().run()"
        :class="{ 'is-active': editor.isActive('italic') }"
        class="toolbar-btn"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        @click="editor.chain().focus().toggleBulletList().run()"
        :class="{ 'is-active': editor.isActive('bulletList') }"
        class="toolbar-btn"
      >
        •
      </button>
      <button
        type="button"
        @click="editor.chain().focus().toggleOrderedList().run()"
        :class="{ 'is-active': editor.isActive('orderedList') }"
        class="toolbar-btn"
      >
        1.
      </button>
      <button
        type="button"
        @click="setLink"
        :class="{ 'is-active': editor.isActive('link') }"
        class="toolbar-btn"
      >
        Link
      </button>
    </div>
    <div v-else class="editor-toolbar editor-toolbar--loading">
      <span class="loading-label">Loading editor…</span>
    </div>
    <EditorContent v-if="editor" :editor="editor" class="editor-content" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

const props = defineProps({
  content: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update']);

const editor = useEditor({
  extensions: [
    StarterKit,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-link'
      }
    })
  ],
  content: props.content?.content || '',
  onUpdate: ({ editor: ed }) => {
    emit('update', { content: ed.getHTML() });
  }
});

const setLink = () => {
  if (!editor.value) return;
  const previousUrl = editor.value.getAttributes('link').href;
  const url = window.prompt('URL', previousUrl);

  if (url === null) {
    return;
  }

  if (url === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }

  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
};

watch(() => props.content?.content, (newContent) => {
  if (editor.value && newContent !== editor.value.getHTML()) {
    editor.value.commands.setContent(newContent || '', false);
  }
});

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<style scoped>
.rich-text-editor {
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg, #fff);
}

.editor-toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
  background: var(--bg-alt, #f8f9fa);
  border-bottom: 1px solid var(--border, #ddd);
}

.editor-toolbar--loading {
  min-height: 40px;
  align-items: center;
}

.loading-label {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}

.toolbar-btn {
  padding: 6px 12px;
  border: 1px solid var(--border, #ddd);
  background: var(--bg, white);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary, inherit);
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: var(--border, #e9ecef);
}

.toolbar-btn.is-active {
  background: var(--primary, #C69A2B);
  color: #fff;
  border-color: var(--primary, #C69A2B);
}

.editor-content {
  padding: 16px;
  min-height: 200px;
}

.editor-content :deep(.ProseMirror) {
  outline: none;
  min-height: 200px;
}

.editor-content :deep(.ProseMirror p) {
  margin: 0 0 12px 0;
  line-height: 1.6;
}

.editor-content :deep(.ProseMirror ul),
.editor-content :deep(.ProseMirror ol) {
  padding-left: 24px;
  margin: 0 0 12px 0;
}

.editor-content :deep(.ProseMirror a) {
  color: var(--accent, #3A4C6B);
  text-decoration: underline;
}

.editor-content :deep(.ProseMirror strong) {
  font-weight: 600;
}

.editor-content :deep(.ProseMirror em) {
  font-style: italic;
}
</style>
