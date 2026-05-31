import { describe, expect, it, vi } from 'vitest';

import { GooglePlacesError, searchGooglePlaces } from './google-places.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function rawPlace(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: { text: `Gym ${id}` },
    websiteUri: `https://${id}.example`,
    internationalPhoneNumber: '+34 600 111 222',
    googleMapsUri: `https://maps.google.com/?cid=${id}`,
    rating: 4.5,
    userRatingCount: 80,
    formattedAddress: 'Calle X, Madrid',
    addressComponents: [{ longText: 'Madrid', types: ['locality'] }],
    ...overrides,
  };
}

describe('searchGooglePlaces', () => {
  it('maps fields, sends the api key in the header, and never logs it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ places: [rawPlace('a')] }));

    const results = await searchGooglePlaces({
      city: 'Madrid',
      businessType: 'gimnasio',
      apiKey: 'secret-key',
      maxResults: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      placeId: 'a',
      name: 'Gym a',
      website: 'https://a.example',
      phone: '+34 600 111 222',
      city: 'Madrid',
      rating: 4.5,
      userRatingCount: 80,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('secret-key');
  });

  it('paginates with nextPageToken until maxResults is reached', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ places: [rawPlace('a')], nextPageToken: 'tok' }))
      .mockResolvedValueOnce(jsonResponse({ places: [rawPlace('b')] }));

    const results = await searchGooglePlaces({
      city: 'Madrid',
      businessType: 'gimnasio',
      apiKey: 'k',
      maxResults: 40,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results.map((place) => place.placeId)).toEqual(['a', 'b']);
  });

  it('deduplicates repeated placeIds across pages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ places: [rawPlace('a')], nextPageToken: 'tok' }))
      .mockResolvedValueOnce(jsonResponse({ places: [rawPlace('a')] }));

    const results = await searchGooglePlaces({
      city: 'Madrid',
      businessType: 'gimnasio',
      apiKey: 'k',
      maxResults: 40,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(results).toHaveLength(1);
  });

  it('throws GooglePlacesError on non-ok responses without leaking the body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad' }, false, 403));

    await expect(
      searchGooglePlaces({
        city: 'Madrid',
        businessType: 'gimnasio',
        apiKey: 'k',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(GooglePlacesError);
  });
});
