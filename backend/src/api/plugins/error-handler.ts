// Error handler global de Fastify. Mapea excepciones conocidas del dominio a un
// shape HTTP uniforme `{error: {code, message, details?}}` y evita filtrar stacks.
//
// Orden de mapping (primer match gana):
//   - ZodError                    → 400 VALIDATION_ERROR + issues
//   - AuthError                   → statusCode del error + code
//   - InvalidJobPayloadError      → 400 VALIDATION_ERROR
//   - CompanyDomainConflictError  → 409 COMPANY_DOMAIN_CONFLICT
//   - CompanyNotFoundError        → 404 NOT_FOUND
//   - ActivityNotFoundError       → 404 NOT_FOUND
//   - ActivityEntityNotFoundError → 404 NOT_FOUND
//   - TagNotFoundError            → 404 NOT_FOUND
//   - TagAssignmentEntityNotFoundError → 404 NOT_FOUND
//   - ContactNotFoundError        → 404 NOT_FOUND
//   - ContactPrimaryConflictError → 409 VALIDATION_ERROR
//   - ContactCompanyNotFoundError → 404 NOT_FOUND
//   - PipelineNotFoundError       → 404 NOT_FOUND
//   - StageNotFoundError          → 404 NOT_FOUND
//   - StageHasLeadsError          → 409 VALIDATION_ERROR
//   - InvalidStageKindError       → 409 VALIDATION_ERROR
//   - InvalidStageOrderError      → 400 VALIDATION_ERROR
//   - LeadNotFoundError           → 404 NOT_FOUND
//   - LeadCompanyMismatchError    → 409 VALIDATION_ERROR
//   - StageNotInPipelineError     → 409 VALIDATION_ERROR
//   - InvalidLeadTransitionError  → 409 VALIDATION_ERROR
//   - CredentialNotFoundError     → 404 NOT_FOUND
//   - JobNotFoundError            → 404 NOT_FOUND
//   - CredentialConflictError     → 409 VALIDATION_ERROR
//   - TagNameConflictError        → 409 VALIDATION_ERROR
//   - TagAssignmentConflictError  → 409 VALIDATION_ERROR
//   - SecretNotConfiguredError    → 503 INTEGRATION_UNAVAILABLE
//   - AnthropicError              → depende de code → 5xx o 429
//   - Fastify validation (4xx)    → passthrough con normalización
//   - rate limit (429)            → RATE_LIMITED
//   - default                     → 500 INTERNAL_ERROR (mensaje genérico)

import { ERROR_CODES } from '@heyday/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { AnthropicError } from '../../core/ai/errors.js';
import { AuthError } from '../../core/auth/errors.js';
import { SecretNotConfiguredError } from '../../core/config/secrets.js';
import { InvalidJobPayloadError } from '../../core/queue/types.js';
import {
  ActivityEntityNotFoundError,
  ActivityNotFoundError,
} from '../../modules/activities/service.js';
import {
  CompanyDomainConflictError,
  CompanyNotFoundError,
} from '../../modules/companies/service.js';
import {
  ContactCompanyNotFoundError,
  ContactNotFoundError,
  ContactPrimaryConflictError,
} from '../../modules/contacts/service.js';
import { OutboundPrepNotFoundError, PainPointNotFoundError } from '../../modules/intel/service.js';
import {
  InvalidLeadTransitionError,
  LeadCompanyMismatchError,
  LeadNotFoundError,
  StageNotInPipelineError,
} from '../../modules/leads/index.js';
import {
  InvalidStageKindError,
  InvalidStageOrderError,
  PipelineNotFoundError,
  StageHasLeadsError,
  StageNotFoundError,
} from '../../modules/pipelines/index.js';
import {
  CredentialConflictError,
  CredentialNotFoundError,
} from '../../modules/credentials/service.js';
import { JobNotFoundError } from '../../modules/jobs/service.js';
import {
  TagAssignmentConflictError,
  TagAssignmentEntityNotFoundError,
  TagNameConflictError,
  TagNotFoundError,
} from '../../modules/tags/service.js';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

