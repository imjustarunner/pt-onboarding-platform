<template>
  <div class="hub-email-editor" :style="{ height: editorHeight + 'px' }">
    <div v-if="editor" class="hub-email-toolbar" role="toolbar" aria-label="Email formatting">
      <button type="button" class="tb" :class="{ on: editor.isActive('bold') }" title="Bold" @click="editor.chain().focus().toggleBold().run()"><strong>B</strong></button>
      <button type="button" class="tb" :class="{ on: editor.isActive('italic') }" title="Italic" @click="editor.chain().focus().toggleItalic().run()"><em>I</em></button>
      <button type="button" class="tb" :class="{ on: editor.isActive('underline') }" title="Underline" @click="editor.chain().focus().toggleUnderline().run()"><span class="u">U</span></button>
      <span class="sep" />
      <button type="button" class="tb" :class="{ on: editor.isActive('bulletList') }" title="Bullets" @click="editor.chain().focus().toggleBulletList().run()">•</button>
      <button type="button" class="tb" :class="{ on: editor.isActive('orderedList') }" title="Numbered list" @click="editor.chain().focus().toggleOrderedList().run()">1.</button>
      <button type="button" class="tb" title="Checklist" @click="insertChecklist">☑</button>
      <span class="sep" />
      <button type="button" class="tb" :class="{ on: editor.isActive({ textAlign: 'left' }) }" title="Align left" @click="editor.chain().focus().setTextAlign('left').run()">⬅</button>
      <button type="button" class="tb" :class="{ on: editor.isActive({ textAlign: 'center' }) }" title="Center" @click="editor.chain().focus().setTextAlign('center').run()">☰</button>
      <button type="button" class="tb" :class="{ on: editor.isActive({ textAlign: 'right' }) }" title="Align right" @click="editor.chain().focus().setTextAlign('right').run()">➡</button>
      <span class="sep" />
      <label class="tb color" title="Text color">
        A
        <input type="color" :value="textColor" @input="setColor($event.target.value)" />
      </label>
      <label class="tb color" title="Highlight">
        ▮
        <input type="color" :value="highlightColor" @input="setHighlight($event.target.value)" />
      </label>
      <select class="tb-select" title="Font" :value="fontFamily" @change="setFont($event.target.value)">
        <option value="">Font</option>
        <option value="Arial, Helvetica, sans-serif">Arial</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="'Times New Roman', Times, serif">Times</option>
        <option value="'Courier New', Courier, monospace">Courier</option>
        <option value="Verdana, Geneva, sans-serif">Verdana</option>
      </select>
      <select class="tb-select" title="Size" :value="fontSize" @change="setSize($event.target.value)">
        <option value="">Size</option>
        <option value="12px">12</option>
        <option value="14px">14</option>
        <option value="16px">16</option>
        <option value="18px">18</option>
        <option value="22px">22</option>
        <option value="28px">28</option>
      </select>
      <span class="sep" />
      <div class="emoji-wrap">
        <button
          type="button"
          class="tb"
          :class="{ on: emojiOpen }"
          title="Insert emoji"
          @click.stop="emojiOpen = !emojiOpen"
        >
          🙂
        </button>
        <div v-if="emojiOpen" class="emoji-panel" @click.stop>
          <div v-for="group in EMOJI_GRID" :key="group.label" class="emoji-group">
            <div class="emoji-label">{{ group.label }}</div>
            <div class="emoji-row">
              <button
                v-for="e in group.emojis"
                :key="e"
                type="button"
                class="emoji-btn"
                @click="pickEmoji(e)"
              >{{ e }}</button>
            </div>
          </div>
        </div>
      </div>
      <label class="tb" title="Attach photo or GIF">
        🖼
        <input type="file" accept="image/*,.gif,image/gif" multiple hidden @change="onPickImages" />
      </label>
      <label class="tb" title="Attach files">
        📎
        <input type="file" multiple hidden @change="onPickFiles" />
      </label>
    </div>
    <EditorContent v-if="editor" :editor="editor" class="hub-email-content" />
    <div
      class="resize-handle"
      title="Drag to resize"
      @mousedown.prevent="startResize"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Write an email…' }
});
const emit = defineEmits(['update:modelValue', 'attach-files', 'attach-images']);

const emojiOpen = ref(false);
const editorHeight = ref(220);
let resizing = false;
let resizeStartY = 0;
let resizeStartH = 0;

