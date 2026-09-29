import { ERROR_HTTP_STATUS, type ErrorCode } from '@bajet/contracts';

/** Domain error rendered as `{"error":{"code","message","details","requestId"}}`. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.status = ERROR_HTTP_STATUS[code];
  }
}

export const notFound = (what = 'Resource'): AppError => new AppError('NOT_FOUND', `${what} not found.`);
export const stateChanged = (details?: Record<string, unknown>): AppError =>
  new AppError('STATE_CHANGED', 'The resource changed. Please reload and try again.', details);
export const validationError = (field: string, message: string): AppError =>
  new AppError('VALIDATION_ERROR', message, { fields: [{ field, message }] });
