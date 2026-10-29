export type VehicleStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type VehicleType = 'CAR' | 'VAN' | 'TRUCK' | 'BUS' | 'MOTORCYCLE' | 'OTHER';
export type FuelType = 'PETROL' | 'DIESEL' | 'HYBRID' | 'ELECTRIC' | 'GAS' | 'OTHER';

export interface VehicleRecord {
  id: string;
  organizationId: string;
  displayId: string;
  registration: string;
  vin: string;
  type: VehicleType;
  fuelType: FuelType;
  model: string;
  year: number;
  odometerKm: number;
  status: VehicleStatus;
  notes?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleStatusHistoryEntry {
  id: string;
  organizationId: string;
  vehicleId: string;
  previousStatus: VehicleStatus | null;
  newStatus: VehicleStatus;
  reason: string;
  changedBy: string;
  createdAt: string;
}

export interface CurrentUserResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    status: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  membership: {
    id: string;
    status: string;
    version: number;
  };
  roles: string[];
  permissions: string[];
}

export interface CreateVehicleInput {
  displayId: string;
  registration: string;
  vin: string;
  type: VehicleType;
  fuelType: FuelType;
  model: string;
  year: number;
  odometerKm: number;
  notes?: string | undefined;
}

export interface UpdateVehicleInput {
  displayId?: string | undefined;
  registration?: string | undefined;
  type?: VehicleType | undefined;
  fuelType?: FuelType | undefined;
  model?: string | undefined;
  year?: number | undefined;
  odometerKm?: number | undefined;
  notes?: string | undefined;
  version: number;
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const DEFAULT_DEV_ORG_ID = '10000000-0000-4000-8000-000000000001';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export function getStoredAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('vms_auth_token') ?? '';
}

export function setStoredAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('vms_auth_token', token);
  }
}

export function getStoredOrganizationId(): string {
  if (typeof window === 'undefined') return DEFAULT_DEV_ORG_ID;
  return window.localStorage.getItem('vms_org_id') ?? DEFAULT_DEV_ORG_ID;
}

export function setStoredOrganizationId(orgId: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('vms_org_id', orgId);
  }
}

async function requestApi<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    organizationId?: string;
  } = {},
): Promise<T> {
  const token = options.token ?? getStoredAuthToken();
  const organizationId = options.organizationId ?? getStoredOrganizationId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (organizationId) {
    headers['x-organization-id'] = organizationId;
  }

  const url = `${API_BASE_URL}${path}`;
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, init);

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorData = data as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    const code = errorData?.error?.code ?? `HTTP_${response.status}`;
    const message = errorData?.error?.message ?? response.statusText ?? 'Request failed';
    throw new ApiClientError(response.status, code, message, errorData?.error?.details);
  }

  return data as T;
}

