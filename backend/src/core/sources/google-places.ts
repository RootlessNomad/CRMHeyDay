// Adaptador para Google Places API (v1) — `places:searchText`.
//
// Devuelve negocios de una ciudad/tipo para el descubrimiento en masa (UJ-31).
// La API key se resuelve fuera de aquí (vault `google_places`) y se pasa como
// parámetro — este módulo NUNCA la lee de env ni la loggea.
//
// Una sola llamada con FieldMask trae los campos que necesitamos (sin Place
// Details extra). Paginamos con `nextPageToken` hasta `maxResults` (máx 60 = 3
// páginas de 20).

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const PAGE_SIZE = 20;
const MAX_PAGES = 3;

// Campos que pedimos a la API. Mantener en sync con el parseo de abajo.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.websiteUri',
  'places.internationalPhoneNumber',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.formattedAddress',
  'places.addressComponents',
].join(',');

export interface PlaceResult {
  placeId: string;
  name: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  rating: number | null;
  userRatingCount: number | null;
  mapsUrl: string | null;
  address: string | null;
}

export interface SearchGooglePlacesInput {
  city: string;
  businessType: string;
  apiKey: string;
  maxResults?: number;
  /** Inyectable para tests; por defecto el `fetch` global. */
  fetchImpl?: typeof fetch;
}

export class GooglePlacesError extends Error {
  readonly code = 'GOOGLE_PLACES_ERROR';
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GooglePlacesError';
  }
}

interface RawAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  websiteUri?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  addressComponents?: RawAddressComponent[];
}

interface SearchTextResponse {
  places?: RawPlace[];
  nextPageToken?: string;
}

function extractLocality(components: RawAddressComponent[] | undefined): string | null {
  if (!components) return null;
  const locality = components.find((component) => component.types?.includes('locality'));
  const fallback = components.find((component) => component.types?.includes('postal_town'));
  return locality?.longText ?? fallback?.longText ?? null;
}

function toPlaceResult(raw: RawPlace): PlaceResult | null {
  if (!raw.id || !raw.displayName?.text) return null;
  return {
    placeId: raw.id,
    name: raw.displayName.text,
    website: raw.websiteUri ?? null,
    phone: raw.internationalPhoneNumber ?? null,
    city: extractLocality(raw.addressComponents),
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    userRatingCount: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
    mapsUrl: raw.googleMapsUri ?? null,
    address: raw.formattedAddress ?? null,
  };
}

/**
 * Busca negocios en Google Places por `"<businessType> en <city>"`.
 * Deduplica por `placeId` dentro del propio resultado (la API puede repetir
 * entre páginas). El llamador deduplica contra la DB.
 */
export async function searchGooglePlaces(input: SearchGooglePlacesInput): Promise<PlaceResult[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const maxResults = Math.min(Math.max(input.maxResults ?? PAGE_SIZE, 1), PAGE_SIZE * MAX_PAGES);
  const textQuery = `${input.businessType.trim()} en ${input.city.trim()}`;

  const byPlaceId = new Map<string, PlaceResult>();
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body: Record<string, unknown> = {
      textQuery,
      pageSize: PAGE_SIZE,
      languageCode: 'es',
      regionCode: 'ES',
    };
    if (pageToken) body['pageToken'] = pageToken;

    let response: Response;
    try {
      response = await fetchImpl(SEARCH_TEXT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': input.apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new GooglePlacesError(
        `Fallo de red contra Google Places: ${error instanceof Error ? error.message : 'desconocido'}`,
      );
    }

    if (!response.ok) {
      // No incluimos el body crudo (puede reflejar la query) ni la key.
      throw new GooglePlacesError(`Google Places respondió ${response.status}`, response.status);
    }

    const data = (await response.json()) as SearchTextResponse;
    for (const raw of data.places ?? []) {
      const place = toPlaceResult(raw);
      if (place && !byPlaceId.has(place.placeId)) byPlaceId.set(place.placeId, place);
      if (byPlaceId.size >= maxResults) return [...byPlaceId.values()].slice(0, maxResults);
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return [...byPlaceId.values()].slice(0, maxResults);
}
