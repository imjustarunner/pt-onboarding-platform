import test from 'node:test';import assert from 'node:assert/strict';
import {paperInsuranceTableText} from '../paperInsuranceTable.js';
const word=(text,x,y,width=45)=>({symbols:[...text].map(text=>({text})),boundingBox:{vertices:[{x,y},{x:x+width,y},{x:x+width,y:y+10},{x,y:y+10}]}});
for(const coordinates of ['pixels','normalized'])test(`reads two labeled columns despite shuffled Vision paragraph order (${coordinates})`,()=>{
 const words=[];
 for(const [y,left,right,primary,secondary] of [[100,['Primary','Insurance'],['Secondary','Insurance'],'CHAMPVA','Colorado Medicaid'],[125,['Policy','Holder'],['Secondary','Holder'],'Taylor Example','Morgan Example'],[150,['Member','ID'],['Secondary','ID'],'000000000-00','A123456'],[175,['Policy','Group'],['Secondary','Group'],'','']]) {
  // Printed labels in the same column do not start at exactly the same x.
  const rightX=y===150?200:290;
  words.push(word(left[0],20,y),word(left[1],70,y),word(right[0],rightX,y,60),word(right[1],rightX+65,y));
  if(primary)words.push(word(primary,150,y,100));if(secondary)words.push(word(secondary,440,y,130));
 }
 words.push(word('xy',175,148,15));
 if(coordinates==='normalized')for(const w of words)w.boundingBox={normalizedVertices:w.boundingBox.vertices.map(v=>({x:v.x/700,y:v.y/300}))};
 const annotation={pages:[{width:700,height:300,blocks:[{paragraphs:words.reverse().map(w=>({words:[w]}))}]}]};
 const text=paperInsuranceTableText(annotation);
 assert.match(text,/Primary Insurance: CHAMPVA/);assert.match(text,/Secondary Insurance: Colorado Medicaid/);
 assert.match(text,/Policy Holder: Taylor Example/);assert.match(text,/Secondary Holder: Morgan Example/);
 assert.match(text,/Member ID: 000000000-00\n/);assert.match(text,/Secondary ID: A123456/);assert.doesNotMatch(text,/xy/);
});
test('leaves ambiguous or absent insurance grids for manual source review',()=>{
 assert.equal(paperInsuranceTableText({pages:[]}), '');
 assert.equal(paperInsuranceTableText({pages:[{blocks:[{paragraphs:[{words:[word('Insurance',10,10)]}]}]}]}),'');
});

test('maps multi-line Spanish insurance labels to the same primary and secondary cells',()=>{
 const items=[];const add=(text,x,y,width=80)=>{const parts=text.split(' ');for(let i=0;i<parts.length;i++)items.push(word(parts[i],x+(i%3)*28,y+Math.floor(i/3)*10,26));};
 for(const[y,left,right,primary,secondary]of[[100,'Seguro primario','Seguro secundario','CHAMPVA','Medicaid'],[135,'Titular de la póliza','Titular secundario','Demo Parent','Demo Other'],[180,'Número de identificación de miembro','Número de identificación secundario','000000000-00','A123456'],[230,'Número de grupo de la póliza','Número de grupo secundario','','']]){
  add(left,20,y);if(primary)items.push(word(primary,160,y+7,100));add(right,300,y);if(secondary)items.push(word(secondary,440,y+7,120));
 }
 const annotations={pages:[{width:700,height:300,blocks:[{paragraphs:[{words:items}]}]}]};const text=paperInsuranceTableText(annotations);
 assert.match(text,/Primary Insurance: CHAMPVA/);assert.match(text,/Secondary Insurance: Medicaid/);assert.match(text,/Policy Holder: Demo Parent/);assert.match(text,/Member ID: 000000000-00/);assert.match(text,/Secondary ID: A123456/);
});
test('keeps inline carrier values when a different row has a longer printed label',()=>{
 const words=[];const add=(label,x,y)=>{for(const part of label.split(' ')){const width=part.length*5;words.push(word(part,x,y,width));x+=width+4;}return x;};
 for(const[y,left,right,value,value2]of[[100,'Seguro primario','Seguro secundario','CHAMPVA','Colorado Medicaid'],[130,'Titular de la póliza','Titular secundario','Demo Parent','Demo Other'],[160,'Número de identificación de miembro','Número de identificación secundario','000000000-00','A123456']]){
  const x=add(left,20,y);words.push(word(value,x+4,y,value.length*5));const x2=add(right,420,y);words.push(word(value2,x2+4,y,value2.length*5));
 }
 const text=paperInsuranceTableText({pages:[{blocks:[{paragraphs:[{words}]}]}]});assert.match(text,/Primary Insurance: CHAMPVA/);assert.match(text,/Secondary Insurance: Colorado Medicaid/);assert.match(text,/Member ID: 000000000-00/);
});
