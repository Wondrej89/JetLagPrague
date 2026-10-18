import { poiSchema, poiConfigurationSchema, validatePoiConfiguration } from '@jetlag/geo-core';
import catalog from './data/poi-catalog.json';

// Bundled application data: available on first visit, independent of an author's draft.
export const publishedAirports = catalog.airports.map(value => poiSchema.parse(value));
export const publishedParks = poiConfigurationSchema.parse(catalog.parks);
validatePoiConfiguration(publishedParks);
export const parkSourceStatus = catalog.parkSourceStatus;

// Public game collection contains approved records only; the editor's complete
// sources above remain available for review and future source updates.
export const publishedGameParks = catalog.gameParks.map(value => poiSchema.parse(value));
if (publishedGameParks.some(park => park.category !== 'park' || park.status !== 'approved')) throw new Error('Herní katalog smí obsahovat pouze schválené parky.');
