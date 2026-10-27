import {describe,it,expect} from 'vitest';
import {normalizePhoneExtension,staffWorkPhone} from '../staffWorkContact.js';
describe('canonical staff work contacts',()=>{
 it.each([['Ext. 742','742'],['Ext. Ext. 007','007'],['extension: 012','012'],['x204','204'],['204','204'],[0,'0'],[null,null],['',null],[' Ext. ',null]])('normalizes %s without losing leading zeros', (input,expected)=>{
  expect(normalizePhoneExtension(input)).toBe(expected);
  expect(normalizePhoneExtension(normalizePhoneExtension(input))).toBe(expected);
 });
 it('uses the selected organization main line even when a staff member has a separate line',()=>{
  expect(staffWorkPhone({slug:'ITSCO'},'303-555-0100')).toBe('719-657-7444');
  expect(staffWorkPhone({slug:'nlu'},'303-555-0100')).toBe('719-377-6577');
  expect(staffWorkPhone({slug:'other'},'303-555-0100')).toBe('303-555-0100');
  expect(staffWorkPhone({slug:'other',phone_number:'303-555-0200'},null)).toBe('303-555-0200');
 });
});
