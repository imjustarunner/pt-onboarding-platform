<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ appointmentId: [Number, String], userId: [Number, String], startAt: String, self: Boolean });
const dismissed = ref(false);
const key = computed(() => `aw-session-comment-tip:${props.userId}:${props.appointmentId}`);
const visible = computed(() => { const raw = props.startAt || ''; const start = +new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z'); if (dismissed.value || !props.userId || !Number.isFinite(start) || start <= Date.now()) return false; try { return localStorage.getItem(key.value) !== 'dismissed'; } catch { return true; } });
function dismiss() { dismissed.value = true; try { localStorage.setItem(key.value, 'dismissed'); } catch { /* Local preference is optional. */ } }
</script>
<template><aside v-if="visible" class="aw-comment-tip"><button type="button" aria-label="Dismiss secure session comment tip" @click="dismiss">×</button><strong>Have something to share before your session?</strong><p>{{ self ? 'Add a secure comment, such as “I’d like to talk about how my week went” or “Remind me to bring my journal.”' : 'Add a secure comment for the provider, such as “My child has had a difficult week” or “Please remind us to bring the practice chart.”' }} Use the AuricWell Secure Session Comment button. Eligible family portal users and the assigned provider can review and reply securely.</p></aside></template>
<style scoped>.aw-comment-tip{padding:14px 18px;margin:14px 0;background:#f0f6ff;border:1px solid #cdddf0;border-radius:12px;color:#18375d;font-size:14px}.aw-comment-tip p{margin:6px 0}.aw-comment-tip button{float:right;border:0;background:transparent;font-size:22px;cursor:pointer;color:#18375d}</style>
