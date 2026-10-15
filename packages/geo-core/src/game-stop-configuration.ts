import { z } from 'zod';
import { transportModeSchema, wgs84PointSchema } from './pid-model';

const id = z.string().min(1).max(300);
const groupIds = z.array(id).min(1).refine(ids => new Set(ids).size === ids.length, 'Duplicitní vazba skupiny.');
export const gameStopConfigurationSchema = z.object({
  schemaVersion: z.literal(1), radiusMeters: z.number().positive().max(100000).default(400),
  // Identity is based on source codes, never stop names or proximity.
  nodes: z.array(z.object({ id, name: z.string().trim().min(1).max(10000), groupIds,
    justification: z.string().trim().min(1).max(10000),
  })).max(100000).default([]),
  overrides: z.array(z.object({
    stopId: id, decision: z.enum(['automatic', 'allowed', 'excluded']).default('automatic'),
    mode: transportModeSchema.optional(),
    point: wgs84PointSchema.optional(),
    justification: z.string().trim().min(1).max(10000),
    approvedAt: z.iso.datetime(),
    // The exact group/platform membership approved by the administrator.
    sourceSignature: z.string().min(1),
  })).max(100000).default([]),
});
export type GameStopConfiguration = z.infer<typeof gameStopConfigurationSchema>;
export type GameStopOverride = GameStopConfiguration['overrides'][number];
export const defaultGameStopConfiguration = (): GameStopConfiguration => ({ schemaVersion: 1, radiusMeters: 400, nodes: [], overrides: [] });
export function validateGameStopConfiguration(input: unknown): GameStopConfiguration {
  const configuration = gameStopConfigurationSchema.parse(input);
  if (new Set(configuration.nodes.map(node => node.id)).size !== configuration.nodes.length || new Set(configuration.overrides.map(override => override.stopId)).size !== configuration.overrides.length) throw new Error('Duplicitní ID herní zastávky nebo výjimky.');
  const assignments = configuration.nodes.flatMap(node => node.groupIds);
  if (new Set(assignments).size !== assignments.length) throw new Error('Zdrojová skupina nesmí patřit do více herních zastávek.');
  if (configuration.nodes.some(node => !node.id.startsWith('manual:'))) throw new Error('Ruční uzel musí mít ID manual:…; zdrojová ID jsou vyhrazena.');
  return configuration;
}
