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

  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

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
    init.body = options.body instanceof FormData ? options.body : JSON.stringify(options.body);
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

// =================================================================
// Milestone 7: Maintenance Types & Client
// =================================================================

export type MaintenanceRequestStatus = 'OPEN' | 'CONVERTED' | 'CANCELLED';
export type MaintenancePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type MaintenanceRequestSource = 'MANUAL' | 'INSPECTION' | 'PREVENTIVE';
export type MaintenancePlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ScheduleDueState = 'UPCOMING' | 'DUE' | 'OVERDUE';
export type MaintenanceVendorStatus = 'ACTIVE' | 'INACTIVE';
export type MaintenanceWorkOrderStatus =
  'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type WorkOrderTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export interface MaintenanceVendorRecord {
  id: string;
  organizationId: string;
  displayId: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status: MaintenanceVendorStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceVendorListResponse {
  items: MaintenanceVendorRecord[];
  total: number;
}

export interface MaintenanceRequestRecord {
  id: string;
  organizationId: string;
  displayId: string;
  vehicleId: string;
  vehicleDisplayId?: string | null;
  vehicleRegistration?: string | null;
  vehicleModel?: string | null;
  sourceType: MaintenanceRequestSource;
  sourceInspectionId?: string | null;
  sourceInspectionDisplayId?: string | null;
  convertedWorkOrderId?: string | null;
  convertedWorkOrderDisplayId?: string | null;
  title: string;
  description?: string | null;
  priority: MaintenancePriority;
  blocksOperation: boolean;
  status: MaintenanceRequestStatus;
  cancelReason?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceRequestListResponse {
  items: MaintenanceRequestRecord[];
  total: number;
}

export interface MaintenancePlanRecord {
  id: string;
  organizationId: string;
  displayId: string;
  name: string;
  description?: string | null;
  intervalDays?: number | null;
  intervalOdometerKm?: number | null;
  defaultPriority: MaintenancePriority;
  blocksOperationWhenDue: boolean;
  status: MaintenancePlanStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenancePlanListResponse {
  items: MaintenancePlanRecord[];
  total: number;
}

export interface VehicleMaintenanceScheduleRecord {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleDisplayId?: string | null;
  vehicleRegistration?: string | null;
  maintenancePlanId: string;
  planName?: string | null;
  planIntervalDays?: number | null;
  planIntervalOdometerKm?: number | null;
  lastCompletedAt?: string | null;
  lastCompletedOdometerKm?: number | null;
  nextDueAt?: string | null;
  nextDueOdometerKm?: number | null;
  dueState: ScheduleDueState;
  activeWorkOrderId?: string | null;
  activeWorkOrderDisplayId?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceScheduleListResponse {
  items: VehicleMaintenanceScheduleRecord[];
  total: number;
}

export interface MaintenanceWorkOrderTaskRecord {
  id: string;
  workOrderId: string;
  description: string;
  status: WorkOrderTaskStatus;
  sortOrder: number;
  notes?: string | null;
  completedAt?: string | null;
}

export interface MaintenanceWorkOrderPartRecord {
  id: string;
  workOrderId: string;
  description: string;
  partNumber?: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface MaintenanceWorkOrderLaborRecord {
  id: string;
  workOrderId: string;
  description: string;
  technicianName?: string | null;
  hours: number;
  hourlyRate: number;
  totalCost: number;
}

export interface MaintenanceWorkOrderRecord {
  id: string;
  organizationId: string;
  displayId: string;
  vehicleId: string;
  vehicleDisplayId?: string | null;
  vehicleRegistration?: string | null;
  maintenanceRequestId?: string | null;
  maintenanceRequestDisplayId?: string | null;
  maintenanceScheduleId?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  title: string;
  description?: string | null;
  priority: MaintenancePriority;
  blocksOperation: boolean;
  status: MaintenanceWorkOrderStatus;
  openedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  completionNotes?: string | null;
  odometerAtOpen?: number | null;
  odometerAtCompletion?: number | null;
  partsTotal: number;
  laborTotal: number;
  totalCost: number;
  version: number;
  tasks: MaintenanceWorkOrderTaskRecord[];
  parts: MaintenanceWorkOrderPartRecord[];
  labor: MaintenanceWorkOrderLaborRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceWorkOrderListResponse {
  items: MaintenanceWorkOrderRecord[];
  total: number;
}

export interface VehicleMaintenanceSummary {
  vehicleId: string;
  isOperationallyBlocked: boolean;
  openRequests: MaintenanceRequestRecord[];
  activeWorkOrders: MaintenanceWorkOrderRecord[];
  schedules: VehicleMaintenanceScheduleRecord[];
  recentHistory: MaintenanceWorkOrderRecord[];
}

export interface MaintenanceDashboardSummary {
  openRequestsCount: number;
  criticalRequestsCount: number;
  openWorkOrdersCount: number;
  inProgressWorkOrdersCount: number;
  dueSchedulesCount: number;
  overdueSchedulesCount: number;
  blockedVehiclesCount: number;
}

export const maintenanceApi = {
  fetchDashboard(): Promise<MaintenanceDashboardSummary> {
    return requestApi<MaintenanceDashboardSummary>('/maintenance/dashboard');
  },

  // Vendors
  fetchVendors(query?: {
    status?: MaintenanceVendorStatus | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<MaintenanceVendorListResponse> {
    const searchParams = new URLSearchParams();
    if (query?.status) searchParams.set('status', query.status);
    if (query?.search) searchParams.set('search', query.search);
    if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));
    if (query?.offset !== undefined) searchParams.set('offset', String(query.offset));
    const qs = searchParams.toString();
    return requestApi<MaintenanceVendorListResponse>(`/maintenance/vendors${qs ? `?${qs}` : ''}`);
  },

  fetchVendor(vendorId: string): Promise<MaintenanceVendorRecord> {
    return requestApi<MaintenanceVendorRecord>(`/maintenance/vendors/${vendorId}`);
  },

  createVendor(input: {
    name: string;
    contactName?: string | undefined;
    phone?: string | undefined;
    email?: string | undefined;
    notes?: string | undefined;
  }): Promise<MaintenanceVendorRecord> {
    return requestApi<MaintenanceVendorRecord>('/maintenance/vendors', {
      method: 'POST',
      body: input,
    });
  },

  updateVendor(
    vendorId: string,
    input: {
      version: number;
      name?: string | undefined;
      contactName?: string | undefined;
      phone?: string | undefined;
      email?: string | undefined;
      notes?: string | undefined;
      status?: MaintenanceVendorStatus | undefined;
    },
  ): Promise<MaintenanceVendorRecord> {
    return requestApi<MaintenanceVendorRecord>(`/maintenance/vendors/${vendorId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  // Requests
  fetchRequests(query?: {
    status?: MaintenanceRequestStatus | undefined;
    priority?: MaintenancePriority | undefined;
    vehicleId?: string | undefined;
    sourceType?: MaintenanceRequestSource | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<MaintenanceRequestListResponse> {
    const searchParams = new URLSearchParams();
    if (query?.status) searchParams.set('status', query.status);
    if (query?.priority) searchParams.set('priority', query.priority);
    if (query?.vehicleId) searchParams.set('vehicleId', query.vehicleId);
    if (query?.sourceType) searchParams.set('sourceType', query.sourceType);
    if (query?.search) searchParams.set('search', query.search);
    if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));
    if (query?.offset !== undefined) searchParams.set('offset', String(query.offset));
    const qs = searchParams.toString();
    return requestApi<MaintenanceRequestListResponse>(`/maintenance/requests${qs ? `?${qs}` : ''}`);
  },

  fetchRequest(requestId: string): Promise<MaintenanceRequestRecord> {
    return requestApi<MaintenanceRequestRecord>(`/maintenance/requests/${requestId}`);
  },

  createRequest(input: {
    vehicleId: string;
    title: string;
    description?: string | undefined;
    priority?: MaintenancePriority | undefined;
    blocksOperation?: boolean | undefined;
  }): Promise<MaintenanceRequestRecord> {
    return requestApi<MaintenanceRequestRecord>('/maintenance/requests', {
      method: 'POST',
      body: input,
    });
  },

  cancelRequest(
    requestId: string,
    input: { version: number; cancelReason: string },
  ): Promise<MaintenanceRequestRecord> {
    return requestApi<MaintenanceRequestRecord>(`/maintenance/requests/${requestId}/cancel`, {
      method: 'POST',
      body: input,
    });
  },

  convertRequestToWorkOrder(
    requestId: string,
    input: {
      version: number;
      vendorId?: string | undefined;
      title?: string | undefined;
      description?: string | undefined;
      priority?: MaintenancePriority | undefined;
      blocksOperation?: boolean | undefined;
    },
  ): Promise<{ request: MaintenanceRequestRecord; workOrder: MaintenanceWorkOrderRecord }> {
    return requestApi<{ request: MaintenanceRequestRecord; workOrder: MaintenanceWorkOrderRecord }>(
      `/maintenance/requests/${requestId}/convert-to-work-order`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  createRequestFromInspection(
    inspectionId: string,
    input: {
      title?: string | undefined;
      description?: string | undefined;
      priority?: MaintenancePriority | undefined;
    },
  ): Promise<MaintenanceRequestRecord> {
    return requestApi<MaintenanceRequestRecord>(
      `/inspections/${inspectionId}/maintenance-request`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  // Plans
  fetchPlans(query?: {
    status?: MaintenancePlanStatus | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<MaintenancePlanListResponse> {
    const searchParams = new URLSearchParams();
    if (query?.status) searchParams.set('status', query.status);
    if (query?.search) searchParams.set('search', query.search);
    if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));
    if (query?.offset !== undefined) searchParams.set('offset', String(query.offset));
    const qs = searchParams.toString();
    return requestApi<MaintenancePlanListResponse>(`/maintenance/plans${qs ? `?${qs}` : ''}`);
  },

  fetchPlan(planId: string): Promise<MaintenancePlanRecord> {
    return requestApi<MaintenancePlanRecord>(`/maintenance/plans/${planId}`);
  },

  createPlan(input: {
    name: string;
    description?: string | undefined;
    intervalDays?: number | undefined;
    intervalOdometerKm?: number | undefined;
    defaultPriority?: MaintenancePriority | undefined;
    blocksOperationWhenDue?: boolean | undefined;
  }): Promise<MaintenancePlanRecord> {
    return requestApi<MaintenancePlanRecord>('/maintenance/plans', {
      method: 'POST',
      body: input,
    });
  },

  activatePlan(planId: string, version: number): Promise<MaintenancePlanRecord> {
    return requestApi<MaintenancePlanRecord>(`/maintenance/plans/${planId}/activate`, {
      method: 'POST',
      body: { version },
    });
  },

  archivePlan(planId: string, version: number): Promise<MaintenancePlanRecord> {
    return requestApi<MaintenancePlanRecord>(`/maintenance/plans/${planId}/archive`, {
      method: 'POST',
      body: { version },
    });
  },

  // Schedules
  fetchSchedules(query?: {
    vehicleId?: string | undefined;
    maintenancePlanId?: string | undefined;
    dueState?: ScheduleDueState | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<MaintenanceScheduleListResponse> {
    const searchParams = new URLSearchParams();
    if (query?.vehicleId) searchParams.set('vehicleId', query.vehicleId);
    if (query?.maintenancePlanId) searchParams.set('maintenancePlanId', query.maintenancePlanId);
    if (query?.dueState) searchParams.set('dueState', query.dueState);
    if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));
    if (query?.offset !== undefined) searchParams.set('offset', String(query.offset));
    const qs = searchParams.toString();
    return requestApi<MaintenanceScheduleListResponse>(
      `/maintenance/schedules${qs ? `?${qs}` : ''}`,
    );
  },

  createVehicleSchedule(
    vehicleId: string,
    input: { maintenancePlanId: string },
  ): Promise<VehicleMaintenanceScheduleRecord> {
    return requestApi<VehicleMaintenanceScheduleRecord>(
      `/vehicles/${vehicleId}/maintenance-schedules`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  createWorkOrderFromSchedule(
    scheduleId: string,
    version: number,
  ): Promise<MaintenanceWorkOrderRecord> {
    return requestApi<MaintenanceWorkOrderRecord>(
      `/maintenance/schedules/${scheduleId}/work-orders`,
      {
        method: 'POST',
        body: { version },
      },
    );
  },

  // Work Orders
  fetchWorkOrders(query?: {
    status?: MaintenanceWorkOrderStatus | undefined;
    priority?: MaintenancePriority | undefined;
    vehicleId?: string | undefined;
    vendorId?: string | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<MaintenanceWorkOrderListResponse> {
    const searchParams = new URLSearchParams();
    if (query?.status) searchParams.set('status', query.status);
    if (query?.priority) searchParams.set('priority', query.priority);
    if (query?.vehicleId) searchParams.set('vehicleId', query.vehicleId);
    if (query?.vendorId) searchParams.set('vendorId', query.vendorId);
    if (query?.search) searchParams.set('search', query.search);
    if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));
    if (query?.offset !== undefined) searchParams.set('offset', String(query.offset));
    const qs = searchParams.toString();
    return requestApi<MaintenanceWorkOrderListResponse>(
      `/maintenance/work-orders${qs ? `?${qs}` : ''}`,
    );
  },

  fetchWorkOrder(workOrderId: string): Promise<MaintenanceWorkOrderRecord> {
    return requestApi<MaintenanceWorkOrderRecord>(`/maintenance/work-orders/${workOrderId}`);
  },

  createWorkOrder(input: {
    vehicleId: string;
    vendorId?: string | undefined;
    maintenanceRequestId?: string | undefined;
    maintenanceScheduleId?: string | undefined;
    title: string;
    description?: string | undefined;
    priority?: MaintenancePriority | undefined;
    blocksOperation?: boolean | undefined;
  }): Promise<MaintenanceWorkOrderRecord> {
    return requestApi<MaintenanceWorkOrderRecord>('/maintenance/work-orders', {
      method: 'POST',
      body: input,
    });
  },

  openWorkOrder(workOrderId: string, version: number): Promise<MaintenanceWorkOrderRecord> {
    return requestApi<MaintenanceWorkOrderRecord>(`/maintenance/work-orders/${workOrderId}/open`, {
      method: 'POST',
      body: { version },
    });
  },

  startWorkOrder(workOrderId: string, version: number): Promise<MaintenanceWorkOrderRecord> {
    return requestApi<MaintenanceWorkOrderRecord>(`/maintenance/work-orders/${workOrderId}/start`, {
      method: 'POST',
      body: { version },
    });
  },

  completeWorkOrder(
    workOrderId: string,
    input: { version: number; completionNotes: string; odometerAtCompletion?: number | undefined },
  ): Promise<MaintenanceWorkOrderRecord> {
    return requestApi<MaintenanceWorkOrderRecord>(
      `/maintenance/work-orders/${workOrderId}/complete`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  cancelWorkOrder(
    workOrderId: string,
    input: { version: number; cancelReason: string },
  ): Promise<MaintenanceWorkOrderRecord> {
    return requestApi<MaintenanceWorkOrderRecord>(
      `/maintenance/work-orders/${workOrderId}/cancel`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  addTask(
    workOrderId: string,
    input: { description: string; notes?: string | undefined; sortOrder?: number | undefined },
  ): Promise<MaintenanceWorkOrderTaskRecord> {
    return requestApi<MaintenanceWorkOrderTaskRecord>(
      `/maintenance/work-orders/${workOrderId}/tasks`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  updateTask(
    workOrderId: string,
    taskId: string,
    input: {
      description?: string | undefined;
      status?: WorkOrderTaskStatus | undefined;
      notes?: string | undefined;
    },
  ): Promise<MaintenanceWorkOrderTaskRecord> {
    return requestApi<MaintenanceWorkOrderTaskRecord>(
      `/maintenance/work-orders/${workOrderId}/tasks/${taskId}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },

  addPart(
    workOrderId: string,
    input: {
      description: string;
      partNumber?: string | undefined;
      quantity: number;
      unitCost: number;
    },
  ): Promise<MaintenanceWorkOrderPartRecord> {
    return requestApi<MaintenanceWorkOrderPartRecord>(
      `/maintenance/work-orders/${workOrderId}/parts`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  addLabor(
    workOrderId: string,
    input: {
      description: string;
      technicianName?: string | undefined;
      hours: number;
      hourlyRate: number;
    },
  ): Promise<MaintenanceWorkOrderLaborRecord> {
    return requestApi<MaintenanceWorkOrderLaborRecord>(
      `/maintenance/work-orders/${workOrderId}/labor`,
      {
        method: 'POST',
        body: input,
      },
    );
  },

  fetchVehicleMaintenance(vehicleId: string): Promise<VehicleMaintenanceSummary> {
    return requestApi<VehicleMaintenanceSummary>(`/vehicles/${vehicleId}/maintenance`);
  },

  fetchVehicleSchedules(vehicleId: string): Promise<MaintenanceScheduleListResponse> {
    return requestApi<MaintenanceScheduleListResponse>(
      `/vehicles/${vehicleId}/maintenance-schedules`,
    );
  },

  fetchInspectionMaintenanceRequest(
    inspectionId: string,
  ): Promise<MaintenanceRequestRecord | null> {
    return requestApi<MaintenanceRequestRecord | null>(
      `/inspections/${inspectionId}/maintenance-request`,
    );
  },

  createInspectionMaintenanceRequest(
    inspectionId: string,
    input?: {
      title?: string | undefined;
      description?: string | undefined;
      priority?: MaintenancePriority | undefined;
    },
  ): Promise<MaintenanceRequestRecord> {
    return requestApi<MaintenanceRequestRecord>(
      `/inspections/${inspectionId}/maintenance-request`,
      {
        method: 'POST',
        body: input ?? {},
      },
    );
  },
};

// =========================================================================
// Milestone 8: Compliance & Documents Vertical Slice Types & API
// =========================================================================

export type ComplianceSubjectType = 'VEHICLE' | 'DRIVER';
export type ComplianceDocumentTypeStatus = 'ACTIVE' | 'ARCHIVED';
export type ComplianceDocumentStatus = 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';
export type ComplianceRequirementDerivedState = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';
export type OverallComplianceState = 'COMPLIANT' | 'WARNING' | 'NON_COMPLIANT';

export interface ComplianceDocumentTypeRecord {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  subjectType: ComplianceSubjectType;
  required: boolean;
  requiresExpiry: boolean;
  defaultValidityDays: number | null;
  warningDaysBeforeExpiry: number;
  blocksOperation: boolean;
  status: ComplianceDocumentTypeStatus;
  archivedAt: string | null;
  archivedBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceDocumentRecord {
  id: string;
  organizationId: string;
  displayId: string;
  documentTypeId: string;
  subjectType: ComplianceSubjectType;
  vehicleId: string | null;
  driverId: string | null;
  documentNumber: string | null;
  issuerName: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  status: ComplianceDocumentStatus;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
  supersededAt: string | null;
  supersededById: string | null;
  notes: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementEvaluationRecord {
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeName: string;
  subjectType: ComplianceSubjectType;
  required: boolean;
  blocksOperation: boolean;
  warningDaysBeforeExpiry: number;
  activeDocument: {
    id: string;
    displayId: string;
    documentNumber: string | null;
    issuerName: string | null;
    issuedOn: string | null;
    expiresOn: string | null;
    status: string;
    originalFileName: string;
  } | null;
  derivedState: ComplianceRequirementDerivedState;
  isBlocking: boolean;
  reasonCode: string | null;
}

export interface SubjectComplianceEvaluationRecord {
  subjectType: ComplianceSubjectType;
  subjectId: string;
  overallState: OverallComplianceState;
  operationallyBlocked: boolean;
  blockingReasons: string[];
  referenceDate: string;
  requirements: RequirementEvaluationRecord[];
}

export interface SubjectComplianceResponse {
  subject: { id: string; displayId: string; status: string; name?: string };
  evaluation: SubjectComplianceEvaluationRecord;
  documentTypes: ComplianceDocumentTypeRecord[];
  activeDocuments: ComplianceDocumentRecord[];
}

export interface ComplianceSummaryResponse {
  nonCompliantVehicles: number;
  nonCompliantDrivers: number;
  blockedVehicles: number;
  blockedDrivers: number;
  expiringDocuments: number;
}

export interface ComplianceExceptionItem {
  subjectType: ComplianceSubjectType;
  subjectId: string;
  displayId: string;
  name?: string;
  status: string;
  overallState: OverallComplianceState;
  operationallyBlocked: boolean;
  blockingReasons: string[];
  issuesCount: number;
}

export interface ComplianceExceptionsResponse {
  items: ComplianceExceptionItem[];
  total: number;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresInSeconds: number;
}

export interface CreateDocumentTypeInput {
  code: string;
  name: string;
  description?: string | undefined;
  subjectType: ComplianceSubjectType;
  required?: boolean | undefined;
  expires?: boolean | undefined;
  defaultValidityDays?: number | undefined;
  warningDaysBeforeExpiry?: number | undefined;
  blocksOperation?: boolean | undefined;
}

export interface UpdateDocumentTypeInput {
  name?: string | undefined;
  description?: string | undefined;
  required?: boolean | undefined;
  expires?: boolean | undefined;
  defaultValidityDays?: number | undefined;
  warningDaysBeforeExpiry?: number | undefined;
  blocksOperation?: boolean | undefined;
}

export const complianceApi = {
  fetchSummary(): Promise<ComplianceSummaryResponse> {
    return requestApi<ComplianceSummaryResponse>('/compliance/summary');
  },

  fetchExceptions(params?: {
    subjectType?: ComplianceSubjectType | undefined;
    operationallyBlocked?: boolean | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<ComplianceExceptionsResponse> {
    const query = new URLSearchParams();
    if (params?.subjectType) query.set('subjectType', params.subjectType);
    if (params?.operationallyBlocked !== undefined) {
      query.set('operationallyBlocked', String(params.operationallyBlocked));
    }
    if (params?.search) query.set('search', params.search);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    return requestApi<ComplianceExceptionsResponse>(`/compliance/exceptions${qs ? `?${qs}` : ''}`);
  },

  fetchDocumentTypes(params?: {
    subjectType?: ComplianceSubjectType | undefined;
    status?: ComplianceDocumentTypeStatus | undefined;
  }): Promise<{ items: ComplianceDocumentTypeRecord[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.subjectType) query.set('subjectType', params.subjectType);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return requestApi<{ items: ComplianceDocumentTypeRecord[]; total: number }>(
      `/compliance/document-types${qs ? `?${qs}` : ''}`,
    );
  },

  fetchDocumentType(typeId: string): Promise<ComplianceDocumentTypeRecord> {
    return requestApi<ComplianceDocumentTypeRecord>(`/compliance/document-types/${typeId}`);
  },

  createDocumentType(input: CreateDocumentTypeInput): Promise<ComplianceDocumentTypeRecord> {
    return requestApi<ComplianceDocumentTypeRecord>('/compliance/document-types', {
      method: 'POST',
      body: input,
    });
  },

  updateDocumentType(
    typeId: string,
    input: UpdateDocumentTypeInput,
  ): Promise<ComplianceDocumentTypeRecord> {
    return requestApi<ComplianceDocumentTypeRecord>(`/compliance/document-types/${typeId}`, {
      method: 'PATCH',
      body: input,
    });
  },

  archiveDocumentType(typeId: string): Promise<ComplianceDocumentTypeRecord> {
    return requestApi<ComplianceDocumentTypeRecord>(
      `/compliance/document-types/${typeId}/archive`,
      {
        method: 'POST',
      },
    );
  },

  fetchDocuments(params?: {
    subjectType?: ComplianceSubjectType | undefined;
    documentTypeId?: string | undefined;
    status?: ComplianceDocumentStatus | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ items: ComplianceDocumentRecord[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.subjectType) query.set('subjectType', params.subjectType);
    if (params?.documentTypeId) query.set('documentTypeId', params.documentTypeId);
    if (params?.status) query.set('status', params.status);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    return requestApi<{ items: ComplianceDocumentRecord[]; total: number }>(
      `/compliance/documents${qs ? `?${qs}` : ''}`,
    );
  },

  fetchDocument(documentId: string): Promise<ComplianceDocumentRecord> {
    return requestApi<ComplianceDocumentRecord>(`/compliance/documents/${documentId}`);
  },

  uploadVehicleDocument(vehicleId: string, formData: FormData): Promise<ComplianceDocumentRecord> {
    return requestApi<ComplianceDocumentRecord>(`/vehicles/${vehicleId}/compliance/documents`, {
      method: 'POST',
      body: formData,
    });
  },

  uploadDriverDocument(driverId: string, formData: FormData): Promise<ComplianceDocumentRecord> {
    return requestApi<ComplianceDocumentRecord>(`/drivers/${driverId}/compliance/documents`, {
      method: 'POST',
      body: formData,
    });
  },

  replaceDocument(documentId: string, formData: FormData): Promise<ComplianceDocumentRecord> {
    return requestApi<ComplianceDocumentRecord>(`/compliance/documents/${documentId}/replace`, {
      method: 'POST',
      body: formData,
    });
  },

  revokeDocument(documentId: string, reason: string): Promise<ComplianceDocumentRecord> {
    return requestApi<ComplianceDocumentRecord>(`/compliance/documents/${documentId}/revoke`, {
      method: 'POST',
      body: { reason },
    });
  },

  getDownloadUrl(documentId: string): Promise<DownloadUrlResponse> {
    return requestApi<DownloadUrlResponse>(`/compliance/documents/${documentId}/download-url`);
  },

  fetchVehicleCompliance(vehicleId: string): Promise<SubjectComplianceResponse> {
    return requestApi<SubjectComplianceResponse>(`/vehicles/${vehicleId}/compliance`);
  },

  fetchDriverCompliance(driverId: string): Promise<SubjectComplianceResponse> {
    return requestApi<SubjectComplianceResponse>(`/drivers/${driverId}/compliance`);
  },
};

// ==========================================
// Finance Module (Fuel & Expenses) Types & API
// ==========================================

export type FuelQuantityUnit = 'LITER' | 'GALLON' | 'KWH' | 'KG';
export type FuelTransactionSource = 'MANUAL' | 'CSV_IMPORT';
export type FuelTransactionStatus = 'POSTED' | 'VOIDED';
export type FuelAnomalyCode =
  | 'ODOMETER_REGRESSION'
  | 'DUPLICATE_REFERENCE'
  | 'DUPLICATE_TRANSACTION'
  | 'FUTURE_TRANSACTION_DATE'
  | 'ZERO_DISTANCE_REFUEL'
  | 'UNUSUAL_UNIT_PRICE';
export type FuelAnomalySeverity = 'WARNING' | 'CRITICAL';
export type ExpenseCategoryStatus = 'ACTIVE' | 'ARCHIVED';
export type ExpenseStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export interface FuelAnomalyRecord {
  id: string;
  code: FuelAnomalyCode;
  anomalyCode?: FuelAnomalyCode;
  severity: FuelAnomalySeverity;
  description: string;
  metadata?: Record<string, unknown> | null | undefined;
  detectedAt?: string;
}

export interface FuelTransactionRecord {
  id: string;
  displayId: string;
  vehicleId: string;
  driverId: string | null;
  tripId: string | null;
  occurredAt: string;
  energyType: string;
  quantity: number;
  quantityUnit: FuelQuantityUnit;
  unitPrice: number;
  totalAmount: number;
  currencyCode: string;
  odometerKm: number | null;
  stationName: string | null;
  referenceNumber: string | null;
  source: FuelTransactionSource;
  status: FuelTransactionStatus;
  voidReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  receiptStorageKey: string | null;
  receiptFileName: string | null;
  receiptContentType: string | null;
  receiptFileSize: number | null;
  anomalies?: FuelAnomalyRecord[] | undefined;
  vehicle?: { id: string; displayId: string; registration: string; model: string } | undefined;
  driver?: { id: string; displayId: string; fullName: string } | null | undefined;
  trip?: { id: string; displayId: string } | null | undefined;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategoryRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ExpenseCategoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  displayId: string;
  categoryId: string;
  vehicleId: string | null;
  driverId: string | null;
  tripId: string | null;
  maintenanceWorkOrderId: string | null;
  occurredAt: string;
  description: string;
  amount: number;
  currencyCode: string;
  vendorName: string | null;
  referenceNumber: string | null;
  status: ExpenseStatus;
  voidReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  receiptStorageKey: string | null;
  receiptFileName: string | null;
  receiptContentType: string | null;
  receiptFileSize: number | null;
  category?: ExpenseCategoryRecord | undefined;
  vehicle?:
    { id: string; displayId: string; registration: string; model: string } | null | undefined;
  driver?: { id: string; displayId: string; fullName: string } | null | undefined;
  trip?: { id: string; displayId: string } | null | undefined;
  maintenanceWorkOrder?: { id: string; displayId: string; title: string } | null | undefined;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencySpendSummary {
  currencyCode: string;
  fuelSpend: number;
  expenseSpend: number;
  totalSpend: number;
}

export interface CategorySpendSummary {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  currencyCode: string;
  totalAmount: number;
  expenseCount: number;
}

export interface VehicleSpendSummary {
  vehicleId: string;
  displayId: string;
  registration: string;
  currencyCode: string;
  fuelSpend: number;
  expenseSpend: number;
  totalSpend: number;
}

export interface FinanceSummaryResponse {
  spendByCurrency: CurrencySpendSummary[];
  spendByCategory: CategorySpendSummary[];
  topVehiclesBySpend: VehicleSpendSummary[];
  totalFuelTransactions: number;
  totalExpenses: number;
  activeAnomaliesCount: number;
}

export interface VehicleFinanceSummaryResponse {
  vehicleId: string;
  displayId: string;
  registration: string;
  efficiency: {
    vehicleId: string;
    totalTransactions: number;
    totalQuantity: number;
    totalDistanceKm: number;
    averageKmPerUnit: number | null;
    averageUnitsPer100Km: number | null;
    currencySpend: Array<{
      currencyCode: string;
      totalAmount: number;
      averageCostPerKm: number | null;
    }>;
  };
  recentFuelTransactions: FuelTransactionRecord[];
  recentExpenses: ExpenseRecord[];
  spendByCurrency: Array<{
    currencyCode: string;
    fuelSpend: number;
    expenseSpend: number;
    totalSpend: number;
  }>;
  spendByCategory: Array<{
    categoryId: string;
    categoryCode: string;
    categoryName: string;
    currencyCode: string;
    totalAmount: number;
    expenseCount: number;
  }>;
}

export interface TripFinanceSummaryResponse {
  tripId: string;
  displayId: string;
  origin: string;
  destination: string;
  distanceKm?: number | null | undefined;
  fuelTransactions: FuelTransactionRecord[];
  expenses: ExpenseRecord[];
  spendByCurrency: Array<{
    currencyCode: string;
    fuelSpend: number;
    expenseSpend: number;
    totalSpend: number;
  }>;
}

export interface FuelImportPreviewRow {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  vehicleRegistration: string;
  matchedVehicleId: string | null;
  occurredAt: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  currencyCode: string;
  odometerKm?: number | null | undefined;
  stationName?: string | null | undefined;
  referenceNumber?: string | null | undefined;
}

export interface FuelImportPreviewResponse {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows?: number | undefined;
  invalidRows?: number | undefined;
  rows: FuelImportPreviewRow[];
}

export interface FuelImportConfirmResponse {
  importedCount: number;
  skippedCount: number;
  errors: Array<{ row: number; error: string }>;
}

export interface CreateFuelInput {
  vehicleId: string;
  driverId?: string | undefined;
  tripId?: string | undefined;
  occurredAt: string;
  energyType: string;
  quantity: number;
  quantityUnit?: FuelQuantityUnit | undefined;
  unitPrice: number;
  totalAmount?: number | undefined;
  currencyCode: string;
  odometerKm?: number | undefined;
  stationName?: string | undefined;
  referenceNumber?: string | undefined;
}

export interface CreateExpenseInput {
  categoryId: string;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  maintenanceWorkOrderId?: string | undefined;
  occurredAt: string;
  description: string;
  amount: number;
  currencyCode: string;
  vendorName?: string | undefined;
  referenceNumber?: string | undefined;
  status?: 'DRAFT' | 'POSTED' | undefined;
}

export interface UpdateExpenseDraftInput {
  categoryId?: string | undefined;
  vehicleId?: string | null | undefined;
  driverId?: string | null | undefined;
  tripId?: string | null | undefined;
  maintenanceWorkOrderId?: string | null | undefined;
  occurredAt?: string | undefined;
  description?: string | undefined;
  amount?: number | undefined;
  currencyCode?: string | undefined;
  vendorName?: string | null | undefined;
  referenceNumber?: string | null | undefined;
  version: number;
}

export const financeApi = {
  fetchSummary(fromDate?: string, toDate?: string): Promise<FinanceSummaryResponse> {
    const query = new URLSearchParams();
    if (fromDate) query.set('fromDate', fromDate);
    if (toDate) query.set('toDate', toDate);
    const qs = query.toString();
    return requestApi<FinanceSummaryResponse>(`/finance/summary${qs ? `?${qs}` : ''}`);
  },

  fetchVehicleFinance(vehicleId: string): Promise<VehicleFinanceSummaryResponse> {
    return requestApi<VehicleFinanceSummaryResponse>(`/vehicles/${vehicleId}/finance`);
  },

  fetchTripFinance(tripId: string): Promise<TripFinanceSummaryResponse> {
    return requestApi<TripFinanceSummaryResponse>(`/trips/${tripId}/finance`);
  },

  fetchFuelTransactions(params?: {
    vehicleId?: string | undefined;
    driverId?: string | undefined;
    tripId?: string | undefined;
    status?: FuelTransactionStatus | undefined;
    hasAnomalies?: boolean | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ items: FuelTransactionRecord[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.vehicleId) query.set('vehicleId', params.vehicleId);
    if (params?.driverId) query.set('driverId', params.driverId);
    if (params?.tripId) query.set('tripId', params.tripId);
    if (params?.status) query.set('status', params.status);
    if (params?.hasAnomalies !== undefined) query.set('hasAnomalies', String(params.hasAnomalies));
    if (params?.fromDate) query.set('fromDate', params.fromDate);
    if (params?.toDate) query.set('toDate', params.toDate);
    if (params?.search) query.set('search', params.search);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    return requestApi<{ items: FuelTransactionRecord[]; total: number }>(
      `/fuel${qs ? `?${qs}` : ''}`,
    );
  },

  fetchFuelTransaction(transactionId: string): Promise<FuelTransactionRecord> {
    return requestApi<FuelTransactionRecord>(`/fuel/${transactionId}`);
  },

  createFuelTransaction(input: CreateFuelInput): Promise<FuelTransactionRecord> {
    return requestApi<FuelTransactionRecord>('/fuel', {
      method: 'POST',
      body: input,
    });
  },

  voidFuelTransaction(transactionId: string, reason: string): Promise<FuelTransactionRecord> {
    return requestApi<FuelTransactionRecord>(`/fuel/${transactionId}/void`, {
      method: 'POST',
      body: { reason },
    });
  },

  uploadFuelReceipt(transactionId: string, formData: FormData): Promise<FuelTransactionRecord> {
    return requestApi<FuelTransactionRecord>(`/fuel/${transactionId}/receipt`, {
      method: 'POST',
      body: formData,
    });
  },

  getFuelReceiptUrl(transactionId: string): Promise<DownloadUrlResponse> {
    return requestApi<DownloadUrlResponse>(`/fuel/${transactionId}/receipt-url`);
  },

  previewFuelCsv(csvContent: string): Promise<FuelImportPreviewResponse> {
    return requestApi<FuelImportPreviewResponse>('/fuel/import-preview', {
      method: 'POST',
      body: { csvContent },
    });
  },

  confirmFuelCsv(csvContent: string): Promise<FuelImportConfirmResponse> {
    return requestApi<FuelImportConfirmResponse>('/fuel/import-confirm', {
      method: 'POST',
      body: { csvContent },
    });
  },

  fetchExpenseCategories(includeArchived = false): Promise<ExpenseCategoryRecord[]> {
    return requestApi<ExpenseCategoryRecord[]>(
      `/expense-categories${includeArchived ? '?includeArchived=true' : ''}`,
    );
  },

  createExpenseCategory(input: {
    code: string;
    name: string;
    description?: string | undefined;
  }): Promise<ExpenseCategoryRecord> {
    return requestApi<ExpenseCategoryRecord>('/expense-categories', {
      method: 'POST',
      body: input,
    });
  },

  updateExpenseCategory(
    categoryId: string,
    input: { name?: string | undefined; description?: string | undefined },
  ): Promise<ExpenseCategoryRecord> {
    return requestApi<ExpenseCategoryRecord>(`/expense-categories/${categoryId}`, {
      method: 'PUT',
      body: input,
    });
  },

  archiveExpenseCategory(categoryId: string): Promise<ExpenseCategoryRecord> {
    return requestApi<ExpenseCategoryRecord>(`/expense-categories/${categoryId}/archive`, {
      method: 'POST',
    });
  },

  fetchExpenses(params?: {
    categoryId?: string | undefined;
    vehicleId?: string | undefined;
    driverId?: string | undefined;
    tripId?: string | undefined;
    maintenanceWorkOrderId?: string | undefined;
    status?: ExpenseStatus | undefined;
    fromDate?: string | undefined;
    toDate?: string | undefined;
    search?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ items: ExpenseRecord[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.categoryId) query.set('categoryId', params.categoryId);
    if (params?.vehicleId) query.set('vehicleId', params.vehicleId);
    if (params?.driverId) query.set('driverId', params.driverId);
    if (params?.tripId) query.set('tripId', params.tripId);
    if (params?.maintenanceWorkOrderId)
      query.set('maintenanceWorkOrderId', params.maintenanceWorkOrderId);
    if (params?.status) query.set('status', params.status);
    if (params?.fromDate) query.set('fromDate', params.fromDate);
    if (params?.toDate) query.set('toDate', params.toDate);
    if (params?.search) query.set('search', params.search);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    return requestApi<{ items: ExpenseRecord[]; total: number }>(`/expenses${qs ? `?${qs}` : ''}`);
  },

  fetchExpense(expenseId: string): Promise<ExpenseRecord> {
    return requestApi<ExpenseRecord>(`/expenses/${expenseId}`);
  },

  createExpense(input: CreateExpenseInput): Promise<ExpenseRecord> {
    return requestApi<ExpenseRecord>('/expenses', {
      method: 'POST',
      body: input,
    });
  },

  updateExpenseDraft(expenseId: string, input: UpdateExpenseDraftInput): Promise<ExpenseRecord> {
    return requestApi<ExpenseRecord>(`/expenses/${expenseId}`, {
      method: 'PUT',
      body: input,
    });
  },

  postExpense(expenseId: string): Promise<ExpenseRecord> {
    return requestApi<ExpenseRecord>(`/expenses/${expenseId}/post`, {
      method: 'POST',
    });
  },

  voidExpense(expenseId: string, reason: string): Promise<ExpenseRecord> {
    return requestApi<ExpenseRecord>(`/expenses/${expenseId}/void`, {
      method: 'POST',
      body: { reason },
    });
  },

  uploadExpenseReceipt(expenseId: string, formData: FormData): Promise<ExpenseRecord> {
    return requestApi<ExpenseRecord>(`/expenses/${expenseId}/receipt`, {
      method: 'POST',
      body: formData,
    });
  },

  getExpenseReceiptUrl(expenseId: string): Promise<DownloadUrlResponse> {
    return requestApi<DownloadUrlResponse>(`/expenses/${expenseId}/receipt-url`);
  },
};
