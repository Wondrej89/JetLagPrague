import { poiSchema, poiConfigurationSchema, validatePoiConfiguration } from '@jetlag/geo-core';
import catalog from './data/poi-catalog.json';

// Bundled application data: available on first visit, independent of an author's draft.
export const publishedAirports = catalog.airports.map(value => poiSchema.parse(value));
export const publishedParks = poiConfigurationSchema.parse(catalog.parks);
validatePoiConfiguration(publishedParks);
export const parkSourceStatus = catalog.parkSourceStatus;
