import { expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as Vue from 'vue';
import { parse, compileScript, babelParse, walkIdentifiers } from '@vue/compiler-sfc';

it('binds every Vue runtime helper used by Client Management setup', () => {
  const source = fs.readFileSync(fileURLToPath(import.meta.url).replace(/__tests__\/[^/]+$/, 'ClientManagementView.vue'), 'utf8');
  const { descriptor } = parse(source);
  const compiled = compileScript(descriptor, { id: 'client-management-setup' });
  const ast = babelParse(descriptor.scriptSetup.content, { sourceType: 'module' });
  const missing = new Set();
  const known = Object.fromEntries(Object.keys(compiled.bindings).map(name => [name, 1]));
  walkIdentifiers(ast, node => {
    if (typeof Vue[node.name] === 'function') missing.add(node.name);
  }, false, [], known);
  expect([...missing]).toEqual([]);
});
