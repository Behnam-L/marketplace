import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { HEADER_REQUEST_ID } from '@bajet/contracts';

const KEY = Symbol('requestId');

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER_REQUEST_ID);
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  (req as unknown as Record<symbol, string>)[KEY] = id;
  res.setHeader(HEADER_REQUEST_ID, id);
  next();
}

export function requestIdOf(req: Request): string {
  return (req as unknown as Record<symbol, string>)[KEY] ?? 'unknown';
}
