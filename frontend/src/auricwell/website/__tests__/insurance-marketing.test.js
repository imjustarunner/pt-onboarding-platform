import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import InsuranceShowcase from '../InsuranceShowcase.vue';
import { pages, renderWebsite } from '../render.mjs';
import { serviceInquiries } from '../ecosystem.mjs';
import { auricwellAnalyticsPath } from '../analytics.js';

const page = (section, base='') => new DOMParser().parseFromString(renderWebsite(section,{base,origin:'https://auricwell.com',canonicalBase:base}),'text/html');

describe('Public insurance examples',()=>{
 it.each(['discovery','overlap','verification'])('walks through %s using local fictional states and can reset',async scenario=>{
  const wrapper=mount(InsuranceShowcase,{props:{scenario}});
  expect(wrapper.text()).toContain('FICTIONAL EXAMPLE');
  expect(wrapper.text()).toContain('Morgan Ellis');
  expect(wrapper.text()).toContain('No insurance search, charge or saved client change');
  const first=wrapper.get('.cd-content').text();
  await wrapper.get('.cd-actions button').trigger('click');
  expect(wrapper.get('.cd-content').text()).not.toBe(first);
  if(scenario==='discovery')expect(wrapper.text()).toContain('Possible coverage found');
  if(scenario==='overlap')expect(wrapper.text()).toContain('Claim readiness and client collection stay on hold');
  if(scenario==='verification')expect(wrapper.text()).toContain('Still required');
  await wrapper.get('.cd-actions button').trigger('click');
  if(scenario==='overlap')expect(wrapper.text()).toContain('The hold remains');
  if(scenario==='verification')expect(wrapper.text()).toContain('DEMO-ELIG-1042');
  expect(wrapper.findAll('input,textarea,select,form')).toHaveLength(0);
  await wrapper.get('.cd-actions button').trigger('click');
  expect(wrapper.get('.cd-content').text()).toBe(first);
  wrapper.unmount();
 });
 it('publishes separate feature anchors and distinguishes discovery, COB and routine eligibility',()=>{
  const doc=page('product');
  for(const id of ['insurance-discovery','coverage-coordination','automatic-verification'])expect(doc.querySelectorAll(`#${id}`)).toHaveLength(1);
  expect(doc.getElementById('insurance-discovery').textContent).toContain('Staff authorizes the search');
  expect(doc.getElementById('coverage-coordination').textContent).toContain('do not guarantee payment or eliminate recoupments');
  expect(doc.getElementById('automatic-verification').textContent).toContain('When automatic verification is enabled');
  expect(doc.getElementById('automatic-verification').textContent).toContain('without overwriting saved answers');
  expect(doc.querySelectorAll('[data-actual-example^="insurance-"]')).toHaveLength(3);
 });
});

describe('Supported transition page',()=>{
 it.each(['','/auricwell'])('has its own canonical page and working nav, CTA and feature links at base %s',base=>{
  expect(pages).toHaveProperty('transition');
  const doc=page('transition',base);
  expect(doc.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(`https://auricwell.com${base}/transition`);
  for(const nav of doc.querySelectorAll('.desktop-nav,.mobile-menu nav'))expect(nav.querySelector(`a[href="${base}/transition"]`)?.getAttribute('aria-current')).toBe('page');
  expect(doc.querySelectorAll('.transition-steps li')).toHaveLength(5);
  expect(doc.querySelectorAll(`a[href="${base}/contact?service=transition#contact-form"]`).length).toBeGreaterThanOrEqual(2);
  const text=doc.querySelector('main').textContent;
  for(const phrase of ['approved transfer route','reconciliation','Claim.MD','Stedi','go-live date','2027'])expect(text).toContain(phrase);
  expect(doc.querySelector('form,input[type=file]')).toBeNull();
  const home=page('',base);
  expect(home.querySelector(`main a[href="${base}/transition"]`)).toBeTruthy();
 });
 it('prepares a transition inquiry and includes the new public page in existing anonymous analytics',()=>{
  expect(serviceInquiries.transition.message).toContain('supported exports');
  expect(serviceInquiries.insurance.message).toContain('Stedi');
  expect(auricwellAnalyticsPath('website',null,'transition')).toBe('/p/auricwell/transition');
 });
});
