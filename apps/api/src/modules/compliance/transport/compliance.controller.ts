import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApplicationError } from '../../foundation/domain/errors.js';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { ComplianceService } from '../application/compliance.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import {
  ComplianceExceptionsQueryDto,
  CreateDocumentTypeDto,
  ListComplianceDocumentsQueryDto,
  ListDocumentTypesQueryDto,
  ReplaceComplianceDocumentDto,
  RevokeComplianceDocumentDto,
  UpdateDocumentTypeDto,
} from './compliance.dto.js';

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
      'compliance-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Compliance')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization context',
})
@TenantScoped()
@Controller('compliance')
export class ComplianceController {
  constructor(@Inject(ComplianceService) private readonly complianceService: ComplianceService) {}

  // =========================================================================
  // Document Types Catalog
  // =========================================================================

  @Post('document-types')
  @RequirePermissions('compliance.type.manage')
  @ApiOperation({ summary: 'Create a new compliance document type' })
  @ApiCreatedResponse({ description: 'Compliance document type created successfully' })
  async createDocumentType(@Req() req: AuthenticatedRequest, @Body() dto: CreateDocumentTypeDto) {
    return this.complianceService.createDocumentType(
      req.tenant!.organizationId,
      dto,
      mutationMetadata(req),
    );
  }

  @Get('document-types')
  @RequirePermissions('compliance.type.read')
  @ApiOperation({ summary: 'List compliance document types' })
  @ApiOkResponse({ description: 'List of compliance document types' })
  async listDocumentTypes(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListDocumentTypesQueryDto,
  ) {
    return this.complianceService.listDocumentTypes(req.tenant!.organizationId, query);
  }

  @Get('document-types/:typeId')
  @RequirePermissions('compliance.type.read')
  @ApiOperation({ summary: 'Get compliance document type by ID' })
  @ApiOkResponse({ description: 'Compliance document type detail' })
  @ApiNotFoundResponse({ description: 'Document type not found' })
  async getDocumentType(
    @Req() req: AuthenticatedRequest,
    @Param('typeId', ParseUUIDPipe) typeId: string,
  ) {
    return this.complianceService.getDocumentType(req.tenant!.organizationId, typeId);
  }

  @Patch('document-types/:typeId')
  @RequirePermissions('compliance.type.manage')
  @ApiOperation({ summary: 'Update compliance document type policies' })
  @ApiOkResponse({ description: 'Updated compliance document type' })
  async updateDocumentType(
    @Req() req: AuthenticatedRequest,
    @Param('typeId', ParseUUIDPipe) typeId: string,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.complianceService.updateDocumentType(
      req.tenant!.organizationId,
      typeId,
      dto,
      mutationMetadata(req),
    );
  }

  @Post('document-types/:typeId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('compliance.type.manage')
  @ApiOperation({ summary: 'Archive a compliance document type' })
  @ApiOkResponse({ description: 'Document type archived' })
  async archiveDocumentType(
    @Req() req: AuthenticatedRequest,
    @Param('typeId', ParseUUIDPipe) typeId: string,
  ) {
    return this.complianceService.archiveDocumentType(
      req.tenant!.organizationId,
      typeId,
      mutationMetadata(req),
    );
  }

  // =========================================================================
  // Compliance Documents Global List & Single Actions
  // =========================================================================

  @Get('documents')
  @RequirePermissions('compliance.read')
  @ApiOperation({ summary: 'List all compliance documents with filters' })
  @ApiOkResponse({ description: 'List of compliance documents' })
  async listDocuments(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListComplianceDocumentsQueryDto,
  ) {
    return this.complianceService.listDocuments(req.tenant!.organizationId, query);
  }

  @Get('documents/:documentId')
  @RequirePermissions('compliance.read')
  @ApiOperation({ summary: 'Get compliance document metadata by ID' })
  @ApiOkResponse({ description: 'Compliance document details' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async getDocument(
    @Req() req: AuthenticatedRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.complianceService.getDocument(req.tenant!.organizationId, documentId);
  }

  @Post('documents/:documentId/replace')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('compliance.document.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Replace an active compliance document with a new version' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentNumber: { type: 'string' },
        issuingAuthority: { type: 'string' },
        issuedOn: { type: 'string', format: 'date' },
        expiresOn: { type: 'string', format: 'date' },
        notes: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'New replacement document created' })
  async replaceDocument(
    @Req() req: AuthenticatedRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReplaceComplianceDocumentDto,
    @UploadedFile() file?: MulterUploadedFile,
  ) {
    if (!file || !file.buffer) {
      throw new ApplicationError(
        'INVALID_COMPLIANCE_DATA',
        'A replacement document file (PDF, PNG, or JPEG) is required.',
      );
    }

    return this.complianceService.replaceDocument(
      req.tenant!.organizationId,
      documentId,
      {
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

  @Post('documents/:documentId/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('compliance.document.manage')
  @ApiOperation({ summary: 'Revoke an active compliance document' })
  @ApiOkResponse({ description: 'Document revoked successfully' })
  async revokeDocument(
    @Req() req: AuthenticatedRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: RevokeComplianceDocumentDto,
  ) {
    return this.complianceService.revokeDocument(
      req.tenant!.organizationId,
      documentId,
      dto,
      mutationMetadata(req),
    );
  }

  @Get('documents/:documentId/download-url')
  @RequirePermissions('compliance.document.download')
  @ApiOperation({ summary: 'Generate secure pre-signed download URL' })
  @ApiOkResponse({ description: 'Download URL with short expiry' })
  async getSignedDownloadUrl(
    @Req() req: AuthenticatedRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.complianceService.getSignedDownloadUrl(
      req.tenant!.organizationId,
      documentId,
      mutationMetadata(req),
    );
  }

  // =========================================================================
  // Fleet Summary & Exceptions
  // =========================================================================

  @Get('summary')
  @RequirePermissions('compliance.read')
  @ApiOperation({ summary: 'Get fleet compliance overview counters' })
  @ApiOkResponse({ description: 'Summary statistics for fleet compliance' })
  async getSummary(@Req() req: AuthenticatedRequest) {
    return this.complianceService.getComplianceSummary(req.tenant!.organizationId);
  }

  @Get('exceptions')
  @RequirePermissions('compliance.read')
  @ApiOperation({ summary: 'Get list of subjects with compliance issues' })
  @ApiOkResponse({ description: 'Exceptions list' })
  async getExceptions(
    @Req() req: AuthenticatedRequest,
    @Query() query: ComplianceExceptionsQueryDto,
  ) {
    return this.complianceService.getComplianceExceptions(req.tenant!.organizationId, query);
  }
}
