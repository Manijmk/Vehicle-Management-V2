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
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './finance.dto.js';

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
      'category-request',
    ipAddress,
    userAgent,
  };
}

@ApiTags('Finance - Expense Categories')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Tenant organization context',
})
@TenantScoped()
@Controller('expense-categories')
export class ExpenseCategoryController {
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

  @Post()
  @RequirePermissions('expense.category.manage')
  @ApiOperation({ summary: 'Create a new expense category' })
  @ApiCreatedResponse({ description: 'Expense category created successfully' })
  async createCategory(@Req() req: AuthenticatedRequest, @Body() dto: CreateExpenseCategoryDto) {
    return this.financeService.createExpenseCategory(
      req.tenant!.organizationId,
      dto,
      mutationMetadata(req),
    );
  }

  @Get()
  @RequirePermissions('expense.read')
  @ApiOperation({ summary: 'List expense categories' })
  @ApiOkResponse({ description: 'List of expense categories' })
  async listCategories(
    @Req() req: AuthenticatedRequest,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.financeService.listExpenseCategories(
      req.tenant!.organizationId,
      includeArchived === 'true',
    );
  }

  @Put(':categoryId')
  @RequirePermissions('expense.category.manage')
  @ApiOperation({ summary: 'Update an expense category' })
  @ApiOkResponse({ description: 'Expense category updated successfully' })
  async updateCategory(
    @Req() req: AuthenticatedRequest,
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.financeService.updateExpenseCategory(
      req.tenant!.organizationId,
      categoryId,
      dto,
      mutationMetadata(req),
    );
  }

  @Post(':categoryId/archive')
  @RequirePermissions('expense.category.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an expense category' })
  @ApiOkResponse({ description: 'Expense category archived successfully' })
  async archiveCategory(
    @Req() req: AuthenticatedRequest,
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
  ) {
    return this.financeService.archiveExpenseCategory(
      req.tenant!.organizationId,
      categoryId,
      mutationMetadata(req),
    );
  }
}
