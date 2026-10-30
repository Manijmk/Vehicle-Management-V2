import { Module } from '@nestjs/common';
import { OBJECT_STORAGE_PORT } from '../compliance/compliance.tokens.js';
import { S3ObjectStorageAdapter } from '../compliance/infrastructure/s3-object-storage.adapter.js';
import { FinanceService } from './application/finance.service.js';
import { FINANCE_REPOSITORY } from './finance.tokens.js';
import { PrismaFinanceRepository } from './infrastructure/prisma-finance.repository.js';
import { ExpenseCategoryController } from './transport/expense-category.controller.js';
import { ExpenseController } from './transport/expense.controller.js';
import { FinanceSummaryController } from './transport/finance-summary.controller.js';
import { FuelController } from './transport/fuel.controller.js';

@Module({
  controllers: [
    FuelController,
    ExpenseController,
    ExpenseCategoryController,
    FinanceSummaryController,
  ],
  providers: [
    FinanceService,
    {
      provide: FINANCE_REPOSITORY,
      useClass: PrismaFinanceRepository,
    },
    {
      provide: OBJECT_STORAGE_PORT,
      useClass: S3ObjectStorageAdapter,
    },
  ],
  exports: [FinanceService, FINANCE_REPOSITORY],
})
export class FinanceModule {}
