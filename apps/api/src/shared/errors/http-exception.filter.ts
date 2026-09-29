import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import type { ApiErrorBody, ErrorCode } from '@bajet/contracts';
import { AppError } from './app-error';
import { requestIdOf } from '../http/request-id.middleware';

const HTTP_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'STATE_CHANGED',
  413: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

/** Unique-constraint name → public field name, for `409 DUPLICATE_ENTITY {field}`. */
const UNIQUE_FIELDS: Record<string, string> = {
  uq_merchant_national_id: 'nationalId',
  uq_merchant_economic_id: 'economicId',
  uq_provider_national_id: 'nationalId',
  uq_provider_economic_id: 'economicId',
  uq_admin_phone: 'phone',
  uq_role_name: 'name',
  uq_gateway_code: 'code',
  uq_template_active: 'event',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = requestIdOf(req);
    let status = 500;
    let body: ApiErrorBody['error'] = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId };

    if (exception instanceof AppError) {
      status = exception.status;
      body = { code: exception.code, message: exception.message, details: exception.details, requestId };
      if (exception.headers) for (const [k, v] of Object.entries(exception.headers)) res.setHeader(k, v);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as { message?: unknown } | string;
      const message = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join('; ') : String(r.message ?? exception.message);
      body = { code: HTTP_TO_CODE[status] ?? 'INTERNAL_ERROR', message, requestId };
    } else if (exception instanceof QueryFailedError && (exception as QueryFailedError & { code?: string }).code === '23505') {
      const constraint = (exception as unknown as { constraint?: string }).constraint ?? '';
      status = 409;
      body = {
        code: 'DUPLICATE_ENTITY',
        message: 'A record with the same unique value already exists.',
        details: { field: UNIQUE_FIELDS[constraint] ?? constraint },
        requestId,
      };
    } else {
      this.logger.error(`Unhandled error on ${req.method} ${req.originalUrl} [${requestId}]`, (exception as Error)?.stack ?? String(exception));
    }
    if (status >= 500 && !(exception instanceof AppError)) {
      body.message = 'An unexpected error occurred.';
    }
    if (!res.headersSent) res.status(status).json({ error: body } satisfies ApiErrorBody);
  }
}
