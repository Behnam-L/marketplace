import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { HEADER_IF_MATCH } from '@bajet/contracts';
import { AppError } from '../errors/app-error';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip ?? null, userAgent: req.header('user-agent')?.slice(0, 500) ?? null };
});

/** `IM` — required `If-Match: <version>` header. */
export const IfMatch = createParamDecorator((_: unknown, ctx: ExecutionContext): number => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const raw = req.header(HEADER_IF_MATCH)?.replace(/^W\//, '').replace(/"/g, '');
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 0) {
    throw new AppError('VALIDATION_ERROR', 'An If-Match header with the current version is required.', {
      fields: [{ field: 'If-Match', message: 'Required integer version.' }],
    });
  }
  return n;
});
