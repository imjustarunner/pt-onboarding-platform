<template>
  <details class="provider-card">
    <summary>
      <img v-if="provider?.photoUrl && !failed" :src="provider.photoUrl" :alt="`${name}, your provider`" @error="failed=true" />
      <span v-else class="provider-initials" aria-hidden="true">{{ initials }}</span>
      <span class="provider-copy"><small>Your provider</small><strong>{{ name }}<span v-if="provider?.credential">, {{ provider.credential }}</span></strong><span v-if="provider?.title">{{ provider.title }}</span><span class="profile-toggle"><span class="profile-open">View profile</span><span class="profile-close">Close profile</span></span></span>
      <span class="profile-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="provider-profile">
      <p v-if="agencyName" class="profile-agency">{{ agencyName }}</p>
      <p v-if="provider?.bio" class="profile-bio">{{ provider.bio }}</p>
      <p v-else>Welcome to {{ name }}’s virtual office. Make yourself comfortable while you wait for your visit.</p>
      <p v-if="provider?.languages?.length"><strong>Languages</strong><br />{{ provider.languages.join(' · ') }}</p>
    </div>
  </details>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
const props=defineProps({provider:Object,displayName:String,agencyName:String});
const failed=ref(false),name=computed(()=>props.provider?.name || props.displayName || 'Your provider');
const initials=computed(()=>name.value.split(/\s+/).slice(0,2).map(part=>part[0]).join(''));
watch(()=>props.provider?.photoUrl,()=>failed.value=false);
</script>
<style scoped>
.provider-card{background:#fff;border:1px solid #dce5ed;border-radius:18px;color:#213449;overflow:hidden;box-shadow:0 8px 30px #122e4f08}.provider-card summary{display:flex;align-items:center;gap:16px;padding:20px;cursor:pointer;list-style:none}.provider-card summary::-webkit-details-marker{display:none}.provider-card summary:focus-visible{outline:3px solid #aa8738;outline-offset:-4px}.provider-card img,.provider-initials{width:68px;height:68px;flex-shrink:0;border-radius:50%;object-fit:cover}.provider-initials{display:grid;place-items:center;background:#eaf1f7;color:#244b76;font-size:23px}.provider-copy{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:13px;color:#5c7084}.provider-copy>small{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#7b6b48}.provider-copy>strong{font-size:17px;color:#213449;overflow-wrap:anywhere}.profile-toggle{color:#245e96;font-size:12px;margin-top:4px}.profile-chevron{margin-left:auto;color:#6f8295}.profile-close,details[open] .profile-open{display:none}details[open] .profile-close{display:inline}details[open] .profile-chevron{transform:rotate(180deg)}.provider-profile{padding:0 22px 20px;font-size:14px;line-height:1.65}.provider-profile p{margin:12px 0 0}.profile-agency{color:#6b7f90;font-weight:600}.profile-bio{white-space:pre-line;overflow-wrap:anywhere}
</style>
