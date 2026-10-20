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

export const publishedZoos = catalog.zoos.map(value => poiSchema.parse(value));
if (new Set(publishedZoos.map(poi => poi.id)).size !== publishedZoos.length || publishedZoos.some(poi => poi.category !== 'zoo')) throw new Error('Katalog zoo musí obsahovat bodové lokality s jedinečnými ID.');

export const publishedHospitals = catalog.hospitals.map(value => poiSchema.parse(value));
if (new Set(publishedHospitals.map(poi => poi.id)).size !== publishedHospitals.length || publishedHospitals.some(poi => poi.category !== 'hospital')) throw new Error('Katalog nemocnic musí obsahovat bodové lokality s jedinečnými ID.');
