<template>
 <div class="directory-share" @mouseenter="hover=true" @mouseleave="hover=false" @focusin="hover=true" @focusout="hover=false">
  <button type="button" :aria-expanded="open||hover||externalOpen" @click="open=!open">Share / QR code</button>
  <div v-show="open||hover||externalOpen" class="share-panel"><strong>Share {{ name }}</strong>
   <label>Link to<select v-model="target"><option value="find">Find a provider</option><option value="join">New provider enrollment</option></select></label>
   <img v-if="qr" :src="qr" alt="QR code for the selected directory link" width="190" height="190" />
   <a :href="link">{{ link }}</a><button type="button" @click="copy">{{ copied?'Copied':'Copy link' }}</button><button type="button" @click="download">Download printable PDF</button>
   <p v-if="error" role="alert">{{ error }}</p>
  </div>
 </div>
</template>
<script setup>
import {ref,computed,watch} from 'vue';import QRCode from 'qrcode';import {PDFDocument,StandardFonts,rgb,pushGraphicsState,popGraphicsState,rectangle,clip,endPath} from 'pdf-lib';
import {LATINX_ARTWORK,LATINX_BOARD_SIZE} from './latinxBrand';
const props=defineProps({url:String,name:String,directorySlug:String,externalOpen:Boolean,defaultTarget:{type:String,default:'find'}});const open=ref(false),hover=ref(false),target=ref(props.defaultTarget),qr=ref(''),copied=ref(false),error=ref('');
const link=computed(()=>`${props.url}${target.value==='join'?'/join':''}`);
watch(link,async v=>{if(v)qr.value=await QRCode.toDataURL(v,{width:600,margin:2,errorCorrectionLevel:'M'});},{immediate:true});
async function copy(){try{await navigator.clipboard.writeText(link.value);copied.value=true;}catch{error.value='Select the link above to copy it.';}}
async function download(){try{
 const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 page.drawRectangle({x:0,y:540,width:612,height:252,color:rgb(.98,.86,.39)});
 const title=String(props.name||'Provider directory').replace(/[^\x20-\x7E]/g,'');
 let titleX=46,titleWidth=520;
 if(props.directorySlug==='latinx') {
  const art=LATINX_ARTWORK.printLogo;
  const response=await fetch(art.source);
  if(!response.ok)throw new Error('Brand artwork could not be loaded');
  const image=await pdf.embedPng(await response.arrayBuffer());
  const x=46,y=667,width=142,scale=width/art.width,height=art.height*scale;
  page.pushOperators(pushGraphicsState(),rectangle(x,y,width,height),clip(),endPath());
  page.drawImage(image,{x:x-art.x*scale,y:y-(LATINX_BOARD_SIZE.height-art.y-art.height)*scale,width:LATINX_BOARD_SIZE.width*scale,height:LATINX_BOARD_SIZE.height*scale});
  page.pushOperators(popGraphicsState());
  titleX=210;titleWidth=356;
 }
 const size=Math.min(26,titleWidth/bold.widthOfTextAtSize(title,1));page.drawText(title,{x:titleX,y:704,size,font:bold,color:rgb(.34,.07,.31)});
 page.drawText(target.value==='join'?'Build your provider profile':'Find care that understands you',{x:46,y:644,size:24,font:bold,color:rgb(.34,.07,.31)});
 page.drawText(target.value==='join'?'Create an account. Share your experience. Submit for review.':'Explore providers by state, language, specialty and care type.',{x:46,y:605,size:13,font});
 const png=await pdf.embedPng(qr.value);page.drawImage(png,{x:176,y:264,width:260,height:260});
 page.drawText('Scan to get started',{x:207,y:224,size:20,font:bold});
 const urlSize=Math.min(12,520/font.widthOfTextAtSize(link.value,1));page.drawText(link.value,{x:46,y:176,size:urlSize,font});
 page.drawText('A nationwide provider directory',{x:46,y:95,size:15,font});
 const blob=new Blob([await pdf.save()],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${target.value==='join'?'provider-enrollment':'find-a-provider'}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch{error.value='The PDF could not be created. Please try again.';}}
</script>
<style scoped>
.directory-share{position:relative}.share-panel{position:absolute;right:0;top:100%;z-index:30;width:min(310px,85vw);padding:20px;background:#fff;box-shadow:0 12px 45px #29143030;border:1px solid #e1d6e5;border-radius:14px;display:grid;gap:12px;color:#302337}.share-panel img{margin:auto}.share-panel a{overflow-wrap:anywhere;font-size:12px}.share-panel label{display:grid;gap:5px}
</style>
