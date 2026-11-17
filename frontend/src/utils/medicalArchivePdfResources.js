import {PDFArray,PDFDict,PDFName,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
const name=PDFName.of;
const MAX_CONTENT_BYTES=16*1024*1024;
function contentNames(context,value){
 const resolved=context.lookup(value),streams=resolved instanceof PDFArray?resolved.asArray().map(item=>context.lookup(item)):[resolved];
 const used=new Set();
 for(const stream of streams){
  if(!stream)continue;
  if(!(stream instanceof PDFRawStream))return null;
  const bytes=decodePDFRawStream(stream).getBytes(MAX_CONTENT_BYTES+1);
  if(bytes.length>MAX_CONTENT_BYTES)return null;
  if(bytes.some(byte=>byte>127))return null;
  const text=new TextDecoder('latin1').decode(bytes);
  // Over-collecting names in strings/comments keeps extra resources, never deletes a used one.
  for(const match of text.matchAll(/\/([^\s\x00()<>\[\]{}\/%]+)/g))used.add(match[1].replace(/#([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))));
  // Inline images may contain binary resource references; leave those pages intact.
  if(/(?:^|\s)BI(?:\s|$)/.test(text))return null;
 }
 return used;
}
/** Remove only unused entries in a page's shared XObject dictionary. Keep all font/graphics resources. */
export function compactMedicalPdf(source){
 const context=source.context;
 let optimizedPages=0,compressedStreams=0;
 for(const page of source.getPages()){
  try{
   const annotations=page.node.Annots();if(annotations?.size())continue;
   const resources=page.node.Resources(),objects=resources?.lookupMaybe(name('XObject'),PDFDict);
   if(!objects)continue;
   const used=contentNames(context,page.node.Contents());if(!used)continue;
   const visited=new Set();
   const includeInheritedFormNames=(names,depth=0)=>{
    if(depth>32)return false;
    for(const [key,ref]of objects.entries()){
     if(!names.has(key.decodeText())||visited.has(ref))continue;
     visited.add(ref);const object=context.lookup(ref);
     if(object instanceof PDFRawStream&&object.dict.lookupMaybe(name('Subtype'),PDFName)===name('Form')&&!object.dict.has(name('Resources'))){
      const inherited=contentNames(context,object);if(!inherited)return false;
      for(const entry of inherited)used.add(entry);
      if(!includeInheritedFormNames(used,depth+1))return false;
     }
    }
    return true;
   };
   if(!includeInheritedFormNames(used))continue;
   const kept=objects.entries().filter(([key])=>used.has(key.decodeText()));
   if(kept.length===objects.entries().length)continue;
   const nextObjects=PDFDict.withContext(context);for(const[key,value]of kept)nextObjects.set(key,value);
   const nextResources=resources.clone(context);nextResources.set(name('XObject'),nextObjects);page.node.set(name('Resources'),nextResources);optimizedPages++;
  }catch{/* Unrecognized PDF structures retain all original resources. */}
 }
 for(const[ref,object]of context.enumerateIndirectObjects()){
  if(!(object instanceof PDFRawStream)||object.dict.has(name('Filter'))||object.dict.has(name('DecodeParms'))||object.contents.length<1024)continue;
  const entries=Object.fromEntries(object.dict.entries().filter(([key])=>key!==name('Length')).map(([key,value])=>[key.decodeText(),value]));
  const compressed=context.flateStream(object.contents,entries);
  if(compressed.contents.length<object.contents.length){context.assign(ref,compressed);compressedStreams++;}
 }
 return {optimizedPages,compressedStreams};
}
