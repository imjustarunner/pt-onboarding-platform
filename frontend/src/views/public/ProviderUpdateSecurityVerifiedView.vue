<template><main class="verification"><h1>Return to your Provider Update</h1><p>Your sign-in window is ready. Return to the update and choose “I’ve verified — load setup here” to create your password or passkey.</p><button type="button" @click="finish">Return to update</button></main></template>
<script setup>
function finish(){if(window.opener){window.opener.postMessage({type:'provider-update-account-verified'},window.location.origin);window.close();}}
import {onMounted} from 'vue';onMounted(finish);
</script><style scoped>.verification{max-width:600px;margin:10vh auto;padding:24px;line-height:1.6}button{padding:12px;font:inherit}</style>
