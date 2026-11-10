/** Compare the saved suggestion with staff composition before automatic signatures.
 * Old external emails without a captured composition remain unknown. */
export function supportReplyEdits(row) {
 const before=row?.comparison?.generatedDraft;
 const after=row?.deliveries?.[0]?.composedBody ?? row?.comparison?.composedBody;
 if(typeof before!=='string'||typeof after!=='string')return null;
 if(before===after)return {changed:false,parts:[{kind:'same',text:after}]};
 const a=before.match(/\s+|[^\s]+/g)||[],b=after.match(/\s+|[^\s]+/g)||[];
 const parts=[];const add=(kind,text)=>{if(!text)return;if(parts.at(-1)?.kind===kind)parts.at(-1).text+=text;else parts.push({kind,text});};
 if((a.length+1)*(b.length+1)>250000){
  let start=0,end=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;
  while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  add('same',a.slice(0,start).join(''));add('removed',a.slice(start,a.length-end).join(''));add('added',b.slice(start,b.length-end).join(''));add('same',b.slice(b.length-end).join(''));
 }else{
  const width=b.length+1,cells=new Uint16Array((a.length+1)*width);
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)cells[i*width+j]=a[i]===b[j]?1+cells[(i+1)*width+j+1]:Math.max(cells[(i+1)*width+j],cells[i*width+j+1]);
  let i=0,j=0;while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){add('same',a[i]);i++;j++;}else if(i<a.length&&(j===b.length||cells[(i+1)*width+j]>=cells[i*width+j+1])){add('removed',a[i]);i++;}else{add('added',b[j]);j++;}}
 }
 return {changed:true,parts};
}
