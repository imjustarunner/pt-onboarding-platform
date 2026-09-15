<template><span class="website-chat-message"><template v-for="(part,i) in parts" :key="i"><a v-if="/^https?:\/\//i.test(part)" :href="part" target="_blank" rel="noopener noreferrer">{{part}}</a><template v-else>{{part}}</template></template></span></template>
<script setup>
import {computed} from 'vue';
const props=defineProps({body:{type:String,default:''}});
const parts=computed(()=>props.body.split(/(https?:\/\/[^\s<>"']+)/gi));
</script>
<style scoped>.website-chat-message{white-space:pre-wrap;overflow-wrap:anywhere}.website-chat-message a{color:#086aa0;text-decoration:underline}</style>
