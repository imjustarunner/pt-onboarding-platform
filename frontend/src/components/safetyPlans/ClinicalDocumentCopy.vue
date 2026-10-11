<template><button type="button" @click="printCopy">Print a client copy</button><p v-if="error" role="alert">{{ error }}</p></template>
<script setup>
import {ref} from 'vue';
const props=defineProps({documentElement:Function,attendance:Boolean});
const error=ref('');
function printCopy(){
 const source=props.documentElement?.();if(!source)return;
 const frame=document.createElement('iframe');frame.title='Print clinical document';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;left:0;border:0;';
 document.body.appendChild(frame);
 const doc=frame.contentDocument;
 const content=source.cloneNode(true);
 if(props.attendance){for(const child of [...content.children])if(!['HEADER','FOOTER'].includes(child.tagName)&&!child.classList.contains('attendance-letter')&&!child.querySelector('.signature-receipt'))child.remove();}
 // Copy only rendered read-only content; no record data goes into a URL or browser storage.
 doc.open();doc.write('<!doctype html><html><head><title>Clinical document copy</title><meta name="referrer" content="no-referrer"><style>body{font:14px Arial,sans-serif;color:#223a33;padding:24px}header{display:flex;gap:20px;align-items:center;border-bottom:3px solid #175b48;padding-bottom:20px}header img{max-width:100px;max-height:90px}header .auricwell-brand{margin-left:auto;font-size:12px}header .auricwell-brand img{width:24px;height:24px}section{border-top:1px solid #ddd;padding:14px 0}label,.plan-basics>label{display:block;margin:12px 0;font-weight:bold}label p,label span{display:block;font-weight:normal;white-space:pre-wrap}p{line-height:1.6}.signature-receipt img{max-width:240px;max-height:80px}.contact-row{margin:12px 0;padding:8px;border:1px solid #ddd}footer{font-size:11px;margin-top:20px}.crisis{padding:16px;background:#f6f2e8}h3{break-after:avoid}.signature-receipt{break-inside:avoid}@page{margin:18mm}</style></head><body></body></html>');doc.close();doc.body.appendChild(content);
 const finish=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch{error.value='Printing is unavailable in this browser. Use the secure portal copy.';}finally{setTimeout(()=>frame.remove(),60000);}};
 Promise.all([...doc.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;setTimeout(resolve,3000);}))).then(finish);
}
</script>

<style scoped>button{font:inherit;padding:10px 16px;background:white;color:#175b48;border:1px solid #acbeb2;border-radius:7px;cursor:pointer;margin:12px 0}[role=alert]{color:#922d23}</style>
