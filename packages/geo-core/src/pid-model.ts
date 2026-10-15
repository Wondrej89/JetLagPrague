import { z } from 'zod';

export const transportModes = ['train', 'metro', 'tram', 'bus', 'trolleybus', 'ferry', 'funicular'] as const;
export type TransportMode = typeof transportModes[number];
export const transportModeSchema = z.enum(transportModes);
export const wgs84PointSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
