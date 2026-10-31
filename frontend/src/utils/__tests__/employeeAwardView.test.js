import { describe, expect, it } from 'vitest';
import { resolveAwardsAgencyId } from '../employeeAwardView';
const agencies=[{id:10,name:'Demo Playground',slug:'demo-playground'},{id:2,name:'Work Agency',portal_url:'work'},{id:6,name:'Second Agency',slug:'second'}];
describe('award agency selection',()=>{
 it('prefers the work portal over a saved demo or unrelated agency',()=>{
  expect(resolveAwardsAgencyId({agencies,currentId:10,portalSlug:'work'})).toBe('2');
  expect(resolveAwardsAgencyId({agencies,currentId:6,portalSlug:'work'})).toBe('2');
 });
 it('avoids an alphabetically first demo when the portal is unknown',()=>{
  expect(resolveAwardsAgencyId({agencies,currentId:10})).toBe('2');
 });
 it('preserves an explicit demo link or a window-scoped demo session',()=>{
  expect(resolveAwardsAgencyId({agencies,currentId:2,requestedId:10,portalSlug:'work'})).toBe('10');
  expect(resolveAwardsAgencyId({agencies,currentId:10,portalSlug:'work',demoSession:true})).toBe('10');
 });
 it('waits for memberships without falling back to another tenant in a demo session',()=>{
  expect(resolveAwardsAgencyId({agencies:[],currentId:10})).toBe('');
  expect(resolveAwardsAgencyId({agencies,currentId:99,demoSession:true})).toBe('');
 });
});
