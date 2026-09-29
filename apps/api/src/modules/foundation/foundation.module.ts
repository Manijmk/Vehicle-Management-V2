import { Module } from '@nestjs/common';

import { AUTHENTICATION_PORT, FOUNDATION_REPOSITORY } from '../../common/tokens.js';
import { FoundationService } from './application/foundation.service.js';
import { PrismaFoundationRepository } from './infrastructure/prisma-foundation.repository.js';
import { LocalJwtAuthenticationAdapter } from '../identity/infrastructure/local-jwt-authentication.adapter.js';
import { TenantContextService } from '../identity/infrastructure/tenant-context.service.js';
import { IdentityController } from './transport/identity.controller.js';
import { OrganizationController } from './transport/organization.controller.js';

@Module({
  controllers: [IdentityController, OrganizationController],
  providers: [
    FoundationService,
    PrismaFoundationRepository,
    LocalJwtAuthenticationAdapter,
    TenantContextService,
    { provide: FOUNDATION_REPOSITORY, useExisting: PrismaFoundationRepository },
    { provide: AUTHENTICATION_PORT, useExisting: LocalJwtAuthenticationAdapter },
  ],
  exports: [AUTHENTICATION_PORT, TenantContextService],
})
export class FoundationModule {}
