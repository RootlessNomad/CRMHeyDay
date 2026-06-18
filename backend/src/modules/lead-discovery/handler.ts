import type { JobResult, LeadDiscoveryPayload } from '../../core/queue/types.js';
import { leadDiscoveryService } from './service.js';

export async function runLeadDiscovery(payload: LeadDiscoveryPayload): Promise<JobResult> {
  return leadDiscoveryService.run(payload);
}
