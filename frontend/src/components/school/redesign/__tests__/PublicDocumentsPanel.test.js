import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PublicDocumentsPanel from '../PublicDocumentsPanel.vue';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR')
  }
}));

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'open').mockImplementation(() => null);
  Object.defineProperty(global.navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true
  });
});

describe('PublicDocumentsPanel', () => {
  it('hides Print for Google Docs/Drive link items', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/public-documents')) {
        return Promise.resolve({
          data: {
            documents: [
              {
                id: 1,
                kind: 'link',
                title: 'Google doc',
                link_url: 'https://docs.google.com/document/d/abc123/edit',
                category_key: 'other',
                updated_at: new Date().toISOString()
              },
              {
                id: 2,
                kind: 'link',
                title: 'Non-google link',
                link_url: 'https://example.com',
                category_key: 'other',
                updated_at: new Date().toISOString()
              }
            ]
          }
        });
      }
      if (String(url).includes('/intake-links')) {
        return Promise.resolve({ data: { links: [] } });
      }
      return Promise.reject(new Error('Unexpected GET'));
    });

    const wrapper = mount(PublicDocumentsPanel, {
      props: { schoolOrganizationId: 123 }
    });
    await flush();

    // Only the non-Google item should show Print.
    const printButtons = wrapper.findAll('button').filter((b) => b.text().trim() === 'Print');
    expect(printButtons.length).toBe(1);
    expect(wrapper.text()).toContain('Open to print');
  });

  it('renders intake links and opens QR modal', async () => {
    const updatedAt = new Date().toISOString();
    api.get.mockImplementation((url) => {
      if (String(url).includes('/public-documents')) {
        return Promise.resolve({ data: { documents: [] } });
      }
      if (String(url).includes('/intake-links')) {
        return Promise.resolve({
          data: {
            links: [{ id: 10, public_key: 'abc123', title: 'My intake link', updated_at: updatedAt }]
          }
        });
      }
      return Promise.reject(new Error('Unexpected GET'));
    });

    const wrapper = mount(PublicDocumentsPanel, {
      props: { schoolOrganizationId: 123 }
    });
    await flush();

    expect(wrapper.text()).toContain('Affiliated intake links');
    expect(wrapper.text()).toContain('My intake link');

    const qrBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'QR');
    expect(qrBtn).toBeTruthy();
    await qrBtn.trigger('click');
    await flush();

    expect(wrapper.text()).toContain('Scan or share the link below.');
    expect(wrapper.find('img[alt="Intake QR code"]').exists()).toBe(true);
  });
});

