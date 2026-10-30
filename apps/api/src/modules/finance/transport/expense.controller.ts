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
  Put,
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
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDraftDto,
  VoidExpenseDto,
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
      'expense-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Finance - Expenses')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization context',
})
@TenantScoped()
@Controller('expenses')
export class ExpenseController {
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

  @Post()
  @RequirePermissions('expense.create')
  @ApiOperation({ summary: 'Create a new expense (DRAFT or POSTED)' })
  @ApiCreatedResponse({ description: 'Expense created successfully' })
  async createExpense(@Req() req: AuthenticatedRequest, @Body() dto: CreateExpenseDto) {
    return this.financeService.createExpense(
      req.tenant!.organizationId,
      {
        categoryId: dto.categoryId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        tripId: dto.tripId,
        maintenanceWorkOrderId: dto.maintenanceWorkOrderId,
        occurredAt: new Date(dto.occurredAt),
        description: dto.description,
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        vendorName: dto.vendorName,
        referenceNumber: dto.referenceNumber,
        status: dto.status,
      },
      mutationMetadata(req),
    );
  }

  @Get()
  @RequirePermissions('expense.read')
  @ApiOperation({ summary: 'List expenses with optional filters' })
  @ApiOkResponse({ description: 'Paginated list of expenses' })
  async listExpenses(@Req() req: AuthenticatedRequest, @Query() query: ListExpensesQueryDto) {
    return this.financeService.listExpenses(req.tenant!.organizationId, {
      categoryId: query.categoryId,
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      tripId: query.tripId,
      maintenanceWorkOrderId: query.maintenanceWorkOrderId,
      status: query.status,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':expenseId')
  @RequirePermissions('expense.read')
  @ApiOperation({ summary: 'Get expense details by ID' })
  @ApiOkResponse({ description: 'Expense details' })
  async getExpense(
    @Req() req: AuthenticatedRequest,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
  ) {
    return this.financeService.getExpense(req.tenant!.organizationId, expenseId);
  }

  @Put(':expenseId')
  @RequirePermissions('expense.create')
  @ApiOperation({ summary: 'Update a draft expense' })
  @ApiOkResponse({ description: 'Expense updated successfully' })
  async updateExpenseDraft(
    @Req() req: AuthenticatedRequest,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
    @Body() dto: UpdateExpenseDraftDto,
  ) {
    return this.financeService.updateExpenseDraft(
      req.tenant!.organizationId,
      expenseId,
      {
        ...dto,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      },
      mutationMetadata(req),
    );
  }

  @Post(':expenseId/post')
  @RequirePermissions('expense.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post a draft expense to finalize it' })
  @ApiOkResponse({ description: 'Expense posted successfully' })
  async postExpense(
    @Req() req: AuthenticatedRequest,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
  ) {
    return this.financeService.postExpense(
      req.tenant!.organizationId,
      expenseId,
      mutationMetadata(req),
    );
  }

  @Post(':expenseId/void')
  @RequirePermissions('expense.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void a posted expense with mandatory reason' })
  @ApiOkResponse({ description: 'Expense voided successfully' })
  async voidExpense(
    @Req() req: AuthenticatedRequest,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
    @Body() dto: VoidExpenseDto,
  ) {
    return this.financeService.voidExpense(
      req.tenant!.organizationId,
      expenseId,
      dto,
      mutationMetadata(req),
    );
  }

  @Post(':expenseId/receipt')
  @RequirePermissions('expense.manage')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a receipt attachment for expense' })
  @ApiOkResponse({ description: 'Receipt attached successfully' })
  async uploadExpenseReceipt(
    @Req() req: AuthenticatedRequest,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
    @UploadedFile() file: MulterUploadedFile,
  ) {
    return this.financeService.uploadExpenseReceipt(
      req.tenant!.organizationId,
      expenseId,
      file,
      mutationMetadata(req),
    );
  }

  @Get(':expenseId/receipt-url')
  @RequirePermissions('finance.receipt.download')
  @ApiOperation({ summary: 'Get presigned download URL for expense receipt' })
  @ApiOkResponse({ description: 'Presigned URL for expense receipt' })
  async getExpenseReceiptUrl(
    @Req() req: AuthenticatedRequest,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
  ) {
    return this.financeService.getExpenseReceiptDownloadUrl(req.tenant!.organizationId, expenseId);
  }
}
