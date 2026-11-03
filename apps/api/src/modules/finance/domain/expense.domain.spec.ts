import { describe, expect, it } from 'vitest';
import { ExpenseCategoryStatus, ExpenseStatus } from '@vms/database';
import { ExpenseCategory } from './expense-category.js';
import { Expense } from './expense.js';
import {
  ConcurrencyConflictError,
  EvidenceImmutableError,
  ExpenseAlreadyPostedError,
  ExpenseAlreadyVoidedError,
  InvalidExpenseStateError,
} from './finance-errors.js';

describe('Expense & ExpenseCategory Domain Model', () => {
  describe('ExpenseCategory', () => {
    it('creates an active expense category', () => {
      const cat = ExpenseCategory.create({
        id: 'cat-1',
        organizationId: 'org-1',
        code: 'PARKING',
        name: 'Parking Fees',
        description: 'Downtown street and garage parking',
        createdById: 'user-1',
      });

      expect(cat.id).toBe('cat-1');
      expect(cat.code).toBe('PARKING');
      expect(cat.name).toBe('Parking Fees');
      expect(cat.status).toBe(ExpenseCategoryStatus.ACTIVE);
    });

    it('validates code format', () => {
      expect(() =>
        ExpenseCategory.create({
          id: 'cat-2',
          organizationId: 'org-1',
          code: 'invalid code!',
          name: 'Invalid',
          createdById: 'user-1',
        }),
      ).toThrow(InvalidExpenseStateError);
    });

    it('archives category', () => {
      const cat = ExpenseCategory.create({
        id: 'cat-1',
        organizationId: 'org-1',
        code: 'TOLL',
        name: 'Tolls',
        createdById: 'user-1',
      });

      cat.archive('user-2');
      expect(cat.status).toBe(ExpenseCategoryStatus.ARCHIVED);
      expect(cat.updatedBy).toBe('user-2');
    });
  });

  describe('Expense Aggregate', () => {
    const baseParams = {
      id: '22222222-2222-4222-8222-222222222222',
      organizationId: 'org-1',
      displayId: 'EXP-1001',
      categoryId: 'cat-1',
      occurredAt: new Date('2026-06-01T14:30:00Z'),
      description: 'Highway toll charge during delivery',
      amount: 14.5,
      currencyCode: 'USD',
      createdById: 'user-1',
    };

    it('creates draft expense by default', () => {
      const exp = Expense.create(baseParams);

      expect(exp.id).toBe(baseParams.id);
      expect(exp.displayId).toBe('EXP-1001');
      expect(exp.amount).toBe(14.5);
      expect(exp.currencyCode).toBe('USD');
      expect(exp.status).toBe(ExpenseStatus.DRAFT);
    });

    it('can create directly as POSTED', () => {
      const exp = Expense.create({
        ...baseParams,
        status: ExpenseStatus.POSTED,
      });

      expect(exp.status).toBe(ExpenseStatus.POSTED);
    });

    it('rejects non-positive amounts', () => {
      expect(() =>
        Expense.create({
          ...baseParams,
          amount: 0,
        }),
      ).toThrow(InvalidExpenseStateError);

      expect(() =>
        Expense.create({
          ...baseParams,
          amount: -5,
        }),
      ).toThrow(InvalidExpenseStateError);
    });

    it('updates draft fields', () => {
      const exp = Expense.create(baseParams);

      exp.updateDraft({
        amount: 25.0,
        description: 'Updated description',
        vendorName: 'EZ-Pass',
        updatedBy: 'user-2',
      });

      expect(exp.amount).toBe(25.0);
      expect(exp.description).toBe('Updated description');
      expect(exp.vendorName).toBe('EZ-Pass');
      expect(exp.version).toBe(2);
    });

    it('posts a draft expense', () => {
      const exp = Expense.create(baseParams);
      exp.post('user-1');

      expect(exp.status).toBe(ExpenseStatus.POSTED);
    });

    it('cannot update draft fields once posted', () => {
      const exp = Expense.create({
        ...baseParams,
        status: ExpenseStatus.POSTED,
      });

      expect(() =>
        exp.updateDraft({
          amount: 50.0,
          updatedBy: 'user-2',
        }),
      ).toThrow(ExpenseAlreadyPostedError);
    });

    it('voids a posted expense with mandatory reason', () => {
      const exp = Expense.create({
        ...baseParams,
        status: ExpenseStatus.POSTED,
      });

      expect(() => exp.voidExpense('', 'user-1')).toThrow(InvalidExpenseStateError);

      exp.voidExpense('Entered under incorrect vehicle', 'user-2');

      expect(exp.status).toBe(ExpenseStatus.VOIDED);
      expect(exp.voidReason).toBe('Entered under incorrect vehicle');
      expect(exp.voidedBy).toBe('user-2');
    });

    it('cannot void an already voided expense', () => {
      const exp = Expense.create({
        ...baseParams,
        status: ExpenseStatus.POSTED,
      });
      exp.voidExpense('First void', 'user-1');

      expect(() => exp.voidExpense('Second void', 'user-1')).toThrow(ExpenseAlreadyVoidedError);
    });

    it('enforces receipt immutability once POSTED (only DRAFT allows receipt changes)', () => {
      const exp = Expense.create(baseParams);
      // In DRAFT, can attach receipt
      exp.attachReceipt(
        {
          storageKey: 'tenants/org-1/finance/expenses/rec.pdf',
          fileName: 'rec.pdf',
          contentType: 'application/pdf',
          sizeBytes: 512,
        },
        'user-1',
      );
      expect(exp.receipt).not.toBeNull();

      // Post the expense
      exp.post('user-1');
      expect(exp.status).toBe(ExpenseStatus.POSTED);

      // Once POSTED, attaching or detaching receipt is rejected
      expect(() =>
        exp.attachReceipt(
          {
            storageKey: 'tenants/org-1/finance/expenses/new.pdf',
            fileName: 'new.pdf',
            contentType: 'application/pdf',
            sizeBytes: 1024,
          },
          'user-1',
        ),
      ).toThrow(EvidenceImmutableError);

      expect(() => exp.detachReceipt('user-1')).toThrow(EvidenceImmutableError);
    });

    it('enforces optimistic concurrency version on post and void', () => {
      const exp = Expense.create(baseParams);
      expect(exp.version).toBe(1);

      // Mismatched expected version on post fails
      expect(() => exp.post('user-1', 99)).toThrow(ConcurrencyConflictError);

      // Valid expected version succeeds and increments
      exp.post('user-1', 1);
      expect(exp.version).toBe(2);

      // Mismatched expected version on void fails
      expect(() => exp.voidExpense('Void reason', 'user-1', 99)).toThrow(ConcurrencyConflictError);

      // Valid expected version on void succeeds
      exp.voidExpense('Void reason', 'user-1', 2);
      expect(exp.version).toBe(3);
      expect(exp.status).toBe(ExpenseStatus.VOIDED);
    });
  });
});
