import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
}

const safeRequestId = /^[a-zA-Z0-9._:-]{1,100}$/u;

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const suppliedRequestId = request.header('x-request-id');
  const requestId =
    suppliedRequestId !== undefined && safeRequestId.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();

  (request as RequestWithId).requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
