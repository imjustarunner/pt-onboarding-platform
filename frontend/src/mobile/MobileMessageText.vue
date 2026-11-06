<script setup>
import {computed} from 'vue';
const props=defineProps({text:{type:String,default:''}});
const pieces=computed(()=>{const output=[];let start=0;for(const match of props.text.matchAll(/https?:\/\/[^\s<>]+/gi)){const url=match[0].replace(/[.,;!?)\]]+$/,'');output.push({text:props.text.slice(start,match.index)});output.push({text:url,url});start=match.index+url.length;}output.push({text:props.text.slice(start)});return output;});
</script>
<template><span><template v-for="(piece,index) in pieces" :key="index"><a v-if="piece.url" :href="piece.url" target="_blank" rel="noopener noreferrer">{{ piece.text }}</a><template v-else>{{ piece.text }}</template></template></span></template>
<style scoped>a{color:#245caa;text-decoration:underline;overflow-wrap:anywhere}</style>
