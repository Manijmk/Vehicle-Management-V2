import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../identity/transport/authenticated-request.js';
import { RequirePermissions, TenantScoped } from '../../identity/transport/security.decorators.js';
import { DriverService } from '../application/driver.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- DTO classes are runtime validation metadata.
import {
  ActivateDriverDto,
  AddLicenseDto,
  CreateDriverDto,
  DeactivateDriverDto,
  DriverFilterDto,
  SuspendDriverDto,
  UpdateDriverDto,
  UpdateLicenseDto,
} from './driver.dto.js';

function mutationMetadata(request: AuthenticatedRequest) {
  const ipAddress = request.ip;
  const userAgent = Array.isArray(request.headers['user-agent'])
    ? request.headers['user-agent'][0]
    : request.headers['user-agent'];

  return {
    actorId: request.principal.userId,
    actorPermissions: [...request.tenant!.permissions],
    requestId:
      request.requestId ??
      (Array.isArray(request.headers['x-request-id'])
        ? request.headers['x-request-id'][0]
        : request.headers['x-request-id']) ??
      'driver-request',
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}

@ApiTags('drivers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Bearer token is absent, invalid, or inactive' })
@ApiForbiddenResponse({ description: 'Tenant context or required permission is invalid' })
@ApiHeader({
  name: 'x-organization-id',
  required: true,
  description: 'Selected tenant; verified against active membership',
})
@TenantScoped()
@Controller('drivers')
export class DriverController {
  constructor(@Inject(DriverService) private readonly service: DriverService) {}

  @Get()
  @RequirePermissions('driver.read')
  @ApiOperation({ summary: 'List drivers in the organization' })
  @ApiOkResponse({ description: 'Paginated drivers' })
  listDrivers(
    @Query() query: DriverFilterDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.listDrivers(request.tenant!.organizationId, query);
  }

  @Post()
  @RequirePermissions('driver.create')
  @ApiOperation({ summary: 'Create a new driver in DRAFT status' })
  @ApiCreatedResponse({ description: 'Created driver' })
  createDriver(
    @Body() body: CreateDriverDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.createDriver({
      organizationId: request.tenant!.organizationId,
      ...(body.displayId !== undefined ? { displayId: body.displayId } : {}),
      firstName: body.firstName,
      lastName: body.lastName,
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.employeeNumber !== undefined ? { employeeNumber: body.employeeNumber } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      metadata: mutationMetadata(request),
    });
  }

  @Get(':driverId')
  @RequirePermissions('driver.read')
  @ApiOperation({ summary: 'Get driver details with licenses and eligibility' })
  @ApiOkResponse({ description: 'Driver details' })
  getDriver(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.getDriver(request.tenant!.organizationId, driverId);
  }

  @Patch(':driverId')
  @RequirePermissions('driver.update')
  @ApiOperation({ summary: 'Update driver profile' })
  @ApiOkResponse({ description: 'Updated driver' })
  updateDriver(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Body() body: UpdateDriverDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.updateDriver({
      organizationId: request.tenant!.organizationId,
      driverId,
      ...(body.displayId !== undefined ? { displayId: body.displayId } : {}),
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.employeeNumber !== undefined ? { employeeNumber: body.employeeNumber } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':driverId/activate')
  @HttpCode(204)
  @RequirePermissions('driver.activate')
  @ApiOperation({ summary: 'Activate driver (requires at least one valid license)' })
  @ApiNoContentResponse({ description: 'Driver activated' })
  async activateDriver(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Body() body: ActivateDriverDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.service.activateDriver({
      organizationId: request.tenant!.organizationId,
      driverId,
      ...(body?.version !== undefined ? { version: body.version } : {}),
      metadata: mutationMetadata(request),
    });
  }

  @Post(':driverId/suspend')
  @HttpCode(204)
  @RequirePermissions('driver.suspend')
  @ApiOperation({ summary: 'Suspend active driver' })
  @ApiNoContentResponse({ description: 'Driver suspended' })
  async suspendDriver(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Body() body: SuspendDriverDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.service.suspendDriver({
      organizationId: request.tenant!.organizationId,
      driverId,
      reason: body.reason,
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Post(':driverId/deactivate')
  @HttpCode(204)
  @RequirePermissions('driver.deactivate')
  @ApiOperation({ summary: 'Permanently deactivate driver' })
  @ApiNoContentResponse({ description: 'Driver deactivated' })
  async deactivateDriver(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Body() body: DeactivateDriverDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.service.deactivateDriver({
      organizationId: request.tenant!.organizationId,
      driverId,
      reason: body.reason,
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Get(':driverId/status-history')
  @RequirePermissions('driver.history.read')
  @ApiOperation({ summary: 'List driver lifecycle status transitions' })
  @ApiOkResponse({ description: 'Driver status history' })
  async listStatusHistory(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown[]> {
    return await this.service.listStatusHistory(request.tenant!.organizationId, driverId);
  }

  @Get(':driverId/licenses')
  @RequirePermissions('driver.read')
  @ApiOperation({ summary: 'List licenses belonging to a driver' })
  @ApiOkResponse({ description: 'Driver licenses' })
  async listLicenses(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown[]> {
    return await this.service.listLicenses(request.tenant!.organizationId, driverId);
  }

  @Post(':driverId/licenses')
  @RequirePermissions('driver.license.manage')
  @ApiOperation({ summary: 'Add a new license for a driver' })
  @ApiCreatedResponse({ description: 'Added license' })
  addLicense(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Body() body: AddLicenseDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.addLicense({
      organizationId: request.tenant!.organizationId,
      driverId,
      licenseNumber: body.licenseNumber,
      issuingCountry: body.issuingCountry,
      ...(body.issuingRegion !== undefined ? { issuingRegion: body.issuingRegion } : {}),
      licenseClasses: body.licenseClasses,
      issueDate: new Date(body.issueDate),
      expiryDate: new Date(body.expiryDate),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      metadata: mutationMetadata(request),
    });
  }

  @Patch(':driverId/licenses/:licenseId')
  @RequirePermissions('driver.license.manage')
  @ApiOperation({ summary: 'Update an existing driver license' })
  @ApiOkResponse({ description: 'Updated license' })
  updateLicense(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Param('licenseId', new ParseUUIDPipe({ version: '4' })) licenseId: string,
    @Body() body: UpdateLicenseDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.service.updateLicense({
      organizationId: request.tenant!.organizationId,
      driverId,
      licenseId,
      ...(body.licenseNumber !== undefined ? { licenseNumber: body.licenseNumber } : {}),
      ...(body.issuingCountry !== undefined ? { issuingCountry: body.issuingCountry } : {}),
      ...(body.issuingRegion !== undefined ? { issuingRegion: body.issuingRegion } : {}),
      ...(body.licenseClasses !== undefined ? { licenseClasses: body.licenseClasses } : {}),
      ...(body.issueDate !== undefined ? { issueDate: new Date(body.issueDate) } : {}),
      ...(body.expiryDate !== undefined ? { expiryDate: new Date(body.expiryDate) } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      version: body.version,
      metadata: mutationMetadata(request),
    });
  }

  @Delete(':driverId/licenses/:licenseId')
  @HttpCode(204)
  @RequirePermissions('driver.license.manage')
  @ApiOperation({ summary: 'Remove a driver license' })
  @ApiNoContentResponse({ description: 'License removed' })
  async removeLicense(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Param('licenseId', new ParseUUIDPipe({ version: '4' })) licenseId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.service.removeLicense({
      organizationId: request.tenant!.organizationId,
      driverId,
      licenseId,
      metadata: mutationMetadata(request),
    });
  }
}
