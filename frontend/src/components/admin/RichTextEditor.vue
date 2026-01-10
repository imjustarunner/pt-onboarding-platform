<template>
  <div class="rich-text-editor">
    <div class="editor-toolbar">
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
        🔗
      </button>
    </div>
    <EditorContent :editor="editor" class="editor-content" />
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
  onUpdate: ({ editor }) => {
    emit('update', { content: editor.getHTML() });
  }
});

const setLink = () => {
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
    editor.value.commands.setContent(newContent || '');
  }
});

onBeforeUnmount(() => {
  editor.value?.destroy();
});
</script>

<style scoped>
.rich-text-editor {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.editor-toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
  background: #f8f9fa;
  border-bottom: 1px solid #ddd;
}

.toolbar-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: #e9ecef;
}

.toolbar-btn.is-active {
  background: #2196f3;
  color: white;
  border-color: #2196f3;
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
  color: #2196f3;
  text-decoration: underline;
}

.editor-content :deep(.ProseMirror strong) {
  font-weight: 600;
}

.editor-content :deep(.ProseMirror em) {
  font-style: italic;
}
</style>

