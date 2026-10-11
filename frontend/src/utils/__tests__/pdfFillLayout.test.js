import {describe,it,expect} from 'vitest';
import {canFillOnDocument,pdfFieldWidgets,pdfFieldStyle} from '../pdfFillLayout';
describe('clickable PDF fields',()=>{
 it('converts saved PDF coordinates to exact page-relative overlay positions',()=>{
  const [field]=pdfFieldWidgets([{id:'name',type:'text',x:61.2,y:396,width:306,height:39.6,page:1}],2);
  const style=pdfFieldStyle(field,612,792);
  for(const [key,value] of Object.entries({left:10,top:45,width:50,height:5}))expect(parseFloat(style[key])).toBeCloseTo(value);
 });
 it('keeps radio choices together and respects their individual pages and positions',()=>{
  const fields=pdfFieldWidgets([{id:'choice',type:'radio',page:1,options:[{label:'A',value:'a',x:20,y:30},{label:'B',value:'b',x:40,y:50,page:2}]}],3);
  expect(fields.map(f=>[f.fieldId,f.option,f.page])).toEqual([['choice','a',1],['choice','b',2]]);
 });
 it('retains unmapped fields for the accessible supplemental form and supports legacy last-page mappings',()=>{
  expect(canFillOnDocument({x:null,y:10})).toBe(false);
  expect(canFillOnDocument({x:0,y:0})).toBe(true);
  expect(canFillOnDocument({type:'radio',options:[{x:10,y:null}]})).toBe(false);
  expect(pdfFieldWidgets([{id:'last',type:'text',x:1,y:2}],4)[0].page).toBe(4);
 });
});