function hasName(err: unknown, name: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === name
  );
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function send(reply: FastifyReply, status: number, body: ErrorBody): FastifyReply {
  return reply.code(status).type('application/json').send({ error: body });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    // Zod: VALIDATION_ERROR con issues detalladas
    if (err instanceof ZodError || hasName(err, 'ZodError')) {
      const issues =
        typeof err === 'object' && err !== null && 'issues' in err
          ? (err as { issues?: unknown }).issues
          : undefined;
      req.log.info({ code: ERROR_CODES.VALIDATION_ERROR }, 'validation failed');
      return send(reply, 400, {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Datos de entrada inválidos',
        details: issues,
      });
    }

    if (err instanceof AuthError) {
      return send(reply, err.statusCode, { code: err.code, message: err.message });
    }

    if (err instanceof InvalidJobPayloadError) {
      return send(reply, 400, {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Payload de job inválido',
      });
    }

    if (err instanceof CompanyDomainConflictError) {
      return send(reply, 409, {
        code: 'COMPANY_DOMAIN_CONFLICT',
        message: err.message,
        details: { existing_id: err.existingId },
      });
    }

    if (
      err instanceof CompanyNotFoundError ||
      hasName(err, 'CompanyNotFoundError') ||
      err instanceof ActivityNotFoundError ||
      hasName(err, 'ActivityNotFoundError') ||
      err instanceof ActivityEntityNotFoundError ||
      hasName(err, 'ActivityEntityNotFoundError') ||
      err instanceof TagNotFoundError ||
      hasName(err, 'TagNotFoundError') ||
      err instanceof TagAssignmentEntityNotFoundError ||
      hasName(err, 'TagAssignmentEntityNotFoundError') ||
      err instanceof ContactNotFoundError ||
      hasName(err, 'ContactNotFoundError') ||
      err instanceof ContactCompanyNotFoundError ||
      hasName(err, 'ContactCompanyNotFoundError') ||
      err instanceof PainPointNotFoundError ||
      hasName(err, 'PainPointNotFoundError') ||
      err instanceof OutboundPrepNotFoundError ||
      hasName(err, 'OutboundPrepNotFoundError') ||
      err instanceof PipelineNotFoundError ||
      hasName(err, 'PipelineNotFoundError') ||
      err instanceof StageNotFoundError ||
      hasName(err, 'StageNotFoundError') ||
      err instanceof LeadNotFoundError ||
      hasName(err, 'LeadNotFoundError') ||
      err instanceof CredentialNotFoundError ||
      hasName(err, 'CredentialNotFoundError') ||
      err instanceof JobNotFoundError
    ) {
      return send(reply, 404, {
        code: ERROR_CODES.NOT_FOUND,
        message: messageOf(err, 'Recurso no encontrado'),
      });
    }

    if (
      err instanceof ContactPrimaryConflictError ||
      err instanceof StageHasLeadsError ||
      err instanceof LeadCompanyMismatchError ||
      err instanceof StageNotInPipelineError ||
      err instanceof InvalidStageKindError ||
      err instanceof InvalidLeadTransitionError ||
      err instanceof TagNameConflictError ||
      err instanceof TagAssignmentConflictError
    ) {
      return send(reply, 409, { code: ERROR_CODES.VALIDATION_ERROR, message: err.message });
    }

    if (err instanceof InvalidStageOrderError) {
      return send(reply, 400, { code: ERROR_CODES.VALIDATION_ERROR, message: err.message });
    }

    if (err instanceof CredentialConflictError) {
      return send(reply, 409, { code: ERROR_CODES.VALIDATION_ERROR, message: err.message });
    }

    if (err instanceof SecretNotConfiguredError) {
      return send(reply, 503, {
        code: ERROR_CODES.INTEGRATION_UNAVAILABLE,
        message: 'Servicio externo no configurado',
      });
    }

    if (err instanceof AnthropicError) {
      const status = err.code === 'AI_RATE_LIMITED' ? 429 : err.code === 'AI_TIMEOUT' ? 504 : 503;
      return send(reply, status, {
        code: ERROR_CODES.INTEGRATION_UNAVAILABLE,
        message: 'Servicio IA no disponible',
      });
    }

    // Fastify valida schemas (JSON schema) y rate-limit lanza errores con `statusCode`.
    // Detectamos por duck-typing para no acoplar al tipo exacto.
    const maybeFastify = err as {
      statusCode?: number;
      code?: string;
      message?: string;
      validation?: unknown;
    };

    if (maybeFastify.statusCode === 429) {
      return send(reply, 429, {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Demasiadas peticiones, inténtalo en unos segundos',
      });
    }

    if (
      typeof maybeFastify.statusCode === 'number' &&
      maybeFastify.statusCode >= 400 &&
      maybeFastify.statusCode < 500
    ) {
      return send(reply, maybeFastify.statusCode, {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: maybeFastify.message ?? 'Petición inválida',
        ...(maybeFastify.validation ? { details: maybeFastify.validation } : {}),
      });
    }

    // Todo lo demás: 500 genérico. Log completo internamente; mensaje genérico al cliente.
    req.log.error(
      { err: err instanceof Error ? { message: err.message, stack: err.stack } : err },
      'unhandled error',
    );
    return send(reply, 500, {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Error interno del servidor',
    });
  });

  // 404 no-matched → formato uniforme
  app.setNotFoundHandler((_req, reply) => {
    return send(reply, 404, {
      code: ERROR_CODES.NOT_FOUND,
      message: 'Ruta no encontrada',
    });
  });
}
