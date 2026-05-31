import type { DiscoveryPayload, JobResult } from '../../core/queue/types.js';
import { discoveryService, type RunDiscoveryDeps } from './service.js';

/** Entrypoint del worker para la queue `discovery`. */
export async function runDiscovery(
  payload: DiscoveryPayload,
  deps: RunDiscoveryDeps = {},
): Promise<JobResult> {
  return discoveryService.run(payload, deps);
}
