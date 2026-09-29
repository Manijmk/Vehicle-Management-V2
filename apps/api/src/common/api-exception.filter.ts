import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ApiErrorResponse } from '@vms/contracts';
import type { Response } from 'express';

import type { RequestWithId } from './request-id.middleware.js';
import { ApplicationError } from '../modules/foundation/domain/errors.js';

interface NestErrorBody {
  readonly error?: string;
  readonly message?: string | string[];
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof ApplicationError
        ? this.applicationStatus(exception.code)
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionBody = exception instanceof HttpException ? exception.getResponse() : undefined;
    const normalizedBody =
      exception instanceof ApplicationError
        ? {
            error: exception.code,
            message: exception.message,
            ...(exception.details === undefined ? {} : { details: exception.details }),
          }
        : this.normalizeBody(exceptionBody);
    const fallbackMessage =
      status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal server error' : 'Request failed';

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled request error (${request.requestId})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = {
      error: {
        code: normalizedBody.error ?? `HTTP_${status}`,
        message: Array.isArray(normalizedBody.message)
          ? 'Request validation failed'
          : (normalizedBody.message ?? fallbackMessage),
        ...(Array.isArray(normalizedBody.message) ? { details: normalizedBody.message } : {}),
      },
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    response.status(status).json(body);
  }

  private normalizeBody(body: string | object | undefined): NestErrorBody {
    if (typeof body === 'string') {
      return { message: body };
    }

    if (body !== undefined && 'message' in body) {
      return body as NestErrorBody;
    }

    return {};
  }

  private applicationStatus(code: ApplicationError['code']): number {
    switch (code) {
      case 'UNAUTHENTICATED':
        return HttpStatus.UNAUTHORIZED;
      case 'PERMISSION_DENIED':
      case 'INVALID_TENANT_CONTEXT':
      case 'INACTIVE_MEMBERSHIP':
        return HttpStatus.FORBIDDEN;
      case 'ORGANIZATION_NOT_FOUND':
      case 'USER_NOT_FOUND':
      case 'MEMBERSHIP_NOT_FOUND':
      case 'ROLE_NOT_FOUND':
      case 'VEHICLE_NOT_FOUND':
      case 'DRIVER_NOT_FOUND':
      case 'DRIVER_LICENSE_NOT_FOUND':
        return HttpStatus.NOT_FOUND;
      case 'INVALID_LICENSE_DATE_RANGE':
      case 'INVALID_DRIVER_DATA':
        return HttpStatus.BAD_REQUEST;
      case 'MEMBERSHIP_ALREADY_EXISTS':
      case 'INVALID_MEMBERSHIP_TRANSITION':
      case 'INVALID_ROLE_ASSIGNMENT':
      case 'INVALID_VEHICLE_TRANSITION':
      case 'INVALID_VEHICLE_DATA':
      case 'VEHICLE_ALREADY_EXISTS':
      case 'DRIVER_ALREADY_EXISTS':
      case 'DRIVER_EMPLOYEE_NUMBER_EXISTS':
      case 'DRIVER_LICENSE_EXISTS':
      case 'DRIVER_LICENSE_EXPIRED':
      case 'NO_VALID_DRIVER_LICENSE':
      case 'INVALID_DRIVER_STATUS_TRANSITION':
      case 'DRIVER_INACTIVE':
      case 'CONCURRENCY_CONFLICT':
      case 'CONFLICT':
        return HttpStatus.CONFLICT;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
