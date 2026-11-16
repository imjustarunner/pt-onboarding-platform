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
 const original=(page.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>(paragraph.words||[]).map(word=>{
  const box=word.boundingBox||{},vertices=box.vertices?.length?box.vertices:(box.normalizedVertices||[]).map(v=>({x:(v.x||0)*(page.width||1000),y:(v.y||0)*(page.height||1000)}));
  return {text:(word.symbols||[]).map(s=>s.text||'').join(''),vertices};
 }))).filter(w=>w.text&&w.vertices.length===4);
 // Use oriented word boxes before grouping rows. Even a small scan tilt moves
 // the answers at the right of a table into the next row in page coordinates.
 const angles=original.filter(w=>token(w.text).length>=3).map(w=>Math.atan2((w.vertices[1].y||0)-(w.vertices[0].y||0),(w.vertices[1].x||0)-(w.vertices[0].x||0))).sort((a,b)=>a-b);
 const angle=angles[Math.floor(angles.length/2)]||0,cos=Math.cos(angle),sin=Math.sin(angle);
 return original.map(w=>{
  const points=w.vertices.map(v=>({x:(v.x||0)*cos+(v.y||0)*sin,y:-(v.x||0)*sin+(v.y||0)*cos}));
  const xs=points.map(v=>v.x),ys=points.map(v=>v.y);
  return {text:w.text,left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
 }).filter(w=>Number.isFinite(w.left)&&w.right>w.left&&w.bottom>w.top);
}
function matchPhrase(words,start,parts) {
 const height=start.bottom-start.top,target=parts.join('');
 function extend(span,joined){
  if(joined===target)return span;
  if(!target.startsWith(joined)||span.length>parts.length+3)return null;
  const previous=span.at(-1);
  const candidates=words.filter(w=>!span.includes(w)&&token(w.text)&&target.startsWith(joined+token(w.text))&&w.left>=start.left-height&&w.right<=start.left+height*25
   && ((Math.abs((w.top+w.bottom-previous.top-previous.bottom)/2)<=height*.8&&w.left>=previous.right-height*.3&&w.left-previous.right<height*4)
    || (w.top>previous.top+height*.5&&w.top-previous.bottom<height*1.8&&Math.abs(w.left-start.left)<height*4)));
  candidates.sort((a,b)=>(Math.max(0,a.top-previous.top)*5+Math.abs(a.left-previous.right))-(Math.max(0,b.top-previous.top)*5+Math.abs(b.left-previous.right)));
  for(const word of candidates){const match=extend([...span,word],joined+token(word.text));if(match)return match;}
  return null;
 }
 return extend([start],token(start.text));
}
export function paperDemographicsTableText(annotation) {
 for(const page of annotation?.pages||[]) {
  const words=wordsOnPage(page),labels=[];
  for(const [key,english,spanish] of fields)for(const phrase of [english,spanish]) {
   const parts=phrase.split(' ').map(token);
   for(const start of words.filter(w=>parts.join('').startsWith(token(w.text))&&token(w.text).length>=3)) {
    const span=matchPhrase(words,start,parts);if(!span)continue;
    labels.push({key,label:phrase===english?english:spanish,words:span,left:Math.min(...span.map(w=>w.left)),right:Math.max(...span.map(w=>w.right)),top:Math.min(...span.map(w=>w.top)),bottom:Math.max(...span.map(w=>w.bottom))});
   }
  }
  // Left-hand labels anchor rows; wrapped labels in the age/grade columns must
  // not join two adjacent rows or shift every handwritten answer below them.
  const coreKeys=['fullName','dateOfBirth','administrativeSex','addressStreet','addressCity'];
  const anchors=labels.filter(l=>coreKeys.includes(l.key));
  const origin=anchors.find(l=>anchors.filter(other=>Math.abs(other.left-l.left)<(l.bottom-l.top)*2).length>=3);
  if(!origin)continue;
  const rows=anchors.filter(l=>Math.abs(l.left-origin.left)<(origin.bottom-origin.top)*2)
   .sort((a,b)=>a.top-b.top).filter((l,i,all)=>all.findIndex(other=>other.key===l.key)===i)
   .map(label=>({top:label.top,bottom:label.bottom,labels:[label]}));
  if(rows.length<3||!rows.some(r=>['fullName','dateOfBirth'].includes(r.labels[0].key))||!rows.some(r=>['addressStreet','addressCity'].includes(r.labels[0].key)))continue;
  rows.sort((a,b)=>a.top-b.top);
  const printed=new Set(labels.flatMap(l=>l.words)),result=[];
  for(let i=0;i<rows.length;i++) {
   const row=rows[i],height=row.bottom-row.top;
   const top=i?Math.max((rows[i-1].bottom+row.top)/2,row.top-height):row.top-height*.4;
   const bottom=i+1<rows.length?Math.min((row.bottom+rows[i+1].top)/2,row.bottom+height*.8):row.bottom+height*.8;
   for(const label of labels){const center=(label.top+label.bottom)/2;if(!coreKeys.includes(label.key)&&center>top&&center<bottom&&!row.labels.some(l=>l.key===label.key))row.labels.push(label);}
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
