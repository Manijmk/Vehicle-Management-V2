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
      case 'ASSIGNMENT_NOT_FOUND':
      case 'TRIP_NOT_FOUND':
      case 'INSPECTION_NOT_FOUND':
      case 'INSPECTION_TEMPLATE_NOT_FOUND':
        return HttpStatus.NOT_FOUND;
      case 'INVALID_LICENSE_DATE_RANGE':
      case 'INVALID_DRIVER_DATA':
      case 'ASSIGNMENT_DATES_INVALID':
      case 'ASSIGNMENT_REASON_REQUIRED':
      case 'INVALID_ASSIGNMENT_DATE_RANGE':
      case 'INVALID_ASSIGNMENT_DATA':
      case 'TRIP_PLANNING_INVALID':
      case 'INVALID_START_ODOMETER':
      case 'INVALID_END_ODOMETER':
      case 'INSPECTION_REQUIRED_RESPONSES_MISSING':
      case 'INSPECTION_ITEM_NOT_FOUND':
      case 'INSPECTION_ITEM_NOT_APPLICABLE':
      case 'INSPECTION_ITEM_INVALID':
      case 'INSPECTION_TEMPLATE_INVALID':
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
      case 'ASSIGNMENT_ALREADY_ENDED':
      case 'INVALID_ASSIGNMENT_TRANSITION':
      case 'VEHICLE_NOT_ELIGIBLE_FOR_ASSIGNMENT':
      case 'DRIVER_NOT_ELIGIBLE_FOR_ASSIGNMENT':
      case 'VEHICLE_HAS_ACTIVE_ASSIGNMENT':
      case 'DRIVER_HAS_ACTIVE_ASSIGNMENT':
      case 'VEHICLE_ALREADY_ASSIGNED':
      case 'DRIVER_ALREADY_ASSIGNED':
      case 'ASSIGNMENT_HAS_ACTIVE_TRIP':
      case 'TRIP_ALREADY_TERMINAL':
      case 'INVALID_TRIP_STATUS_TRANSITION':
      case 'TRIP_NOT_EDITABLE':
      case 'TRIP_ASSIGNMENT_NOT_ACTIVE':
      case 'TRIP_VEHICLE_NOT_ACTIVE':
      case 'TRIP_DRIVER_NOT_ACTIVE':
      case 'TRIP_DRIVER_NOT_ELIGIBLE':
      case 'VEHICLE_HAS_IN_PROGRESS_TRIP':
      case 'DRIVER_HAS_IN_PROGRESS_TRIP':
      case 'ODOMETER_DECREASE_NOT_ALLOWED':
      case 'INSPECTION_TEMPLATE_NOT_ACTIVE':
      case 'INSPECTION_TEMPLATE_IMMUTABLE':
      case 'INSPECTION_TYPE_MISMATCH':
      case 'INVALID_INSPECTION_TRANSITION':
      case 'INSPECTION_ALREADY_TERMINAL':
      case 'PRE_TRIP_INSPECTION_REQUIRED':
      case 'PRE_TRIP_INSPECTION_FAILED':
      case 'POST_TRIP_INSPECTION_REQUIRED':
      case 'INSPECTION_VERSION_CONFLICT':
      case 'CONCURRENCY_CONFLICT':
      case 'CONFLICT':
        return HttpStatus.CONFLICT;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
