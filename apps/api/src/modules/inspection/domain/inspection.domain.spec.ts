import { describe, expect, it } from 'vitest';

import {
  assertTemplateEditable,
  assertTemplateInput,
  assertTemplateItemInput,
  isTerminalTemplateStatus,
} from './inspection-template.js';
import {
  assertInspectionCreation,
  assertInspectionTransition,
  evaluateInspectionResponses,
  isTerminalInspectionStatus,
} from './inspection.js';

describe('Inspection Template Domain', () => {
  it('correctly identifies terminal template statuses', () => {
    expect(isTerminalTemplateStatus('ARCHIVED')).toBe(true);
    expect(isTerminalTemplateStatus('ACTIVE')).toBe(false);
    expect(isTerminalTemplateStatus('DRAFT')).toBe(false);
  });

  it('allows editing only in DRAFT status', () => {
    expect(() => assertTemplateEditable('DRAFT')).not.toThrow();
    expect(() => assertTemplateEditable('ACTIVE')).toThrowError(
      /Only DRAFT templates are editable/u,
    );
    expect(() => assertTemplateEditable('ARCHIVED')).toThrowError(
      /Only DRAFT templates are editable/u,
    );
  });

  it('validates template input name and description', () => {
    expect(assertTemplateInput({ name: '  Safety Check  ', description: '  Notes  ' })).toEqual({
      name: 'Safety Check',
      description: 'Notes',
    });

    expect(() => assertTemplateInput({ name: '' })).toThrowError(
      /Template name must be non-empty/u,
    );
    expect(() => assertTemplateInput({ name: 'a'.repeat(201) })).toThrowError(
      /Template name must be non-empty and at most 200 characters/u,
    );
  });

  it('validates template item prompt and category', () => {
    expect(
      assertTemplateItemInput({
        category: '  Brakes  ',
        prompt: '  Check pads  ',
        description: '  Extra  ',
      }),
    ).toEqual({
      category: 'Brakes',
      prompt: 'Check pads',
      description: 'Extra',
    });

    expect(() =>
      assertTemplateItemInput({
        category: '',
        prompt: 'Prompt',
      }),
    ).toThrowError(/category must be non-empty/u);

    expect(() =>
      assertTemplateItemInput({
        category: 'Cat',
        prompt: '',
      }),
    ).toThrowError(/prompt must be non-empty/u);
  });
});

