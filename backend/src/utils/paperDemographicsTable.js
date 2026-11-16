// Vision may read a form column before its handwritten answers. Associate intake
// cells by coordinates, on whichever PDF page contains the intake table.
const fields = [
 ['fullName',"Dependent's Name",'nombre del dependiente'],
 ['dateOfBirth',"Dependent's Date of Birth",'fecha de nacimiento del dependiente'],
 ['age',"Dependent's Age",'edad del dependiente'],
 ['administrativeSex',"Dependent's Sex",'sexo del dependiente'],
 ['grade',"Dependent's Grade",'grado del dependiente'],
 ['addressStreet',"Dependent's Address",'direccion del dependiente'],
 ['addressCity',"Dependent's City",'ciudad del dependiente'],
 ['addressState','State','estado'],['addressZip','Zip Code','codigo postal']
];
const token=value=>String(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z]/g,'').replace(/^dependent$/,'dependents');
function wordsOnPage(page) {
 return (page.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>(paragraph.words||[]).map(word=>{
  const box=word.boundingBox||{},vertices=box.vertices?.length?box.vertices:(box.normalizedVertices||[]).map(v=>({x:(v.x||0)*(page.width||1000),y:(v.y||0)*(page.height||1000)}));
  const xs=vertices.map(v=>v.x||0),ys=vertices.map(v=>v.y||0);
  return {text:(word.symbols||[]).map(s=>s.text||'').join(''),left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
 }))).filter(w=>w.text&&Number.isFinite(w.left)&&w.right>w.left&&w.bottom>w.top);
}
function matchPhrase(words,start,parts) {
 const height=start.bottom-start.top,span=[start];
 for(const part of parts.slice(1)) {
  const previous=span.at(-1);
  const candidates=words.filter(w=>!span.includes(w)&&token(w.text)===part&&w.left>=start.left-height&&w.right<=start.left+height*17
   && ((Math.abs((w.top+w.bottom-previous.top-previous.bottom)/2)<=height*.8&&w.left>=previous.right-height*.3&&w.left-previous.right<height*4)
    || (w.top>previous.top+height*.5&&w.top-previous.bottom<height*1.8&&Math.abs(w.left-start.left)<height*3)));
  candidates.sort((a,b)=>(Math.max(0,a.top-previous.top)*5+Math.abs(a.left-previous.right))-(Math.max(0,b.top-previous.top)*5+Math.abs(b.left-previous.right)));
  if(!candidates.length)return null;span.push(candidates[0]);
 }
 return span;
}
export function paperDemographicsTableText(annotation) {
 for(const page of annotation?.pages||[]) {
  const words=wordsOnPage(page),labels=[];
  for(const [key,english,spanish] of fields)for(const phrase of [english,spanish]) {
   const parts=phrase.split(' ').map(token);
   for(const start of words.filter(w=>token(w.text)===parts[0])) {
    const span=matchPhrase(words,start,parts);if(!span)continue;
    labels.push({key,label:phrase===english?english:spanish,words:span,left:Math.min(...span.map(w=>w.left)),right:Math.max(...span.map(w=>w.right)),top:Math.min(...span.map(w=>w.top)),bottom:Math.max(...span.map(w=>w.bottom))});
   }
  }
  if(!['fullName','dateOfBirth','addressStreet'].every(key=>labels.some(l=>l.key===key)))continue;
  const rows=[];
  for(const label of labels.sort((a,b)=>a.top-b.top)) {
   let row=rows.find(r=>label.top<r.bottom&&label.bottom>r.top);
   if(!row){row={top:label.top,bottom:label.bottom,labels:[]};rows.push(row);}
   row.top=Math.min(row.top,label.top);row.bottom=Math.max(row.bottom,label.bottom);row.labels.push(label);
  }
  rows.sort((a,b)=>a.top-b.top);
  const printed=new Set(labels.flatMap(l=>l.words)),result=[];
  for(let i=0;i<rows.length;i++) {
   const row=rows[i],height=row.bottom-row.top;
   const top=i?(rows[i-1].bottom+row.top)/2:row.top-height*.4;
   const bottom=i+1<rows.length?(row.bottom+rows[i+1].top)/2:row.bottom+height*.6;
   const ordered=row.labels.sort((a,b)=>a.left-b.left);
   for(let j=0;j<ordered.length;j++) {
    const label=ordered[j],right=ordered[j+1]?.left??Infinity;
    const answer=words.filter(w=>!printed.has(w)&&(w.left+w.right)/2>label.right&&(w.left+w.right)/2<right&&(w.top+w.bottom)/2>top&&(w.top+w.bottom)/2<bottom)
     .sort((a,b)=>Math.abs(a.top-b.top)>Math.min(a.bottom-a.top,b.bottom-b.top)*.7?a.top-b.top:a.left-b.left).map(w=>w.text).join(' ');
    result.push(`${label.label}: ${answer}`);
   }
  }
  return result.join('\n');
 }
 return '';
}
