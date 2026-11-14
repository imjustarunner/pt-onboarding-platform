// Vision's paragraph order can alternate the two insurance columns. Read the
// cells by their printed labels and coordinates instead of treating them as a list.
const labels = [
  ['Primary Insurance','primary','insurance'], ['Secondary Insurance','secondary','insurance'],
  ['Policy Holder','policy','holder'], ['Secondary Holder','secondary','holder'],
  ['Member ID','member','id'], ['Secondary ID','secondary','id'],
  ['Policy Group','policy','group'], ['Secondary Group','secondary','group']
];
const token = text => text.toLowerCase().replace(/[^a-z]/g,'');
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
    const heights=words.map(w=>w.bottom-w.top).sort((a,b)=>a-b), tolerance=heights[Math.floor(heights.length/2)]*.7;
    const lines=[];
    for(const word of words.sort((a,b)=>(a.top+a.bottom)-(b.top+b.bottom))) {
      const center=(word.top+word.bottom)/2;
      const row=lines.find(line=>Math.abs(line.y-center)<=tolerance);
      if(row)row.words.push(word);else lines.push({y:center,words:[word]});
    }
    const found=[];
    for(const line of lines) {
      const row=line.words.sort((a,b)=>a.left-b.left);
      for(let i=0;i<row.length-1;i++) {
        const label=labels.find(([,a,b])=>token(row[i].text)===a && token(row[i+1].text)===b);
        if(label)found.push({label:label[0],y:line.y,left:row[i].left,right:row[i+1].right});
      }
    }
    const primary=found.find(label=>label.label==='Primary Insurance'),secondary=found.find(label=>label.label==='Secondary Insurance');
    if(!primary || !secondary || secondary.left<=primary.right || Math.abs(primary.y-secondary.y)>tolerance)continue;
    const labelColumnBoundary=(primary.left+secondary.left)/2;
    const leftLabels=found.filter(label=>label.left<labelColumnBoundary && label.y>=primary.y-tolerance);
    const rightLabels=found.filter(label=>label.left>=labelColumnBoundary && label.y>=primary.y-tolerance);
    const rows=[...new Set(leftLabels.map(label=>label.y))].sort((a,b)=>a-b);
    if(rows.length<2)continue;
    const leftValue=Math.max(...leftLabels.map(label=>label.right)),rightValue=Math.max(...rightLabels.map(label=>label.right));
    const result=[];
    for(const label of [...leftLabels,...rightLabels]) {
      const index=rows.findIndex(y=>Math.abs(y-label.y)<=tolerance);
      if(index<0)continue;
      const spacing=index>0?rows[index]-rows[index-1]:rows[1]-rows[0];
      const top=index>0?(rows[index-1]+rows[index])/2:rows[0]-spacing/2;
      const bottom=index<rows.length-1?(rows[index]+rows[index+1])/2:rows[index]+spacing/2;
      const isLeft=label.left<labelColumnBoundary;
      const values=words.filter(word=>(word.top+word.bottom)/2>top && (word.top+word.bottom)/2<bottom
        && (word.left+word.right)/2>(isLeft?leftValue:rightValue) && (!isLeft || (word.left+word.right)/2<secondary.left));
      const value=values.sort((a,b)=>a.left-b.left).map(w=>w.text).join(' ').replace(/^[#|:\s]+/,'').trim();
      result.push(`${label.label}: ${value}`);
    }
    return result.join('\n');
  }
  return '';
}
