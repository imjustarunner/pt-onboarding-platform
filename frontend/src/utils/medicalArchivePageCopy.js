import {PDFDocument} from 'pdf-lib';
/** Optional, explicitly reviewed smaller page copy. All processing stays in this browser. */
export async function renderSmallerMedicalPage(bytes,pageNumber,maxBytes){
 const pdfjs=await import('pdfjs-dist');
 const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
 pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
 const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false});
 let pdf,page,canvas;
 try{
  pdf=await task.promise;page=await pdf.getPage(pageNumber);
  const original=page.getViewport({scale:1});
  if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0)throw Error('This PDF page has an unreadable size. Export the page again from the previous EHR.');
  for(const dpi of [300,200,150]){
   const scale=Math.min(dpi/72,16000/Math.max(original.width,original.height),Math.sqrt(32_000_000/(original.width*original.height)));
   const viewport=page.getViewport({scale});canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('This browser could not prepare a smaller PDF copy.');
   await page.render({canvasContext:context,viewport,background:'white'}).promise;
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
   if(!blob)throw Error('This browser could not encode the page image.');
   const result=await PDFDocument.create();result.setCreationDate(new Date('2000-01-01T00:00:00Z'));result.setModificationDate(new Date('2000-01-01T00:00:00Z'));const image=await result.embedJpg(await blob.arrayBuffer());
   result.addPage([original.width,original.height]).drawImage(image,{x:0,y:0,width:original.width,height:original.height});
   const output=await result.save();canvas.width=0;canvas.height=0;canvas=null;
   if(output.length<=maxBytes)return output;
  }
  throw Error(`Page ${pageNumber} still exceeds the upload limit. Export this page separately at a smaller size; other saved history volumes stay on the chart.`);
 }finally{if(canvas){canvas.width=0;canvas.height=0;}page?.cleanup?.();await(pdf?.destroy?.()||task.destroy?.());}
}
