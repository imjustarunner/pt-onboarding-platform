<template>
  <figure class="pl-real-example">
    <button class="pl-example-open" :aria-label="`Enlarge ${title} example`" @click="dialog.showModal()"><img :src="src" :alt="`${title}: actual application screen with fictional example records`" width="1440" height="1000" :loading="eager?'eager':'lazy'"><span aria-hidden="true">View actual screen ↗</span></button>
    <figcaption>{{ title }} · actual product screen, sample records</figcaption>
    <dialog ref="dialog" class="pl-example-dialog" @click="closeBackdrop">
      <header><div><strong>{{ title }}</strong><p>Captured from the application. Names and records are fictional.</p></div><button autofocus aria-label="Close product example" @click="dialog.close()">×</button></header>
      <img :src="src" :alt="`${title}, full-size actual product example`" width="1440" height="1000">
      <a :href="src" target="_blank" rel="noopener noreferrer">Open full-resolution screen ↗</a>
    </dialog>
  </figure>
</template>
<script setup>
import {computed,ref} from 'vue';
import {plotlineExampleUrl} from '../../utils/plotlineExamples';
const props=defineProps({screen:{type:String,required:true},title:{type:String,required:true},eager:Boolean});
const dialog=ref(null),src=computed(()=>plotlineExampleUrl(props.screen));
function closeBackdrop(event){if(event.target!==dialog.value)return;const rect=dialog.value.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.value.close();}
</script>
<style scoped>
.pl-real-example{margin:0;min-width:0}.pl-example-open{display:block;position:relative;width:100%;padding:0;border:1px solid #d1dace;border-radius:12px;background:#fff;overflow:hidden;text-align:left}.pl-example-open>img{display:block;width:100%;height:auto;aspect-ratio:1.44;object-fit:contain}.pl-example-open>span{position:absolute;right:10px;bottom:10px;padding:7px 10px;border-radius:30px;color:#fff;background:#143b2f;font:11px 'Plotline Inter',sans-serif;box-shadow:0 1px 8px #0002}.pl-example-open:hover{outline:2px solid #8f6651;outline-offset:3px}.pl-real-example figcaption{font:10px/1.6 'Plotline Inter',sans-serif;padding-top:10px}.pl-example-dialog{border:1px solid #bdc9be;border-radius:16px;padding:20px;width:min(1320px,94vw);max-height:94vh;color:#153529;background:#faf8f4;box-sizing:border-box}.pl-example-dialog::backdrop{background:#071d18b8}.pl-example-dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:14px;text-align:left}.pl-example-dialog header p{font-size:12px;margin:6px 0}.pl-example-dialog header button{border:1px solid #b1beb3;background:#fff;border-radius:50%;width:38px;height:38px;font-size:25px;flex:none}.pl-example-dialog>img{width:100%;height:auto;max-height:73vh;object-fit:contain;background:#f8faf9}.pl-example-dialog>a{display:inline-block;margin-top:14px;font-size:12px;color:#264c36}@media(max-width:600px){.pl-example-dialog{padding:14px;width:96vw}.pl-example-dialog header p{font-size:11px}.pl-example-open>span{font-size:9px;padding:5px 8px}}
</style>
