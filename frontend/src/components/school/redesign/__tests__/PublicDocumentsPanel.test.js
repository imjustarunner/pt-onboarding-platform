import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import PublicDocumentsPanel from '../PublicDocumentsPanel.vue';
import { useAuthStore } from '../../../../store/auth';
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

vi.mock('../SchoolPacketTemplateEditor.vue', () => ({
  default: {
    name: 'SchoolPacketTemplateEditor',
    props: ['schoolOrganizationId'],
    emits: ['close', 'saved'],
    template: '<div class="packet-editor-stub">Packet editor stub<button @click="$emit(\'close\')">Close</button></div>'
  }
}));

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const mountPanel = (role = 'school_staff') => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore();
  authStore.user = { id: 9, role };
  return mount(PublicDocumentsPanel, {
    props: { schoolOrganizationId: 123 },
    global: { plugins: [pinia] }
  });
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

    const wrapper = mountPanel('admin');
    await flush();

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

    const wrapper = mountPanel('admin');
    await flush();

    expect(wrapper.text()).toContain('Affiliated digital forms');
    expect(wrapper.text()).toContain('My intake link');

    const qrBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'QR');
    expect(qrBtn).toBeTruthy();
    await qrBtn.trigger('click');
    await flush();

    expect(wrapper.text()).toContain('Scan or share the link below.');
    expect(wrapper.find('img[alt="Intake QR code"]').exists()).toBe(true);
  });

  it('renders smart printable packet actions for virtual doc', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/public-documents')) {
        return Promise.resolve({
          data: {
            documents: [{
              id: 'smart-printable-packet',
              kind: 'system_printable_packet',
              title: 'Springfield High — Blank Referral Packet (Smart)',
              category_key: 'referral_packet',
              packet_version: '1',
              updated_at: new Date().toISOString()
            }]
          }
        });
      }
      if (String(url).includes('/intake-links')) {
        return Promise.resolve({ data: { links: [] } });
      }
      return Promise.reject(new Error('Unexpected GET'));
    });

    const wrapper = mountPanel('school_staff');
    await flush();

    expect(wrapper.text()).toContain('Auto-generated from live school data');
    expect(wrapper.text()).toContain('Referral packet');
    const labels = wrapper.findAll('button').map((b) => b.text().trim());
    expect(labels).toContain('View');
    expect(labels).toContain('Print');
    expect(labels).toContain('Download');
    expect(labels).not.toContain('Edit');
    expect(labels).not.toContain('Delete');
  });

  it('shows Edit for smart packet only to admin/super_admin and opens editor', async () => {
    api.get.mockImplementation((url) => {
      if (String(url).includes('/public-documents')) {
        return Promise.resolve({
          data: {
            documents: [{
              id: 'smart-printable-packet',
              kind: 'system_printable_packet',
              title: 'Springfield High — Blank Referral Packet (Smart)',
              category_key: 'referral_packet',
              packet_version: '1',
              updated_at: new Date().toISOString()
            }]
          }
        });
      }
      if (String(url).includes('/intake-links')) {
        return Promise.resolve({ data: { links: [] } });
      }
      return Promise.reject(new Error('Unexpected GET'));
    });

    const wrapper = mountPanel('admin');
    await flush();

    const editBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Edit');
    expect(editBtn).toBeTruthy();
    await editBtn.trigger('click');
    await flush();

    expect(wrapper.find('.packet-editor-stub').exists()).toBe(true);
    expect(wrapper.text()).toContain('Packet editor stub');
  });
});
