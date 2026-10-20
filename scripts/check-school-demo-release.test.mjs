import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fictionalSchool, fictionalDemoGet, fictionalDemoMutation } from '../backend/src/services/fictionalSchoolDemo.service.js';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('public demo release contains only the Juniper Lantern fixtures', () => {
  assert.equal(fictionalSchool.name, 'Juniper Lantern Academy');
  const endpoints = ['', 'portal-theme', 'clients', 'school-staff', 'providers/scheduling', 'affiliation', 'chat/threads'];
  const data = endpoints.map(path => fictionalDemoGet(path));
  assert.doesNotMatch(JSON.stringify(data), /hogwarts|minerva|mcgonagall/i);
  assert.throws(() => fictionalDemoMutation(), error => error.status === 409);
  const clients = fictionalDemoGet('clients');
  clients[0].first_name = 'Changed';
  assert.notEqual(fictionalDemoGet('clients')[0].first_name, 'Changed');
});

test('public and invitation controllers cannot fall back to the legacy database demo', () => {
  const controller = source('backend/src/controllers/schoolOnboarding.controller.js');
  assert.doesNotMatch(controller, /schoolOnboardingDemoPortal\.service/);
  assert.match(controller, /fictionalDemoGet/);
  const service = source('backend/src/services/schoolOnboarding.service.js');
  const demoFunctions = service.slice(service.indexOf('export async function resolveDemoSchool('), service.indexOf('export async function submitOnboarding('));
  assert.doesNotMatch(demoFunctions, /hogwarts|pool\.execute/i);
});

test('the shared brand links to the public home, without an app/login redirect', () => {
  const brand = source('frontend/src/components/schoolcarebridge/SchoolCareBridgeBrand.vue');
  assert.match(brand, /<a\s[^>]*href="https:\/\/schoolcarebridge\.org\/"/);
  assert.doesNotMatch(brand, /router-link|to="\/schoolcarebridge"|href="[^\"]*\/app/);
});