const EMOJI_GRID = [
  { label: 'Smileys', emojis: ['😊', '😂', '🥹', '😍', '🤩', '😎', '🥳', '😅', '😢', '😡', '🤔', '🙄', '🫠', '🥰', '😇', '🤦'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '💪', '🤜', '🫶', '🤞', '🙏', '🫡'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❤️‍🔥', '✅', '💯'] },
  { label: 'Celebration', emojis: ['🎉', '🎊', '🎈', '🏆', '🥂', '🎯', '🚀', '🔥', '⭐', '💥', '👑', '💎'] }
];

const editor = useEditor({
  extensions: [
    StarterKit,
    Underline,
    Link.configure({ openOnClick: false }),
    Image.configure({ inline: true, allowBase64: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    Highlight.configure({ multicolor: true })
  ],
  content: props.modelValue || '',
  editorProps: {
    attributes: {
      class: 'hub-email-prose',
      'data-placeholder': props.placeholder
    }
  },
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML());
  }
});

watch(
  () => props.modelValue,
  (v) => {
    if (!editor.value) return;
    const cur = editor.value.getHTML();
    if (String(v || '') !== cur) {
      editor.value.commands.setContent(v || '', { emitUpdate: false });
    }
  }
);

function onDocClick() {
  emojiOpen.value = false;
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', stopResize);
  editor.value?.destroy();
});

const textColor = computed(() => editor.value?.getAttributes('textStyle')?.color || '#1e293b');
const highlightColor = computed(() => editor.value?.getAttributes('highlight')?.color || '#fef08a');
const fontFamily = computed(() => editor.value?.getAttributes('textStyle')?.fontFamily || '');
const fontSize = computed(() => editor.value?.getAttributes('textStyle')?.fontSize || '');

function setColor(color) {
  editor.value?.chain().focus().setColor(color).run();
}
function setHighlight(color) {
  editor.value?.chain().focus().toggleHighlight({ color }).run();
}
function setFont(font) {
  if (!font) {
    editor.value?.chain().focus().unsetFontFamily().run();
    return;
  }
  editor.value?.chain().focus().setFontFamily(font).run();
}
function setSize(size) {
  if (!size) {
    editor.value?.chain().focus().unsetFontSize().run();
    return;
  }
  editor.value?.chain().focus().setFontSize(size).run();
}
function insertChecklist() {
  editor.value?.chain().focus().insertContent('<p>☐ </p>').run();
}
function insertEmoji(emoji) {
  if (!emoji || !editor.value) return;
  editor.value.chain().focus().insertContent(emoji).run();
}
function pickEmoji(emoji) {
  insertEmoji(emoji);
  emojiOpen.value = false;
}
function insertImageUrl(url) {
  if (!url || !editor.value) return;
  editor.value.chain().focus().setImage({ src: url }).run();
}

function onPickImages(e) {
  emit('attach-images', e);
  e.target.value = '';
}
function onPickFiles(e) {
  emit('attach-files', e);
  e.target.value = '';
}

function startResize(ev) {
  resizing = true;
  resizeStartY = ev.clientY;
  resizeStartH = editorHeight.value;
  window.addEventListener('mousemove', onResizeMove);
  window.addEventListener('mouseup', stopResize);
}
function onResizeMove(ev) {
  if (!resizing) return;
  const next = Math.min(560, Math.max(160, resizeStartH + (ev.clientY - resizeStartY)));
  editorHeight.value = next;
}
function stopResize() {
  resizing = false;
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', stopResize);
}

defineExpose({ insertEmoji, insertImageUrl, editor });
</script>

<style scoped>
.hub-email-editor {
  border: 1px solid var(--mh-line, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  min-height: 160px;
  overflow: hidden;
  position: relative;
  flex: 0 0 auto;
}
.hub-email-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--mh-line, #e2e8f0);
  background: #f8fafc;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.tb {
  min-width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  position: relative;
}
.tb.on {
  border-color: var(--mh-primary, #0f766e);
  background: color-mix(in srgb, var(--mh-primary, #0f766e) 12%, #fff);
}
.tb .u { text-decoration: underline; }
.tb.color input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.tb-select {
  height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  max-width: 100px;
}
.sep {
  width: 1px;
  align-self: stretch;
  background: #e2e8f0;
  margin: 0 2px;
}
.emoji-wrap {
  position: relative;
}
.emoji-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  width: min(280px, 70vw);
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
}
.emoji-group + .emoji-group { margin-top: 8px; }
.emoji-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  margin-bottom: 4px;
}
.emoji-row { display: flex; flex-wrap: wrap; gap: 2px; }
.emoji-btn {
  border: 0;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.emoji-btn:hover { background: #f1f5f9; }
.hub-email-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.hub-email-content :deep(.hub-email-prose) {
  min-height: 100%;
  padding: 10px 12px 18px;
  outline: none;
  font-size: 14px;
  line-height: 1.5;
  color: #0f172a;
}
.hub-email-content :deep(.hub-email-prose p) { margin: 0 0 0.6em; }
.hub-email-content :deep(.hub-email-prose ul),
.hub-email-content :deep(.hub-email-prose ol) { margin: 0 0 0.6em; padding-left: 1.3em; }
.hub-email-content :deep(.hub-email-prose img) { max-width: 100%; height: auto; border-radius: 6px; }
.resize-handle {
  flex-shrink: 0;
  height: 10px;
  cursor: ns-resize;
  background:
    linear-gradient(135deg, transparent 40%, #cbd5e1 40%, #cbd5e1 45%, transparent 45%, transparent 55%, #cbd5e1 55%, #cbd5e1 60%, transparent 60%),
    #f8fafc;
  background-position: right 8px center, 0 0;
  background-repeat: no-repeat, no-repeat;
  background-size: 12px 12px, 100% 100%;
  border-top: 1px solid #e2e8f0;
}
</style>
