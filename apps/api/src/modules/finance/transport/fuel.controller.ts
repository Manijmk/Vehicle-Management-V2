import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { FinanceService } from '../application/finance.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata
import {
  CreateFuelTransactionDto,
  ImportFuelCsvDto,
  ListFuelTransactionsQueryDto,
  VoidFuelTransactionDto,
} from './finance.dto.js';

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
      'fuel-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Finance - Fuel')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization context',
})
@TenantScoped()
@Controller('fuel')
export class FuelController {
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

  @Post()
  @RequirePermissions('fuel.create')
  @ApiOperation({ summary: 'Create a fuel transaction' })
  @ApiCreatedResponse({ description: 'Fuel transaction created successfully' })
  async createFuelTransaction(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateFuelTransactionDto,
  ) {
    return this.financeService.createFuelTransaction(
      req.tenant!.organizationId,
      {
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        tripId: dto.tripId,
        occurredAt: new Date(dto.occurredAt),
        energyType: dto.energyType,
        quantity: dto.quantity,
        quantityUnit: dto.quantityUnit,
        unitPrice: dto.unitPrice,
        totalAmount: dto.totalAmount,
        currencyCode: dto.currencyCode,
        odometerKm: dto.odometerKm,
        stationName: dto.stationName,
        referenceNumber: dto.referenceNumber,
      },
      mutationMetadata(req),
    );
  }

  @Get()
  @RequirePermissions('fuel.read')
  @ApiOperation({ summary: 'List fuel transactions with optional filters' })
  @ApiOkResponse({ description: 'Paginated list of fuel transactions' })
  async listFuelTransactions(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListFuelTransactionsQueryDto,
  ) {
    return this.financeService.listFuelTransactions(req.tenant!.organizationId, {
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      tripId: query.tripId,
      status: query.status,
      hasAnomalies: query.hasAnomalies,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':transactionId')
  @RequirePermissions('fuel.read')
  @ApiOperation({ summary: 'Get fuel transaction details by ID' })
  @ApiOkResponse({ description: 'Fuel transaction details' })
  async getFuelTransaction(
    @Req() req: AuthenticatedRequest,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ) {
    return this.financeService.getFuelTransaction(req.tenant!.organizationId, transactionId);
  }

  @Post(':transactionId/void')
  @RequirePermissions('fuel.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void a fuel transaction with reason' })
  @ApiOkResponse({ description: 'Fuel transaction voided successfully' })
  async voidFuelTransaction(
    @Req() req: AuthenticatedRequest,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Body() dto: VoidFuelTransactionDto,
  ) {
    return this.financeService.voidFuelTransaction(
      req.tenant!.organizationId,
      transactionId,
      dto,
      mutationMetadata(req),
    );
  }

  @Post(':transactionId/receipt')
  @RequirePermissions('fuel.manage')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a receipt attachment for fuel transaction' })
  @ApiOkResponse({ description: 'Receipt attached successfully' })
  async uploadFuelReceipt(
    @Req() req: AuthenticatedRequest,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @UploadedFile() file: MulterUploadedFile,
  ) {
    return this.financeService.uploadFuelReceipt(
      req.tenant!.organizationId,
      transactionId,
      file,
      mutationMetadata(req),
    );
  }

  @Get(':transactionId/receipt-url')
  @RequirePermissions('finance.receipt.download')
  @ApiOperation({ summary: 'Get presigned download URL for fuel receipt' })
  @ApiOkResponse({ description: 'Presigned URL for fuel receipt' })
  async getFuelReceiptUrl(
    @Req() req: AuthenticatedRequest,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ) {
    return this.financeService.getFuelReceiptDownloadUrl(req.tenant!.organizationId, transactionId);
  }

  @Post('import-preview')
  @RequirePermissions('fuel.import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview CSV fuel import rows and validate errors' })
  @ApiOkResponse({ description: 'CSV import preview results' })
  async importPreview(@Req() req: AuthenticatedRequest, @Body() dto: ImportFuelCsvDto) {
    return this.financeService.importFuelCsvPreview(req.tenant!.organizationId, dto.csvContent);
  }

  @Post('import-confirm')
  @RequirePermissions('fuel.import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm and execute CSV fuel import' })
  @ApiOkResponse({ description: 'Import execution results' })
  async importConfirm(@Req() req: AuthenticatedRequest, @Body() dto: ImportFuelCsvDto) {
    return this.financeService.importFuelCsvConfirm(
      req.tenant!.organizationId,
      dto.csvContent,
      mutationMetadata(req),
    );
  }
}
