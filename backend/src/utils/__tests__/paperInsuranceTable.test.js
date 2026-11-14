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
