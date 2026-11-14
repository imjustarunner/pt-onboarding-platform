<script setup>
import { computed, inject, watch } from 'vue';
import { COMMENT_BUTTON, COMMENT_ICON, commentApi, openSecureSessionComment, requestCommentBadge, secureCommentState } from './sessionComments';
const props = defineProps({ appointmentId: [Number, String], clientId: [Number, String], iconOnly: Boolean, disabled: Boolean, learning:Boolean });
const api = inject('secureSessionCommentsApi', commentApi);
const badge = computed(() => secureCommentState.badges[`${Number(props.appointmentId)}:${Number(props.clientId) || 0}`] || { count: 0, unreadCount: 0 });
watch(() => [props.appointmentId, props.clientId, secureCommentState.revision], () => { if (!props.disabled) requestCommentBadge(props.appointmentId, props.clientId, api); }, { immediate: true });
</script>
<template>
  <button v-if="!iconOnly || badge.count" type="button" class="aw-comment-button" :class="{ 'aw-comment-button--icon': iconOnly, 'aw-comment-button--unread': badge.unreadCount > 0, 'nlu-comment-button':learning }" :disabled="disabled" :aria-label="`${badge.unreadCount ? badge.unreadCount + ' unread. ' : ''}${learning?'Tutoring':'AuricWell'} secure session comments`" @click.stop="openSecureSessionComment(appointmentId, clientId)" @keydown.stop @pointerdown.stop>
    <span v-if="learning">{{iconOnly?'▤':'Session comments'}}</span><img v-else :src="iconOnly ? COMMENT_ICON : COMMENT_BUTTON" alt="" />
    <span v-if="badge.unreadCount" class="aw-comment-count">{{ badge.unreadCount }}<span class="aw-sr-only"> unread</span></span>
  </button>
</template>
<style scoped>
.aw-comment-button{position:relative;display:inline-flex;align-items:center;width:340px;max-width:100%;aspect-ratio:8/1;overflow:hidden;padding:0;border:0;border-radius:999px;background:transparent;cursor:pointer;vertical-align:middle}.aw-comment-button img{display:block;width:100%;height:auto;position:absolute;top:50%;left:0;transform:translateY(-50%)}.aw-comment-button--icon{width:32px;aspect-ratio:1;overflow:visible}.aw-comment-button--icon img{width:32px;height:32px;object-fit:contain}.aw-comment-button:focus-visible{outline:3px solid #d9a124;outline-offset:3px}.aw-comment-count{position:absolute;right:0;top:0;min-width:20px;padding:1px 4px;border-radius:20px;background:#f7bf33;color:#09204b;font-size:11px;font-weight:800}.aw-comment-button--unread.aw-comment-button--icon{animation:aw-secure-pulse 2s ease-in-out infinite}.aw-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}@keyframes aw-secure-pulse{50%{filter:drop-shadow(0 0 5px #e9b32a);transform:scale(1.07)}}@media(prefers-reduced-motion:reduce){.aw-comment-button--unread.aw-comment-button--icon{animation:none}}
</style>
<style scoped>.nlu-comment-button{width:auto;min-height:44px;aspect-ratio:auto;padding:10px 16px;border:1px solid #a9c7b9;border-radius:10px;background:#fff;color:#214f43;font:600 14px system-ui;overflow:visible}.nlu-comment-button--icon{padding:8px}.nlu-comment-button .aw-comment-count{top:-8px;right:-8px}</style>