describe('Inspection Domain & Response Evaluation', () => {
  it('identifies terminal inspection statuses', () => {
    expect(isTerminalInspectionStatus('COMPLETED')).toBe(true);
    expect(isTerminalInspectionStatus('CANCELLED')).toBe(true);
    expect(isTerminalInspectionStatus('DRAFT')).toBe(false);
    expect(isTerminalInspectionStatus('IN_PROGRESS')).toBe(false);
  });

  it('enforces valid inspection status transitions', () => {
    expect(() => assertInspectionTransition('DRAFT', 'IN_PROGRESS')).not.toThrow();
    expect(() => assertInspectionTransition('DRAFT', 'CANCELLED')).not.toThrow();
    expect(() => assertInspectionTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();
    expect(() => assertInspectionTransition('IN_PROGRESS', 'CANCELLED')).not.toThrow();

    expect(() => assertInspectionTransition('DRAFT', 'COMPLETED')).toThrowError(
      /Cannot transition inspection from DRAFT to COMPLETED/u,
    );
    expect(() => assertInspectionTransition('COMPLETED', 'IN_PROGRESS')).toThrowError(
      /Cannot transition inspection from terminal status COMPLETED/u,
    );
    expect(() => assertInspectionTransition('CANCELLED', 'DRAFT')).toThrowError(
      /Cannot transition inspection from terminal status CANCELLED/u,
    );
  });

  const mockItems = [
    { id: 'item-1', required: true, severity: 'NORMAL' as const },
    { id: 'item-2', required: true, severity: 'CRITICAL' as const },
    { id: 'item-3', required: false, severity: 'NORMAL' as const },
  ];

  it('computes overall PASS when all required items pass', () => {
    const responses = [
      { templateItemId: 'item-1', response: 'PASS' as const },
      { templateItemId: 'item-2', response: 'PASS' as const },
      { templateItemId: 'item-3', response: 'NOT_APPLICABLE' as const },
    ];

    const result = evaluateInspectionResponses(mockItems, responses);
    expect(result).toEqual({
      result: 'PASS',
      hasCriticalFailure: false,
    });
  });

  it('computes overall FAIL without critical flag when only NORMAL item fails', () => {
    const responses = [
      { templateItemId: 'item-1', response: 'FAIL' as const, comment: 'Tire bald' },
      { templateItemId: 'item-2', response: 'PASS' as const },
    ];

    const result = evaluateInspectionResponses(mockItems, responses);
    expect(result).toEqual({
      result: 'FAIL',
      hasCriticalFailure: false,
    });
  });

  it('computes overall FAIL with hasCriticalFailure true when CRITICAL item fails', () => {
    const responses = [
      { templateItemId: 'item-1', response: 'PASS' as const },
      { templateItemId: 'item-2', response: 'FAIL' as const, comment: 'Brake line severed' },
    ];

    const result = evaluateInspectionResponses(mockItems, responses);
    expect(result).toEqual({
      result: 'FAIL',
      hasCriticalFailure: true,
    });
  });

  it('throws error when a required item is missing a response', () => {
    const responses = [{ templateItemId: 'item-1', response: 'PASS' as const }];

    expect(() => evaluateInspectionResponses(mockItems, responses)).toThrowError(
      /Required template item item-2 is missing a response/u,
    );
  });

  it('throws error when a required item is marked NOT_APPLICABLE', () => {
    const responses = [
      { templateItemId: 'item-1', response: 'PASS' as const },
      { templateItemId: 'item-2', response: 'NOT_APPLICABLE' as const },
    ];

    expect(() => evaluateInspectionResponses(mockItems, responses)).toThrowError(
      /Required template item item-2 cannot be marked NOT_APPLICABLE/u,
    );
  });

  it('throws error on duplicate item response', () => {
    const responses = [
      { templateItemId: 'item-1', response: 'PASS' as const },
      { templateItemId: 'item-1', response: 'FAIL' as const },
      { templateItemId: 'item-2', response: 'PASS' as const },
    ];

    expect(() => evaluateInspectionResponses(mockItems, responses)).toThrowError(
      /Duplicate response submitted for template item item-1/u,
    );
  });

  it('throws error when submitting response for unknown template item', () => {
    const responses = [
      { templateItemId: 'unknown-item', response: 'PASS' as const },
      { templateItemId: 'item-1', response: 'PASS' as const },
      { templateItemId: 'item-2', response: 'PASS' as const },
    ];

    expect(() => evaluateInspectionResponses(mockItems, responses)).toThrowError(
      /Submitted response references unknown template item unknown-item/u,
    );
  });

  describe('assertInspectionCreation', () => {
    it('rejects creation if template is not ACTIVE', () => {
      expect(() =>
        assertInspectionCreation({
          type: 'PRE_TRIP',
          templateType: 'PRE_TRIP',
          templateStatus: 'DRAFT',
          vehicle: { id: 'v1', status: 'ACTIVE' },
        }),
      ).toThrowError(/Cannot create an inspection from an inactive template/u);
    });

    it('rejects creation if inspection type does not match template type', () => {
      expect(() =>
        assertInspectionCreation({
          type: 'PRE_TRIP',
          templateType: 'POST_TRIP',
          templateStatus: 'ACTIVE',
          vehicle: { id: 'v1', status: 'ACTIVE' },
        }),
      ).toThrowError(/does not match template type/u);
    });

    it('validates PRE_TRIP requires trip in READY status with matching participants', () => {
      expect(() =>
        assertInspectionCreation({
          type: 'PRE_TRIP',
          templateType: 'PRE_TRIP',
          templateStatus: 'ACTIVE',
          trip: null,
          vehicle: { id: 'v1', status: 'ACTIVE' },
        }),
      ).toThrowError(/PRE_TRIP inspections must be linked to a trip/u);

      expect(() =>
        assertInspectionCreation({
          type: 'PRE_TRIP',
          templateType: 'PRE_TRIP',
          templateStatus: 'ACTIVE',
          trip: { status: 'IN_PROGRESS', vehicleId: 'v1', driverId: 'd1', assignmentId: 'a1' },
          vehicle: { id: 'v1', status: 'ACTIVE' },
          driverId: 'd1',
          assignmentId: 'a1',
        }),
      ).toThrowError(/require a trip in READY status/u);

      expect(() =>
        assertInspectionCreation({
          type: 'PRE_TRIP',
          templateType: 'PRE_TRIP',
          templateStatus: 'ACTIVE',
          trip: { status: 'READY', vehicleId: 'v1', driverId: 'd1', assignmentId: 'a1' },
          vehicle: { id: 'v2', status: 'ACTIVE' },
          driverId: 'd1',
          assignmentId: 'a1',
        }),
      ).toThrowError(/participant details must match/u);
    });

    it('validates POST_TRIP requires trip in IN_PROGRESS status', () => {
      expect(() =>
        assertInspectionCreation({
          type: 'POST_TRIP',
          templateType: 'POST_TRIP',
          templateStatus: 'ACTIVE',
          trip: { status: 'READY', vehicleId: 'v1', driverId: 'd1', assignmentId: 'a1' },
          vehicle: { id: 'v1', status: 'ACTIVE' },
          driverId: 'd1',
          assignmentId: 'a1',
        }),
      ).toThrowError(/require a trip in IN_PROGRESS status/u);
    });

    it('validates standalone inspections cannot be created for RETIRED vehicle', () => {
      expect(() =>
        assertInspectionCreation({
          type: 'PERIODIC',
          templateType: 'PERIODIC',
          templateStatus: 'ACTIVE',
          vehicle: { id: 'v1', status: 'RETIRED' },
        }),
      ).toThrowError(/Cannot create standalone inspections for a RETIRED vehicle/u);

      expect(() =>
        assertInspectionCreation({
          type: 'SAFETY',
          templateType: 'SAFETY',
          templateStatus: 'ACTIVE',
          vehicle: { id: 'v1', status: 'ACTIVE' },
        }),
      ).not.toThrow();
    });
  });
});
