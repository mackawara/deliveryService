import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { baseApi } from '@/api/baseApi';
import { enquiriesApi } from '@/api/endpoints/enquiries';
import { financeApi } from '@/api/endpoints/finance';
import { createAppStore } from '@/app/store';
import { enquiries } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';

async function waitFor(assertion: () => void, timeout = 2000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - started > timeout) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

describe('cache invalidation', () => {
  it('refetches the affected list after a successful command', async () => {
    resetMockState({ authenticated: true });
    const listCalls = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/enquiries', () => {
        listCalls();
        return HttpResponse.json({ items: enquiries, limit: 25, skip: 0 });
      }),
    );

    const store = createAppStore();
    const subscription = store.dispatch(
      enquiriesApi.endpoints.listEnquiries.initiate({ townId: 'town-hwange', status: 'OPEN' }),
    );
    await waitFor(() => expect(listCalls).toHaveBeenCalledTimes(1));

    await store
      .dispatch(
        enquiriesApi.endpoints.replyToEnquiry.initiate({ id: 'enquiry-1', body: 'On the way.' }),
      )
      .unwrap();

    // The reply invalidates the enquiry and its scoped list, so the queue refetches.
    await waitFor(() => expect(listCalls).toHaveBeenCalledTimes(2));
    subscription.unsubscribe();
  });

  it('keeps unrelated caches untouched', async () => {
    resetMockState({ authenticated: true });
    const paymentCalls = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/payments', () => {
        paymentCalls();
        return HttpResponse.json({ items: [], limit: 25, skip: 0 });
      }),
    );

    const store = createAppStore();
    const subscription = store.dispatch(
      financeApi.endpoints.listPayments.initiate({ townId: 'town-hwange' }),
    );
    await waitFor(() => expect(paymentCalls).toHaveBeenCalledTimes(1));

    await store
      .dispatch(
        enquiriesApi.endpoints.replyToEnquiry.initiate({ id: 'enquiry-1', body: 'Unrelated.' }),
      )
      .unwrap();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(paymentCalls).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('clears every protected cache when the API state is reset', async () => {
    resetMockState({ authenticated: true });
    const store = createAppStore();
    const subscription = store.dispatch(
      enquiriesApi.endpoints.listEnquiries.initiate({ townId: 'town-hwange' }),
    );
    await waitFor(() =>
      expect(Object.keys(store.getState().deliveryApi.queries).length).toBeGreaterThan(0),
    );

    subscription.unsubscribe();
    store.dispatch(baseApi.util.resetApiState());

    expect(Object.keys(store.getState().deliveryApi.queries)).toHaveLength(0);
  });
});
