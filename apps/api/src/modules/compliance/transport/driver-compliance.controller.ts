import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApplicationError } from '../../foundation/domain/errors.js';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { ComplianceService } from '../application/compliance.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import { ListComplianceDocumentsQueryDto, UploadComplianceDocumentDto } from './compliance.dto.js';

interface MulterUploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
}

function mutationMetadata(request: AuthenticatedRequest) {
  const ipAddress = request.ip ?? '127.0.0.1';
  const userAgent = Array.isArray(request.headers['user-agent'])
    ? request.headers['user-agent'][0]
    : (request.headers['user-agent'] ?? 'unknown');

  return {
    actorId: request.principal.userId,
    requestId:
      request.requestId ??
      (Array.isArray(request.headers['x-request-id'])
        ? request.headers['x-request-id'][0]
        : request.headers['x-request-id']) ??
      'driver-compliance-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Driver Compliance')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization context',
})
@TenantScoped()
@Controller('drivers/:driverId/compliance')
export class DriverComplianceController {
  constructor(@Inject(ComplianceService) private readonly complianceService: ComplianceService) {}

  @Get()
  @RequirePermissions('compliance.read')
  @ApiOperation({ summary: 'Get compliance evaluation and active documents for driver' })
  @ApiOkResponse({ description: 'Driver compliance status and requirements checklist' })
  async getComplianceStatus(
    @Req() req: AuthenticatedRequest,
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ) {
    return this.complianceService.evaluateDriverCompliance(req.tenant!.organizationId, driverId);
  }

  @Get('documents')
  @RequirePermissions('compliance.read')
  @ApiOperation({ summary: 'List all compliance documents for driver' })
  @ApiOkResponse({ description: 'List of compliance documents' })
  async listDocuments(
    @Req() req: AuthenticatedRequest,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() query: ListComplianceDocumentsQueryDto,
  ) {
    return this.complianceService.listDocumentsForSubject(
      req.tenant!.organizationId,
      'DRIVER',
      driverId,
      query,
    );
  }

  @Post('documents')
  @RequirePermissions('compliance.document.upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a compliance document for driver' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentTypeId: { type: 'string' },
        documentNumber: { type: 'string' },
        issuingAuthority: { type: 'string' },
        issuedOn: { type: 'string', format: 'date' },
        expiresOn: { type: 'string', format: 'date' },
        notes: { type: 'string' },
      },
      required: ['file', 'documentTypeId'],
    },
  })
  @ApiCreatedResponse({ description: 'Document uploaded successfully' })
  async uploadDocument(
    @Req() req: AuthenticatedRequest,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: UploadComplianceDocumentDto,
    @UploadedFile() file?: MulterUploadedFile,
  ) {
    if (!file || !file.buffer) {
      throw new ApplicationError(
        'INVALID_COMPLIANCE_DATA',
        'A document file (PDF, PNG, or JPEG) is required.',
      );
    }

    return this.complianceService.uploadDocument(
      req.tenant!.organizationId,
      {
        subjectType: 'DRIVER',
        subjectId: driverId,
        documentTypeId: dto.documentTypeId,
        documentNumber: dto.documentNumber,
        issuingAuthority: dto.issuingAuthority,
        issuedOn: dto.issuedOn,
        expiresOn: dto.expiresOn,
        notes: dto.notes,
      },
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype ?? 'application/octet-stream',
      },
      mutationMetadata(req),
    );
  }
}