export const vehicleApi = {
  fetchCurrentUser(): Promise<CurrentUserResponse> {
    return requestApi<CurrentUserResponse>('/me');
  },

  fetchVehicles(): Promise<VehicleRecord[]> {
    return requestApi<VehicleRecord[]>('/vehicles');
  },

  fetchVehicle(vehicleId: string): Promise<VehicleRecord> {
    return requestApi<VehicleRecord>(`/vehicles/${vehicleId}`);
  },

  createVehicle(input: CreateVehicleInput): Promise<VehicleRecord> {
    return requestApi<VehicleRecord>('/vehicles', {
      method: 'POST',
      body: input,
    });
  },

  updateVehicle(vehicleId: string, input: UpdateVehicleInput): Promise<VehicleRecord> {
    return requestApi<VehicleRecord>(`/vehicles/${vehicleId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  activateVehicle(vehicleId: string, version?: number): Promise<void> {
    return requestApi<void>(`/vehicles/${vehicleId}/activate`, {
      method: 'POST',
      body: version !== undefined ? { version } : {},
    });
  },

  retireVehicle(vehicleId: string, reason: string, version: number): Promise<void> {
    return requestApi<void>(`/vehicles/${vehicleId}/retire`, {
      method: 'POST',
      body: { reason, version },
    });
  },

  fetchStatusHistory(vehicleId: string): Promise<VehicleStatusHistoryEntry[]> {
    return requestApi<VehicleStatusHistoryEntry[]>(`/vehicles/${vehicleId}/status-history`);
  },
};

export type DriverStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export interface DriverLicenseRecord {
  id: string;
  driverId: string;
  organizationId: string;
  licenseNumber: string;
  issuingCountry: string;
  issuingRegion?: string | null;
  licenseClasses: string[];
  issueDate: string;
  expiryDate: string;
  notes?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  isValid?: boolean;
}

export interface DriverRecord {
  id: string;
  organizationId: string;
  displayId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  employeeNumber?: string | null;
  status: DriverStatus;
  notes?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  licenses?: DriverLicenseRecord[];
  eligible?: boolean;
  eligibilityReasons?: string[];
}

export interface DriverStatusHistoryEntry {
  id: string;
  organizationId: string;
  driverId: string;
  fromStatus: DriverStatus | null;
  toStatus: DriverStatus;
  reason: string;
  changedBy: string;
  createdAt: string;
}

export interface CreateDriverInput {
  displayId?: string | undefined;
  firstName: string;
  lastName: string;
  email?: string | undefined;
  phone?: string | undefined;
  employeeNumber?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateDriverInput {
  displayId?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  employeeNumber?: string | null | undefined;
  notes?: string | null | undefined;
  version: number;
}

export interface AddLicenseInput {
  licenseNumber: string;
  issuingCountry: string;
  issuingRegion?: string | undefined;
  licenseClasses: string[];
  issueDate: string;
  expiryDate: string;
  notes?: string | undefined;
}

export interface UpdateLicenseInput {
  licenseNumber?: string;
  issuingCountry?: string;
  issuingRegion?: string | null;
  licenseClasses?: string[];
  issueDate?: string;
  expiryDate?: string;
  notes?: string | null;
  version: number;
}

export interface DriverListResponse {
  items: DriverRecord[];
  total: number;
  page: number;
  limit: number;
}

export const driverApi = {
  fetchDrivers(params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<DriverListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return requestApi<DriverListResponse>(`/drivers${qs ? `?${qs}` : ''}`);
  },

  fetchDriver(driverId: string): Promise<DriverRecord> {
    return requestApi<DriverRecord>(`/drivers/${driverId}`);
  },

  createDriver(input: CreateDriverInput): Promise<DriverRecord> {
    return requestApi<DriverRecord>('/drivers', {
      method: 'POST',
      body: input,
    });
  },

  updateDriver(driverId: string, input: UpdateDriverInput): Promise<DriverRecord> {
    return requestApi<DriverRecord>(`/drivers/${driverId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  activateDriver(driverId: string, version?: number): Promise<void> {
    return requestApi<void>(`/drivers/${driverId}/activate`, {
      method: 'POST',
      body: version !== undefined ? { version } : {},
    });
  },

  suspendDriver(driverId: string, reason: string, version: number): Promise<void> {
    return requestApi<void>(`/drivers/${driverId}/suspend`, {
      method: 'POST',
      body: { reason, version },
    });
  },

  deactivateDriver(driverId: string, reason: string, version: number): Promise<void> {
    return requestApi<void>(`/drivers/${driverId}/deactivate`, {
      method: 'POST',
      body: { reason, version },
    });
  },

  fetchStatusHistory(driverId: string): Promise<DriverStatusHistoryEntry[]> {
    return requestApi<DriverStatusHistoryEntry[]>(`/drivers/${driverId}/status-history`);
  },

  fetchLicenses(driverId: string): Promise<DriverLicenseRecord[]> {
    return requestApi<DriverLicenseRecord[]>(`/drivers/${driverId}/licenses`);
  },

  addLicense(driverId: string, input: AddLicenseInput): Promise<DriverLicenseRecord> {
    return requestApi<DriverLicenseRecord>(`/drivers/${driverId}/licenses`, {
      method: 'POST',
      body: input,
    });
  },

  updateLicense(
    driverId: string,
    licenseId: string,
    input: UpdateLicenseInput,
  ): Promise<DriverLicenseRecord> {
    return requestApi<DriverLicenseRecord>(`/drivers/${driverId}/licenses/${licenseId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  removeLicense(driverId: string, licenseId: string): Promise<void> {
    return requestApi<void>(`/drivers/${driverId}/licenses/${licenseId}`, {
      method: 'DELETE',
    });
  },
};

export type AssignmentStatus = 'ACTIVE' | 'ENDED';

export interface VehicleDriverAssignmentRecord {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string;
  status: AssignmentStatus;
  startedAt: string;
  endedAt?: string | null;
  endReason?: string | null;
  notes?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  vehicle?: {
    id: string;
    displayId: string;
    registration: string;
    vin: string;
    status: string;
  };
  driver?: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
    status: string;
    eligible?: boolean;
    isOperationallyEligible?: boolean;
  };
}

export interface CreateAssignmentInput {
  vehicleId: string;
  driverId: string;
  startedAt?: string;
  notes?: string;
}

export interface EndAssignmentInput {
  version: number;
  reason?: string;
  endReason?: string;
  endedAt?: string;
}

export interface AssignmentListResponse {
  items: VehicleDriverAssignmentRecord[];
  total: number;
  limit: number;
  offset: number;
}

export const assignmentApi = {
  fetchAssignments(params?: {
    status?: AssignmentStatus;
    vehicleId?: string;
    driverId?: string;
    limit?: number;
    offset?: number;
  }): Promise<AssignmentListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.vehicleId) searchParams.set('vehicleId', params.vehicleId);
    if (params?.driverId) searchParams.set('driverId', params.driverId);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return requestApi<AssignmentListResponse>(`/assignments${qs ? `?${qs}` : ''}`);
  },

  fetchAssignment(assignmentId: string): Promise<VehicleDriverAssignmentRecord> {
    return requestApi<VehicleDriverAssignmentRecord>(`/assignments/${assignmentId}`);
  },

  createAssignment(input: CreateAssignmentInput): Promise<VehicleDriverAssignmentRecord> {
    return requestApi<VehicleDriverAssignmentRecord>('/assignments', {
      method: 'POST',
      body: input,
    });
  },

  endAssignment(
    assignmentId: string,
    input: EndAssignmentInput,
  ): Promise<VehicleDriverAssignmentRecord> {
    return requestApi<VehicleDriverAssignmentRecord>(`/assignments/${assignmentId}/end`, {
      method: 'POST',
      body: input,
    });
  },

  fetchVehicleCurrentAssignment(vehicleId: string): Promise<VehicleDriverAssignmentRecord | null> {
    return requestApi<VehicleDriverAssignmentRecord | null>(
      `/vehicles/${vehicleId}/current-assignment`,
    );
  },

  fetchCurrentAssignmentForVehicle(
    vehicleId: string,
  ): Promise<VehicleDriverAssignmentRecord | null> {
    return requestApi<VehicleDriverAssignmentRecord | null>(
      `/vehicles/${vehicleId}/current-assignment`,
    );
  },

  fetchVehicleAssignmentHistory(vehicleId: string): Promise<VehicleDriverAssignmentRecord[]> {
    return requestApi<VehicleDriverAssignmentRecord[]>(`/vehicles/${vehicleId}/assignments`);
  },

  fetchDriverCurrentAssignment(driverId: string): Promise<VehicleDriverAssignmentRecord | null> {
    return requestApi<VehicleDriverAssignmentRecord | null>(
      `/drivers/${driverId}/current-assignment`,
    );
  },

  fetchCurrentAssignmentForDriver(driverId: string): Promise<VehicleDriverAssignmentRecord | null> {
    return requestApi<VehicleDriverAssignmentRecord | null>(
      `/drivers/${driverId}/current-assignment`,
    );
  },

  fetchDriverAssignmentHistory(driverId: string): Promise<VehicleDriverAssignmentRecord[]> {
    return requestApi<VehicleDriverAssignmentRecord[]>(`/drivers/${driverId}/assignments`);
  },
};
