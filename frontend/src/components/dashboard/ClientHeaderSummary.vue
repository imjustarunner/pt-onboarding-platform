<template>
  <dl class="client-header-summary" aria-label="Client at a glance">
    <div><dt>Next session</dt><dd>{{ date(snapshot?.nextAt) }}</dd></div>
    <div><dt>Last completed</dt><dd>{{ date(snapshot?.lastCompletedAt) }}</dd></div>
    <div><dt>{{ dependent ? 'Family messages' : 'Messages' }}</dt><dd>{{ !snapshot || snapshot.messagesUnavailable || snapshot.correspondenceUnavailable ? 'Not fully checked' : `${(snapshot.unreadFamilyMessages||0)+(snapshot.unreadCorrespondence||0)} unread` }}</dd></div>
  </dl>
</template>
<script setup>
import {computed} from 'vue';
import {useClientSessionSnapshots,sessionSnapshotKey,sessionDateLabel} from '../../composables/useClientSessionSnapshots.js';
const props=defineProps({client:{type:Object,required:true},providedSnapshot:Object,dependent:Boolean});
const provided=computed(()=>Number(props.providedSnapshot?.agencyId)===Number(props.client.agency_id)?props.providedSnapshot:null);
const clients=computed(()=>provided.value?[]:[props.client]);
const {snapshots}=useClientSessionSnapshots(clients);
const snapshot=computed(()=>provided.value||snapshots.value[sessionSnapshotKey(props.client)]);
const date=value=>snapshot.value?.unavailable?'Unavailable':sessionDateLabel(value);
</script>
<style scoped>
.client-header-summary{display:flex;flex-wrap:wrap;gap:10px 24px;margin:8px 0 0;flex:1 1 100%;font-size:13px}.client-header-summary>div{display:grid;gap:3px;min-width:125px}.client-header-summary dt{color:var(--text-secondary,#64748b);font-size:12px}.client-header-summary dd{margin:0;font-weight:650;color:var(--text-primary,#203b59)}
</style>
