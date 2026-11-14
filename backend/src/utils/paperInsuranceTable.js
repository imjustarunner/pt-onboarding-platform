// Vision's paragraph order can alternate the two insurance columns. Read the
// cells by their printed labels and coordinates instead of treating them as a list.
const labels = [
  ['Primary Insurance','primary','insurance'], ['Secondary Insurance','secondary','insurance'],
  ['Policy Holder','policy','holder'], ['Secondary Holder','secondary','holder'],
  ['Member ID','member','id'], ['Secondary ID','secondary','id'],
  ['Policy Group','policy','group'], ['Secondary Group','secondary','group']
];
const spanishLabels=[
  ['Primary Insurance','seguro primario'],['Secondary Insurance','seguro secundario'],
  ['Policy Holder','titular de la poliza'],['Secondary Holder','titular secundario'],
  ['Member ID','numero de identificacion de miembro'],['Secondary ID','numero de identificacion secundario'],
  ['Policy Group','numero de grupo de la poliza'],['Secondary Group','numero de grupo secundario']
].map(([label,text])=>[label,text.split(' ')]);
const token = text => text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z]/g,'');
export function paperInsuranceTableText(annotation) {
  for (const page of annotation?.pages || []) {
    const words=(page.blocks || []).flatMap(block=>(block.paragraphs || []).flatMap(paragraph=>(paragraph.words || []).map(word=>{
      // PDF/TIFF responses use normalizedVertices; image responses may use pixels.
      // https://docs.cloud.google.com/vision/docs/pdf
      const box=word.boundingBox || {};
      const vertices=box.vertices?.length ? box.vertices : (box.normalizedVertices || []).map(v=>({x:(v.x || 0)*(page.width || 1000),y:(v.y || 0)*(page.height || 1000)}));
      const x=vertices.map(v=>v.x || 0),y=vertices.map(v=>v.y || 0);
      return {text:(word.symbols || []).map(s=>s.text || '').join(''),left:Math.min(...x),right:Math.max(...x),top:Math.min(...y),bottom:Math.max(...y)};
    }))).filter(word=>word.text && Number.isFinite(word.left) && word.right>word.left && word.bottom>word.top);
    if (!words.length) continue;
    const originalOrder=[...words];
    const heights=words.map(w=>w.bottom-w.top).sort((a,b)=>a-b), tolerance=heights[Math.floor(heights.length/2)]*.7;
    const lines=[];
    for(const word of words.sort((a,b)=>(a.top+a.bottom)-(b.top+b.bottom))) {
      const center=(word.top+word.bottom)/2;
      const row=lines.find(line=>Math.abs(line.y-center)<=tolerance);
      if(row)row.words.push(word);else lines.push({y:center,words:[word]});
    }
    const found=[];
    // Multi-line Spanish labels remain consecutive inside Vision paragraphs.
    for(let i=0;i<originalOrder.length;i++)for(const [label,parts] of spanishLabels){
      const span=originalOrder.slice(i,i+parts.length);
      if(span.length!==parts.length || !parts.every((part,j)=>token(span[j].text)===part))continue;
      const top=Math.min(...span.map(w=>w.top)),bottom=Math.max(...span.map(w=>w.bottom));
      found.push({label,y:(top+bottom)/2,left:Math.min(...span.map(w=>w.left)),right:Math.max(...span.map(w=>w.right)),words:span});
    }
    for(const line of lines) {
      const row=line.words.sort((a,b)=>a.left-b.left);
      for(let i=0;i<row.length-1;i++) {
        const label=labels.find(([,a,b])=>token(row[i].text)===a && token(row[i+1].text)===b);
        if(label)found.push({label:label[0],y:line.y,left:row[i].left,right:row[i+1].right,words:[row[i],row[i+1]]});
      }
    }
    const primary=found.find(label=>label.label==='Primary Insurance'),secondary=found.find(label=>label.label==='Secondary Insurance');
    if(!primary || !secondary || secondary.left<=primary.right || Math.abs(primary.y-secondary.y)>tolerance)continue;
    const labelColumnBoundary=(primary.left+secondary.left)/2;
    const leftLabels=found.filter(label=>label.left<labelColumnBoundary && label.y>=primary.y-tolerance);
    const rightLabels=found.filter(label=>label.left>=labelColumnBoundary && label.y>=primary.y-tolerance);
    const rows=[...new Set(leftLabels.map(label=>label.y))].sort((a,b)=>a-b);
    if(rows.length<2)continue;
    const printedLabelWords=new Set(found.flatMap(label=>label.words));
    const result=[];
    for(const label of [...leftLabels,...rightLabels]) {
      const index=rows.findIndex(y=>Math.abs(y-label.y)<=tolerance);
      if(index<0)continue;
      const spacing=index>0?rows[index]-rows[index-1]:rows[1]-rows[0];
      const top=index>0?(rows[index-1]+rows[index])/2:rows[0]-spacing/2;
      const bottom=index<rows.length-1?(rows[index]+rows[index+1])/2:rows[index]+spacing/2;
      const isLeft=label.left<labelColumnBoundary;
      let values=words.filter(word=>!printedLabelWords.has(word) && (word.top+word.bottom)/2>top && (word.top+word.bottom)/2<bottom
        && (word.left+word.right)/2>label.right && (!isLeft || (word.left+word.right)/2<secondary.left));
      // Handwriting can produce a small duplicate fragment inside a recognized
      // member number. Keep the whole number rather than appending that fragment.
      if(['Member ID','Secondary ID'].includes(label.label))values=values.filter(word=>!values.some(other=>{
        if(other===word || other.text.replace(/\D/g,'').length<6 || other.text.length<=word.text.length*2)return false;
        const overlap=Math.max(0,Math.min(word.right,other.right)-Math.max(word.left,other.left))*Math.max(0,Math.min(word.bottom,other.bottom)-Math.max(word.top,other.top));
        return overlap/((word.right-word.left)*(word.bottom-word.top))>.6;
      }));
      const value=values.sort((a,b)=>a.left-b.left).map(w=>w.text).join(' ').replace(/^[#|:\s]+/,'').trim();
      result.push(`${label.label}: ${value}`);
    }
    return result.join('\n');
  }
  return '';
}
