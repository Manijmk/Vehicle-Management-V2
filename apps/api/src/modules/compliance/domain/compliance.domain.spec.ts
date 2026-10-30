import { describe, expect, it } from 'vitest';
import {
  ComplianceDocument,
  ComplianceDocumentType,
  evaluateSubjectCompliance,
  InvalidDocumentDateRangeError,
} from './index.js';

describe('Compliance Domain Unit Tests', () => {
  const orgId = '10000000-0000-4000-8000-000000000001';
  const userId = '20000000-0000-4000-8000-000000000001';
  const vehicleId = '30000000-0000-4000-8000-000000000001';
  const driverId = '40000000-0000-4000-8000-000000000001';

  describe('ComplianceDocumentType', () => {
    it('creates an active document type and normalizes code', () => {
      const type = ComplianceDocumentType.create({
        id: '50000000-0000-4000-8000-000000000001',
        organizationId: orgId,
        code: '  vehicle_reg_cert  ',
        name: 'Vehicle Registration Certificate',
        subjectType: 'VEHICLE',
        createdBy: userId,
      });

      expect(type.code).toBe('VEHICLE_REG_CERT');
      expect(type.status).toBe('ACTIVE');
      expect(type.required).toBe(false);
      expect(type.blocksOperation).toBe(false);
      expect(type.version).toBe(1);
    });

    it('enforces that blocksOperation implies required = true on creation', () => {
      expect(() =>
        ComplianceDocumentType.create({
          id: '50000000-0000-4000-8000-000000000002',
          organizationId: orgId,
          code: 'VEHICLE_INSURANCE',
          name: 'Commercial Insurance',
          subjectType: 'VEHICLE',
          required: false,
          blocksOperation: true,
          createdBy: userId,
        }),
      ).toThrowError(/Document type with blocksOperation=true must have required=true/);
    });

    it('rejects invalid code or warning days', () => {
      expect(() =>
        ComplianceDocumentType.create({
          id: '50000000-0000-4000-8000-000000000003',
          organizationId: orgId,
          code: 'X',
          name: 'Invalid',
          subjectType: 'VEHICLE',
          createdBy: userId,
        }),
      ).toThrowError(/code/i);

      expect(() =>
        ComplianceDocumentType.create({
          id: '50000000-0000-4000-8000-000000000004',
          organizationId: orgId,
          code: 'VALID_CODE',
          name: 'Invalid Warning',
          subjectType: 'VEHICLE',
          warningDaysBeforeExpiry: -5,
          createdBy: userId,
        }),
      ).toThrowError(/warning days/i);
    });

    it('updates policy and preserves invariant blocksOperation implies required', () => {
      const type = ComplianceDocumentType.create({
        id: '50000000-0000-4000-8000-000000000005',
        organizationId: orgId,
        code: 'DRIVER_FITNESS',
        name: 'Driver Medical Fitness',
        subjectType: 'DRIVER',
        required: false,
        blocksOperation: false,
        createdBy: userId,
      });

      // Cannot update blocksOperation to true if required is false
      expect(() =>
        type.updatePolicy({
          blocksOperation: true,
          updatedBy: userId,
          expectedVersion: 1,
        }),
      ).toThrowError(/Document type with blocksOperation=true must have required=true/);

      // Successfully updates when both are true
      type.updatePolicy({
        required: true,
        blocksOperation: true,
        warningDaysBeforeExpiry: 45,
        updatedBy: userId,
        expectedVersion: 1,
      });

      expect(type.blocksOperation).toBe(true);
      expect(type.required).toBe(true);
      expect(type.warningDaysBeforeExpiry).toBe(45);
      expect(type.version).toBe(2);
    });

    it('archives document type and rejects mutations once archived', () => {
      const type = ComplianceDocumentType.create({
        id: '50000000-0000-4000-8000-000000000006',
        organizationId: orgId,
        code: 'OLD_PERMIT',
        name: 'Old Permit',
        subjectType: 'VEHICLE',
        createdBy: userId,
      });

      type.archive({ updatedBy: userId, expectedVersion: 1 });
      expect(type.status).toBe('ARCHIVED');
      expect(type.version).toBe(2);

      expect(() =>
        type.updatePolicy({ name: 'New Name', updatedBy: userId, expectedVersion: 2 }),
      ).toThrowError(/archived/i);
    });
  });

  describe('ComplianceDocument', () => {
    it('creates active vehicle document and validates subject linkage', () => {
      const doc = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000001',
        organizationId: orgId,
        displayId: 'DOC-00001',
        documentTypeId: '50000000-0000-4000-8000-000000000001',
        subjectType: 'VEHICLE',
        vehicleId,
        issuedOn: new Date('2026-01-01T00:00:00Z'),
        expiresOn: new Date('2026-12-31T00:00:00Z'),
        objectKey: 'organizations/org/vehicles/v1/d1/file.pdf',
        originalFileName: 'registration.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdBy: userId,
      });

      expect(doc.status).toBe('ACTIVE');
      expect(doc.vehicleId).toBe(vehicleId);
      expect(doc.driverId).toBeNull();
      expect(doc.version).toBe(1);
    });

    it('rejects vehicle document with driverId or missing vehicleId', () => {
      expect(() =>
        ComplianceDocument.create({
          id: '60000000-0000-4000-8000-000000000002',
          organizationId: orgId,
          displayId: 'DOC-00002',
          documentTypeId: '50000000-0000-4000-8000-000000000001',
          subjectType: 'VEHICLE',
          vehicleId: null,
          driverId,
          objectKey: 'key',
          originalFileName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          createdBy: userId,
        }),
      ).toThrowError(/vehicleId/i);
    });

    it('rejects invalid date range (expiresOn before issuedOn)', () => {
      expect(() =>
        ComplianceDocument.create({
          id: '60000000-0000-4000-8000-000000000003',
          organizationId: orgId,
          displayId: 'DOC-00003',
          documentTypeId: '50000000-0000-4000-8000-000000000001',
          subjectType: 'VEHICLE',
          vehicleId,
          issuedOn: new Date('2026-06-01T00:00:00Z'),
          expiresOn: new Date('2026-05-01T00:00:00Z'),
          objectKey: 'key',
          originalFileName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          createdBy: userId,
        }),
      ).toThrow(InvalidDocumentDateRangeError);
    });

    it('correctly evaluates inclusive expiry date semantics', () => {
      const doc = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000004',
        organizationId: orgId,
        displayId: 'DOC-00004',
        documentTypeId: '50000000-0000-4000-8000-000000000001',
        subjectType: 'DRIVER',
        driverId,
        issuedOn: new Date('2026-01-01T00:00:00Z'),
        expiresOn: new Date('2026-06-30T00:00:00Z'),
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      // On expiry date with warning days 10: daysUntilExpiry is 0 <= 10 -> EXPIRING_SOON (not expired yet!)
      expect(doc.evaluateCurrentState(new Date('2026-06-30T12:00:00Z'), 10)).toBe('EXPIRING_SOON');

      // 1 day after expiry date: EXPIRED
      expect(doc.evaluateCurrentState(new Date('2026-07-01T00:00:01Z'), 10)).toBe('EXPIRED');

      // Within warning window (e.g. 15 days before with 30 days warning): EXPIRING_SOON
      expect(doc.evaluateCurrentState(new Date('2026-06-15T00:00:00Z'), 30)).toBe('EXPIRING_SOON');

      // Well before warning window: VALID
      expect(doc.evaluateCurrentState(new Date('2026-01-15T00:00:00Z'), 30)).toBe('VALID');
    });

    it('supersedes an active document and marks it terminal', () => {
      const doc = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000005',
        organizationId: orgId,
        displayId: 'DOC-00005',
        documentTypeId: '50000000-0000-4000-8000-000000000001',
        subjectType: 'VEHICLE',
        vehicleId,
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      doc.supersede({
        newDocumentId: '60000000-0000-4000-8000-000000000006',
        supersededBy: userId,
      });
      expect(doc.status).toBe('SUPERSEDED');
      expect(doc.evaluateCurrentState()).toBe('SUPERSEDED');

      expect(() =>
        doc.revoke({ reason: 'test', revokedBy: userId, expectedVersion: 2 }),
      ).toThrowError(/ACTIVE/i);
    });

    it('revokes an active document with mandatory reason', () => {
      const doc = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000007',
        organizationId: orgId,
        displayId: 'DOC-00007',
        documentTypeId: '50000000-0000-4000-8000-000000000001',
        subjectType: 'VEHICLE',
        vehicleId,
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      doc.revoke({ reason: 'Insurance lapsed by provider', revokedBy: userId, expectedVersion: 1 });
      expect(doc.status).toBe('REVOKED');
      expect(doc.revocationReason).toBe('Insurance lapsed by provider');
      expect(doc.evaluateCurrentState()).toBe('REVOKED');
    });
  });

  describe('evaluateSubjectCompliance', () => {
    const typeReg = ComplianceDocumentType.create({
      id: '50000000-0000-4000-8000-000000000010',
      organizationId: orgId,
      code: 'REGISTRATION',
      name: 'Registration',
      subjectType: 'VEHICLE',
      required: true,
      blocksOperation: true,
      requiresExpiry: true,
      warningDaysBeforeExpiry: 30,
      createdBy: userId,
    });

    const typeIns = ComplianceDocumentType.create({
      id: '50000000-0000-4000-8000-000000000020',
      organizationId: orgId,
      code: 'INSURANCE',
      name: 'Insurance',
      subjectType: 'VEHICLE',
      required: true,
      blocksOperation: true,
      requiresExpiry: true,
      warningDaysBeforeExpiry: 30,
      createdBy: userId,
    });

    const typeOptional = ComplianceDocumentType.create({
      id: '50000000-0000-4000-8000-000000000030',
      organizationId: orgId,
      code: 'PARKING_PASS',
      name: 'Parking Pass',
      subjectType: 'VEHICLE',
      required: false,
      blocksOperation: false,
      createdBy: userId,
    });

    const refDate = new Date('2026-06-01T00:00:00Z');

    it('evaluates NON_COMPLIANT and operationallyBlocked when required blocking documents are missing', () => {
      const evalResult = evaluateSubjectCompliance({
        subjectType: 'VEHICLE',
        subjectId: vehicleId,
        documentTypes: [typeReg, typeIns, typeOptional],
        activeDocuments: [],
        referenceDate: refDate,
      });

      expect(evalResult.overallState).toBe('NON_COMPLIANT');
      expect(evalResult.operationallyBlocked).toBe(true);
      expect(evalResult.blockingReasons.length).toBe(2);
      expect(
        evalResult.requirements.find((r) => r.documentTypeCode === 'REGISTRATION')?.derivedState,
      ).toBe('MISSING');
      expect(
        evalResult.requirements.find((r) => r.documentTypeCode === 'PARKING_PASS')?.derivedState,
      ).toBe('MISSING');
      expect(
        evalResult.requirements.find((r) => r.documentTypeCode === 'PARKING_PASS')?.isBlocking,
      ).toBe(false);
    });

    it('evaluates COMPLIANT and unblocked when all required documents are valid', () => {
      const docReg = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000010',
        organizationId: orgId,
        displayId: 'DOC-REG',
        documentTypeId: typeReg.id,
        subjectType: 'VEHICLE',
        vehicleId,
        issuedOn: new Date('2026-01-01T00:00:00Z'),
        expiresOn: new Date('2026-12-31T00:00:00Z'),
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      const docIns = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000020',
        organizationId: orgId,
        displayId: 'DOC-INS',
        documentTypeId: typeIns.id,
        subjectType: 'VEHICLE',
        vehicleId,
        issuedOn: new Date('2026-01-01T00:00:00Z'),
        expiresOn: new Date('2026-12-31T00:00:00Z'),
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      const evalResult = evaluateSubjectCompliance({
        subjectType: 'VEHICLE',
        subjectId: vehicleId,
        documentTypes: [typeReg, typeIns, typeOptional],
        activeDocuments: [docReg, docIns],
        referenceDate: refDate,
      });

      expect(evalResult.overallState).toBe('COMPLIANT');
      expect(evalResult.operationallyBlocked).toBe(false);
      expect(evalResult.blockingReasons.length).toBe(0);
    });

    it('evaluates WARNING without operational blocking when a document is EXPIRING_SOON', () => {
      const docReg = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000010',
        organizationId: orgId,
        displayId: 'DOC-REG',
        documentTypeId: typeReg.id,
        subjectType: 'VEHICLE',
        vehicleId,
        issuedOn: new Date('2026-01-01T00:00:00Z'),
        expiresOn: new Date('2026-06-15T00:00:00Z'), // 14 days away (< 30 warning)
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      const docIns = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000020',
        organizationId: orgId,
        displayId: 'DOC-INS',
        documentTypeId: typeIns.id,
        subjectType: 'VEHICLE',
        vehicleId,
        issuedOn: new Date('2026-01-01T00:00:00Z'),
        expiresOn: new Date('2026-12-31T00:00:00Z'),
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      const evalResult = evaluateSubjectCompliance({
        subjectType: 'VEHICLE',
        subjectId: vehicleId,
        documentTypes: [typeReg, typeIns],
        activeDocuments: [docReg, docIns],
        referenceDate: refDate,
      });

      expect(evalResult.overallState).toBe('WARNING');
      expect(evalResult.operationallyBlocked).toBe(false); // EXPIRING_SOON does NOT block!
      const req = evalResult.requirements.find((r) => r.documentTypeCode === 'REGISTRATION');
      expect(req?.derivedState).toBe('EXPIRING_SOON');
      expect(req?.reasonCode).toBe('DOCUMENT_EXPIRING_SOON');
    });

    it('evaluates NON_COMPLIANT and operationally blocked when a document is EXPIRED', () => {
      const docRegExpired = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000010',
        organizationId: orgId,
        displayId: 'DOC-REG',
        documentTypeId: typeReg.id,
        subjectType: 'VEHICLE',
        vehicleId,
        issuedOn: new Date('2025-01-01T00:00:00Z'),
        expiresOn: new Date('2026-05-31T00:00:00Z'), // Expired yesterday relative to refDate
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      const docIns = ComplianceDocument.create({
        id: '60000000-0000-4000-8000-000000000020',
        organizationId: orgId,
        displayId: 'DOC-INS',
        documentTypeId: typeIns.id,
        subjectType: 'VEHICLE',
        vehicleId,
        issuedOn: new Date('2026-01-01T00:00:00Z'),
        expiresOn: new Date('2026-12-31T00:00:00Z'),
        objectKey: 'key',
        originalFileName: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        createdBy: userId,
      });

      const evalResult = evaluateSubjectCompliance({
        subjectType: 'VEHICLE',
        subjectId: vehicleId,
        documentTypes: [typeReg, typeIns],
        activeDocuments: [docRegExpired, docIns],
        referenceDate: refDate,
      });

      expect(evalResult.overallState).toBe('NON_COMPLIANT');
      expect(evalResult.operationallyBlocked).toBe(true);
      const req = evalResult.requirements.find((r) => r.documentTypeCode === 'REGISTRATION');
      expect(req?.derivedState).toBe('EXPIRED');
      expect(req?.reasonCode).toBe('REQUIRED_DOCUMENT_EXPIRED');
      expect(evalResult.blockingReasons[0]).toContain('has expired');
    });
  });
});
