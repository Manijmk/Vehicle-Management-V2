export type MaintenanceVendorStatus = 'ACTIVE' | 'INACTIVE';

export interface MaintenanceVendor {
  readonly id: string;
  readonly organizationId: string;
  readonly displayId: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly status: MaintenanceVendorStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly updatedAt: Date;
  readonly updatedBy: string;
}
