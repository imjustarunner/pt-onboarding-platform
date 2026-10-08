import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Products from '../PtcoProducts.vue';
describe('Plot Twist product family',()=>{
  it('includes Summit Stats in the product family with the real website and walkthrough',()=>{
    const wrapper = mount(Products,{global:{stubs:{RouterLink:{template:'<a><slot/></a>'}}}});
    expect(wrapper.findAll('.ptco-product-family article')).toHaveLength(6);
    const plotline = wrapper.find('#plotline');
    expect(plotline.text()).toContain('Workforce Operations');
    expect(plotline.find('.ptco-button').attributes('href')).toBe('https://plottwistco.com/plottline');
    expect(plotline.find('.ptco-text-link').attributes('href')).toBe('https://plottwistco.com/plottline/product');
    const product = wrapper.find('#sstc');
    expect(product.text()).toContain('Fitness clubs & community groups');
    expect(product.text()).toContain('web application');
    expect(product.text()).toContain('three-month free trial');
    expect(product.find('img').attributes('src')).toBe('/assets/sstc/logo.png');
    expect(product.find('.ptco-button').attributes('href')).toBe('https://summitstatstc.com');
    expect(product.find('.ptco-text-link').attributes('href')).toBe('https://summitstatstc.com/tour');
    expect(product.text()).not.toMatch(/Coming soon|Subsidiary/);
    wrapper.unmount();
  });
});
