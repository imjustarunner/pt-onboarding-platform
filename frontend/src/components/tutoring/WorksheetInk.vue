<template><div class="worksheet-ink"><svg ref="surface" viewBox="0 0 1000 400" :style="{touchAction:disabled?'auto':'none'}" aria-label="Handwritten answer" role="img" @pointerdown="begin" @pointermove="move" @pointerup="end" @pointercancel="end"><polyline v-for="(stroke,index) in modelValue" :key="index" :points="stroke.map(p=>p.join(',')).join(' ')" fill="none" stroke="#14374e" stroke-width="4" stroke-linecap="round"/><polyline v-if="active.length" :points="active.map(p=>p.join(',')).join(' ')" fill="none" stroke="#14374e" stroke-width="4"/></svg><button v-if="!disabled" type="button" :disabled="!modelValue.length" @click="$emit('update:modelValue',modelValue.slice(0,-1))">Undo my last stroke</button></div></template>
<script setup>
import {ref} from 'vue';
const props=defineProps({modelValue:{type:Array,default:()=>[]},disabled:Boolean}),emit=defineEmits(['update:modelValue']);
const surface=ref(null),active=ref([]);let pointer=null;
function point(e){const r=surface.value.getBoundingClientRect();return [Math.max(0,Math.min(1000,(e.clientX-r.left)/r.width*1000)),Math.max(0,Math.min(400,(e.clientY-r.top)/r.height*400))];}
function begin(e){if(props.disabled||props.modelValue.length>=200||pointer!==null)return;e.preventDefault();pointer=e.pointerId;surface.value.setPointerCapture(pointer);active.value=[point(e)];}
function move(e){if(e.pointerId===pointer&&active.value.length<1500)active.value.push(point(e));}
function end(e){if(e.pointerId!==pointer)return;emit('update:modelValue',[...props.modelValue,active.value]);active.value=[];pointer=null;}
</script>
<style scoped>.worksheet-ink{background:#fff;border:1px solid #9caec2;border-radius:6px}.worksheet-ink svg{display:block;width:100%;height:90px}.worksheet-ink button{font:inherit;font-size:11px;border:0;background:#edf4f6;color:#23445a;padding:3px 6px}</style>
