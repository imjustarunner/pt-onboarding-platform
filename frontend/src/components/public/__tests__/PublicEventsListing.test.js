import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PublicEventsListing from '../PublicEventsListing.vue';

vi.mock('../../../store/branding', () => ({
  useBrandingStore: () => ({
    portalTheme: { logoUrl: null, agencyName: 'Test Org', themeSettings: {} },
    portalAgency: { logoUrl: null, name: 'Test Org', themeSettings: {} }
  })
}));

vi.mock('../../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({
      data: {
        origin: { formattedAddress: 'Test' },
        events: [
          {
            id: 1,
            title: 'Near',
            registrationPublicKey: 'k1',
            distanceMeters: 1000,
            nearestVenueLabel: 'A',
            inPersonPublic: true,
            publicLocationAddress: '123 St',
            publicLocationLat: 1,
            publicLocationLng: 2,
            sessionLocations: [],
            startsAt: '2026-06-01T14:00:00.000Z',
            endsAt: '2026-06-01T15:00:00.000Z',
            timezone: 'UTC'
          }
        ]
      }
    })
  }
}));

describe('PublicEventsListing', () => {
  it('renders Register link for public registration events', () => {
    const wrapper = mount(PublicEventsListing, {
      props: {
        pageTitle: 'Events',
        events: [
          {
            id: 1,
            title: 'Summer session',
            description: 'Fun week',
            startsAt: '2026-06-01T14:00:00.000Z',
            endsAt: '2026-06-01T15:00:00.000Z',
            timezone: 'UTC',
            registrationEligible: true,
            registrationPublicKey: 'abc123hex',
            inPersonPublic: false,
            sessionLocations: []
          }
        ],
        loading: false,
        error: ''
      },
      global: {
        stubs: {
          TransitionGroup: { template: '<ul class="pel-list"><slot /></ul>' },
          RouterLink: { template: '<a><slot /></a>', props: ['to'] }
        }
      }
    });
    const link = wrapper.find('a.pel-btn-primary');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toContain('/intake/abc123hex');
  });

  it('shows empty state when no registerable events', () => {
    const wrapper = mount(PublicEventsListing, {
      props: {
        pageTitle: 'Events',
        events: [],
        loading: false,
        error: ''
      },
      global: {
        stubs: {
          TransitionGroup: { template: '<ul class="pel-list"><slot /></ul>' },
          RouterLink: { template: '<a><slot /></a>', props: ['to'] }
        }
      }
    });
    expect(wrapper.text()).toMatch(/no open programs right now/i);
  });
});
