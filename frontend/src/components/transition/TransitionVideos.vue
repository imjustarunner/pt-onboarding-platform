<template>
  <section class="tw-videos">
    <div class="tw-heading"><div><p class="tw-eyebrow">Training library</p><h2>Show people how to do it</h2><p>Add your own videos, assign a creator, and remove suggestions you do not need.</p></div><button class="tw-primary" type="button" :disabled="dirty||busy" @click="adding=!adding">+ Add a video</button></div>
    <form v-if="adding" class="tw-video-form" @submit.prevent="add"><h3>New training video</h3><label>Title <input v-model="newVideo.title" maxlength="180" required /></label><label>What should it show? <textarea v-model="newVideo.outcome" maxlength="1000" rows="2" /></label><label>Due date <input v-model="newVideo.dueDate" type="date" required /></label><button class="tw-primary" :disabled="busy">Add to the list</button></form>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="tw-video-list"><article v-for="video in board.videoCatalog" :key="video.id" class="tw-video-row">
      <header><div class="tw-play" aria-hidden="true">▷</div><div><h3>{{ video.title }}</h3><p>{{ video.outcome }}</p><small>{{ video.minutes ? `About ${video.minutes} minutes · ` : '' }}{{ statusLabels[board.state.videos[video.id].status] }}</small></div><a v-if="safeUrl(board.state.videos[video.id].url)" :href="safeUrl(board.state.videos[video.id].url)" target="_blank" rel="noopener noreferrer" class="tw-watch">Watch video</a></header>
      <details><summary>Edit assignment, video link & progress</summary><fieldset :disabled="busy" @input="$emit('dirty')" @change="$emit('dirty')"><div class="tw-fields">
        <label>Who is making it? <input v-model="board.state.videos[video.id].owner" list="tw-staff-names" maxlength="120" /></label><label>Due <input v-model="board.state.videos[video.id].dueDate" type="date" /></label>
        <label>Progress <select v-model="board.state.videos[video.id].status"><option v-for="(label,status) in statusLabels" :key="status" :value="status">{{ label }}</option></select></label><label>Reviewer <input v-model="board.state.videos[video.id].reviewer" list="tw-staff-names" maxlength="120" /></label></div>
        <label>Video or training-page link <input v-model="board.state.videos[video.id].url" maxlength="2000" placeholder="https://… or /my-learning/…" /></label>
        <label>What was checked? <textarea v-model="board.state.videos[video.id].evidence" maxlength="1500" rows="2" placeholder="Use fictional clients. Have a second person check accuracy and privacy." /></label>
        <label>Next step <input v-model="board.state.videos[video.id].nextAction" maxlength="800" /></label>
      </fieldset><p v-if="board.state.videos[video.id].completedAt">Finished {{ new Date(board.state.videos[video.id].completedAt).toLocaleString('en-US',{timeZone:'America/Denver'}) }} Mountain Time.</p><button type="button" class="tw-text-danger" :disabled="dirty||busy" @click="remove(video)">Remove from this practice’s list</button></details>
    </article></div>
    <details v-if="board.removedVideos?.length"><summary>Removed suggestions ({{ board.removedVideos.length }})</summary><p v-for="video in board.removedVideos" :key="video.id">{{ video.title }} <button type="button" :disabled="dirty||busy" @click="change({operation:'restore',id:video.id})">Restore</button></p></details>
  </section>
</template>
<script setup>
import {ref} from 'vue';
import {safeTransitionVideoUrl as safeUrl} from './transitionPresentation';
const props=defineProps({board:Object,dirty:Boolean,busy:Boolean,mutate:Function});defineEmits(['dirty']);
const adding=ref(false),error=ref(''),newVideo=ref({title:'',outcome:'',dueDate:'2026-11-20'});
const statusLabels={not_started:'Not started',recording:'Recording',editing:'Editing',in_review:'Being reviewed',published:'Ready to watch',blocked:'Needs help'};
async function change(input){error.value='';try{await props.mutate({action:'video',...input});return true;}catch(e){error.value=e.response?.data?.error?.message||e.message;return false;}}
async function add(){if(await change({operation:'add',...newVideo.value})){adding.value=false;newVideo.value={title:'',outcome:'',dueDate:'2026-11-20'};}}
const remove=video=>change({operation:'remove',id:video.id});
</script>
