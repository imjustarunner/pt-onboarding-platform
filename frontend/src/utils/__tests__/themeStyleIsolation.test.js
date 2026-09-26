// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const components = readdirSync(sourceRoot, { recursive: true })
  .filter(name => name.endsWith('.vue'));

describe('component appearance isolation', () => {
  it('keeps compiled dark-mode and preview rules on their components, not the document root', () => {
    const leaks = [];
    for (const name of components) {
      const source = readFileSync(`${sourceRoot}/${name}`, 'utf8');
      if (!source.includes('data-theme=') && !source.includes('data-pt-app-preview')) continue;
      const { descriptor } = parse(source);
      for (const style of descriptor.styles.filter(s => s.scoped)) {
        const result = compileStyle({ source: style.content, id: 'data-v-isolation', scoped: true });
        expect(result.errors, name).toEqual([]);
        result.rawResult.root.walkRules(rule => {
          for (const selector of rule.selectors || []) {
            if (/^(?:html)?\[(?:data-theme|data-pt-app-preview[^=]*)=[^\]]+\]$/.test(selector.trim())) {
              leaks.push(`${name}: ${selector}`);
            }
          }
        });
      }
    }
    expect(leaks).toEqual([]);
  });
});
