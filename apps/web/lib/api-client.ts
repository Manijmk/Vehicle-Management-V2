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

export type TripStatus = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ABORTED';

export interface TripRecord {
  id: string;
  organizationId: string;
  displayId: string;
  assignmentId: string;
  vehicleId: string;
  driverId: string;
  status: TripStatus;
  origin: string;
  destination: string;
  purpose: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  startOdometerKm: number | null;
  endOdometerKm: number | null;
  distanceKm: number | null;
  cancelReason: string | null;
  abortReason: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  vehicle?: {
    id: string;
    displayId: string;
    registration: string;
    model: string;
    odometerKm: number;
  };
  driver?: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignment?: {
    id: string;
    status: string;
  };
}

export interface TripStatusHistoryEntry {
  id: string;
  organizationId: string;
  tripId: string;
  fromStatus: TripStatus | null;
  toStatus: TripStatus;
  reason: string | null;
  changedBy: string;
  createdAt: string;
}

export interface TripListResponse {
  items: TripRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateTripInput {
  assignmentId: string;
  origin: string;
  destination: string;
  purpose?: string | undefined;
  plannedStartAt?: string | undefined;
  plannedEndAt?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateTripInput {
  version: number;
  origin?: string | undefined;
  destination?: string | undefined;
  purpose?: string | undefined;
  plannedStartAt?: string | undefined;
  plannedEndAt?: string | undefined;
  notes?: string | undefined;
}

export interface MarkTripReadyInput {
  version: number;
}

export interface StartTripInput {
  version: number;
  startOdometerKm: number;
}

export interface CompleteTripInput {
  version: number;
  endOdometerKm: number;
  notes?: string | undefined;
}

export interface CancelTripInput {
  version: number;
  cancelReason?: string | undefined;
}

export interface AbortTripInput {
  version: number;
  endOdometerKm: number;
  abortReason: string;
}

export const tripApi = {
  fetchTrips(params?: {
    status?: TripStatus;
    vehicleId?: string;
    driverId?: string;
    assignmentId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<TripListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.vehicleId) searchParams.set('vehicleId', params.vehicleId);
    if (params?.driverId) searchParams.set('driverId', params.driverId);
    if (params?.assignmentId) searchParams.set('assignmentId', params.assignmentId);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return requestApi<TripListResponse>(`/trips${qs ? `?${qs}` : ''}`);
  },

  fetchTrip(tripId: string): Promise<TripRecord> {
    return requestApi<TripRecord>(`/trips/${tripId}`);
  },

  createTrip(input: CreateTripInput): Promise<TripRecord> {
    return requestApi<TripRecord>('/trips', {
      method: 'POST',
      body: input,
    });
  },

  updateTrip(tripId: string, input: UpdateTripInput): Promise<TripRecord> {
    return requestApi<TripRecord>(`/trips/${tripId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  markTripReady(tripId: string, input: MarkTripReadyInput): Promise<TripRecord> {
    return requestApi<TripRecord>(`/trips/${tripId}/ready`, {
      method: 'POST',
      body: input,
    });
  },

  startTrip(tripId: string, input: StartTripInput): Promise<TripRecord> {
    return requestApi<TripRecord>(`/trips/${tripId}/start`, {
      method: 'POST',
      body: input,
    });
  },

  completeTrip(tripId: string, input: CompleteTripInput): Promise<TripRecord> {
    return requestApi<TripRecord>(`/trips/${tripId}/complete`, {
      method: 'POST',
      body: input,
    });
  },

  cancelTrip(tripId: string, input: CancelTripInput): Promise<TripRecord> {
    return requestApi<TripRecord>(`/trips/${tripId}/cancel`, {
      method: 'POST',
      body: input,
    });
  },

  abortTrip(tripId: string, input: AbortTripInput): Promise<TripRecord> {
    return requestApi<TripRecord>(`/trips/${tripId}/abort`, {
      method: 'POST',
      body: input,
    });
  },

  fetchTripStatusHistory(tripId: string): Promise<TripStatusHistoryEntry[]> {
    return requestApi<TripStatusHistoryEntry[]>(`/trips/${tripId}/status-history`);
  },

  fetchVehicleCurrentTrip(vehicleId: string): Promise<TripRecord | null> {
    return requestApi<TripRecord | null>(`/vehicles/${vehicleId}/current-trip`);
  },

  fetchVehicleTripHistory(
    vehicleId: string,
    limit?: number,
    offset?: number,
  ): Promise<TripListResponse> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.set('limit', String(limit));
    if (offset !== undefined) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    return requestApi<TripListResponse>(`/vehicles/${vehicleId}/trips${qs ? `?${qs}` : ''}`);
  },

  fetchDriverCurrentTrip(driverId: string): Promise<TripRecord | null> {
    return requestApi<TripRecord | null>(`/drivers/${driverId}/current-trip`);
  },

  fetchDriverTripHistory(
    driverId: string,
    limit?: number,
    offset?: number,
  ): Promise<TripListResponse> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.set('limit', String(limit));
    if (offset !== undefined) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    return requestApi<TripListResponse>(`/drivers/${driverId}/trips${qs ? `?${qs}` : ''}`);
  },

  fetchAssignmentTripHistory(
    assignmentId: string,
    limit?: number,
    offset?: number,
  ): Promise<TripListResponse> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.set('limit', String(limit));
    if (offset !== undefined) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    return requestApi<TripListResponse>(`/assignments/${assignmentId}/trips${qs ? `?${qs}` : ''}`);
  },
};

// -------------------------------------------------------------
// Milestone 6: Inspection API
// -------------------------------------------------------------
export const inspectionApi = {
  fetchInspectionTemplates(
    type?: InspectionType,
    status?: InspectionTemplateStatus,
    limit?: number,
    offset?: number,
  ): Promise<InspectionTemplateListResponse> {
    const searchParams = new URLSearchParams();
    if (type) searchParams.set('type', type);
    if (status) searchParams.set('status', status);
    if (limit !== undefined) searchParams.set('limit', String(limit));
    if (offset !== undefined) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    return requestApi<InspectionTemplateListResponse>(`/inspection-templates${qs ? `?${qs}` : ''}`);
  },

  fetchInspectionTemplate(templateId: string): Promise<InspectionTemplateRecord> {
    return requestApi<InspectionTemplateRecord>(`/inspection-templates/${templateId}`);
  },

  createInspectionTemplate(
    input: CreateInspectionTemplateInput,
  ): Promise<InspectionTemplateRecord> {
    return requestApi<InspectionTemplateRecord>('/inspection-templates', {
      method: 'POST',
      body: input,
    });
  },

  updateInspectionTemplate(
    templateId: string,
    input: UpdateInspectionTemplateInput,
  ): Promise<InspectionTemplateRecord> {
    return requestApi<InspectionTemplateRecord>(`/inspection-templates/${templateId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  activateInspectionTemplate(
    templateId: string,
    version: number,
  ): Promise<InspectionTemplateRecord> {
    return requestApi<InspectionTemplateRecord>(`/inspection-templates/${templateId}/activate`, {
      method: 'POST',
      body: { version },
    });
  },

  archiveInspectionTemplate(
    templateId: string,
    version: number,
  ): Promise<InspectionTemplateRecord> {
    return requestApi<InspectionTemplateRecord>(`/inspection-templates/${templateId}/archive`, {
      method: 'POST',
      body: { version },
    });
  },

  // -------------------------------------------------------------
  // Milestone 6: Inspections
  // -------------------------------------------------------------
  fetchInspections(filters?: {
    type?: InspectionType | undefined;
    status?: InspectionStatus | undefined;
    result?: InspectionResult | undefined;
    vehicleId?: string | undefined;
    tripId?: string | undefined;
    driverId?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<InspectionListResponse> {
    const searchParams = new URLSearchParams();
    if (filters?.type) searchParams.set('type', filters.type);
    if (filters?.status) searchParams.set('status', filters.status);
    if (filters?.result) searchParams.set('result', filters.result);
    if (filters?.vehicleId) searchParams.set('vehicleId', filters.vehicleId);
    if (filters?.tripId) searchParams.set('tripId', filters.tripId);
    if (filters?.driverId) searchParams.set('driverId', filters.driverId);
    if (filters?.limit !== undefined) searchParams.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) searchParams.set('offset', String(filters.offset));
    const qs = searchParams.toString();
    return requestApi<InspectionListResponse>(`/inspections${qs ? `?${qs}` : ''}`);
  },

  fetchInspection(inspectionId: string): Promise<InspectionRecord> {
    return requestApi<InspectionRecord>(`/inspections/${inspectionId}`);
  },

  createInspection(input: CreateInspectionInput): Promise<InspectionRecord> {
    return requestApi<InspectionRecord>('/inspections', {
      method: 'POST',
      body: input,
    });
  },

  startInspection(inspectionId: string, version: number): Promise<InspectionRecord> {
    return requestApi<InspectionRecord>(`/inspections/${inspectionId}/start`, {
      method: 'POST',
      body: { version },
    });
  },

  saveInspectionResponses(
    inspectionId: string,
    input: SaveInspectionResponsesInput,
  ): Promise<InspectionRecord> {
    return requestApi<InspectionRecord>(`/inspections/${inspectionId}/responses`, {
      method: 'PUT',
      body: input,
    });
  },

  completeInspection(inspectionId: string, version: number): Promise<InspectionRecord> {
    return requestApi<InspectionRecord>(`/inspections/${inspectionId}/complete`, {
      method: 'POST',
      body: { version },
    });
  },

  cancelInspection(inspectionId: string, input: CancelInspectionInput): Promise<InspectionRecord> {
    return requestApi<InspectionRecord>(`/inspections/${inspectionId}/cancel`, {
      method: 'POST',
      body: input,
    });
  },

  fetchVehicleInspections(
    vehicleId: string,
    limit?: number,
    offset?: number,
  ): Promise<InspectionListResponse> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.set('limit', String(limit));
    if (offset !== undefined) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    return requestApi<InspectionListResponse>(
      `/vehicles/${vehicleId}/inspections${qs ? `?${qs}` : ''}`,
    );
  },

  fetchTripInspections(
    tripId: string,
    limit?: number,
    offset?: number,
  ): Promise<InspectionListResponse> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.set('limit', String(limit));
    if (offset !== undefined) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    return requestApi<InspectionListResponse>(`/trips/${tripId}/inspections${qs ? `?${qs}` : ''}`);
  },

  fetchDriverInspections(
    driverId: string,
    limit?: number,
    offset?: number,
  ): Promise<InspectionListResponse> {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) searchParams.set('limit', String(limit));
    if (offset !== undefined) searchParams.set('offset', String(offset));
    const qs = searchParams.toString();
    return requestApi<InspectionListResponse>(
      `/drivers/${driverId}/inspections${qs ? `?${qs}` : ''}`,
    );
  },
};

export const api = inspectionApi;

// =================================================================
// Milestone 6: Inspection Type Definitions
// =================================================================

export type InspectionType = 'PRE_TRIP' | 'POST_TRIP' | 'PERIODIC' | 'SAFETY' | 'CUSTOM';
export type InspectionTemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type InspectionItemSeverity = 'NORMAL' | 'CRITICAL';
export type InspectionStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type InspectionResult = 'PASS' | 'FAIL';
export type InspectionResponseResult = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export interface InspectionTemplateItemRecord {
  id: string;
  templateId: string;
  organizationId: string;
  category: string;
  prompt: string;
  description?: string | null;
  required: boolean;
  severity: InspectionItemSeverity;
  sortOrder: number;
}

export interface InspectionTemplateRecord {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  type: InspectionType;
  status: InspectionTemplateStatus;
  version: number;
  items?: InspectionTemplateItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface InspectionTemplateListResponse {
  items: InspectionTemplateRecord[];
  total: number;
}

export interface CreateInspectionTemplateInput {
  name: string;
  description?: string | undefined;
  type: InspectionType;
  items: Array<{
    category: string;
    prompt: string;
    description?: string | undefined;
    required?: boolean | undefined;
    severity?: InspectionItemSeverity | undefined;
    sortOrder?: number | undefined;
  }>;
}

export interface UpdateInspectionTemplateInput {
  version: number;
  name?: string | undefined;
  description?: string | undefined;
  items?: Array<{
    category: string;
    prompt: string;
    description?: string | undefined;
    required?: boolean | undefined;
    severity?: InspectionItemSeverity | undefined;
    sortOrder?: number | undefined;
  }>;
}

export interface InspectionResponseDetail {
  id: string;
  templateItemId: string;
  category: string;
  prompt: string;
  description?: string | null;
  required: boolean;
  severity: InspectionItemSeverity;
  sortOrder: number;
  response: InspectionResponseResult;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionRecord {
  id: string;
  organizationId: string;
  displayId: string;
  templateId: string;
  template: {
    id: string;
    name: string;
    type: InspectionType;
    version: number;
  };
  type: InspectionType;
  vehicleId: string;
  vehicle: {
    id: string;
    displayId: string;
    registration: string;
    model: string;
    type: string;
    odometerKm: number;
    status: string;
  };
  driverId?: string | null;
  driver?: {
    id: string;
    displayId: string;
    firstName: string;
    lastName: string;
    status: string;
  } | null;
  assignmentId?: string | null;
  tripId?: string | null;
  trip?: {
    id: string;
    displayId: string;
    status: string;
    origin: string;
    destination: string;
  } | null;
  status: InspectionStatus;
  result?: InspectionResult | null;
  hasCriticalFailure: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  performedBy?: string | null;
  notes?: string | null;
  version: number;
  responses?: InspectionResponseDetail[];
  createdAt: string;
  updatedAt: string;
}

export interface InspectionListResponse {
  items: InspectionRecord[];
  total: number;
}

export interface CreateInspectionInput {
  templateId: string;
  type: InspectionType;
  vehicleId: string;
  tripId?: string | undefined;
  notes?: string | undefined;
}

export interface SaveInspectionResponsesInput {
  version: number;
  responses: Array<{
    templateItemId: string;
    response: InspectionResponseResult;
    comment?: string | undefined;
  }>;
}

export interface CancelInspectionInput {
  version: number;
  cancelReason: string;
}
