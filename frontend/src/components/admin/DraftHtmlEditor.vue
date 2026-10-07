<template>
 <div class="draft-editor">
  <div class="tools"><button v-for="[command,label] in commands" :key="command" type="button" @mousedown.prevent="format(command)">{{label}}</button></div>
  <div ref="editor" class="editable" contenteditable="true" role="textbox" aria-multiline="true" :aria-label="label" @input="emit('update:modelValue',editor.innerHTML)" />
 </div>
</template>
<script setup>
import {onMounted,ref,watch} from 'vue';
import DOMPurify from 'dompurify';
const props=defineProps({modelValue:{type:String,default:''},label:{type:String,default:'Draft text'}});
const emit=defineEmits(['update:modelValue']);const editor=ref(null);
const commands=[['bold','Bold'],['italic','Italic'],['insertUnorderedList','Bullets'],['insertOrderedList','Numbered list'],['undo','Undo']];
function sync(){if(editor.value && editor.value!==document.activeElement)editor.value.innerHTML=DOMPurify.sanitize(props.modelValue);}
function format(command){editor.value.focus();document.execCommand(command);emit('update:modelValue',editor.value.innerHTML);}
onMounted(sync);watch(()=>props.modelValue,sync);
</script>
<style scoped>
.draft-editor{border:1px solid #ccd9d2;border-radius:12px;overflow:hidden;background:white}.tools{display:flex;gap:8px;flex-wrap:wrap;padding:10px;background:#f0f6f2}.tools button{border:1px solid #cbd5e1;background:white;border-radius:6px;padding:6px 10px}.editable{padding:22px;min-height:180px;max-height:65vh;overflow:auto;line-height:1.65;color:#233b30}.editable:focus{outline:2px solid #3e6d54;outline-offset:-2px}.editable :deep(table){border-collapse:collapse;width:100%}.editable :deep(td),.editable :deep(th){border:1px solid #d8e1dc;padding:8px;text-align:left}
</style>
