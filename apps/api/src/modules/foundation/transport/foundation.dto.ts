import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

import { membershipStatuses } from '../domain/membership.js';
import { permissionCodes } from '../domain/permissions.js';
import { principalStatuses } from '../domain/organization.js';
import type { MembershipState } from '../domain/membership.js';
import type { PermissionCode } from '../domain/permissions.js';
import type { PrincipalState } from '../domain/organization.js';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  readonly name?: string;

  @ApiPropertyOptional({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  @Length(2, 100)
  readonly slug?: string;

  @ApiPropertyOptional({ enum: principalStatuses })
  @IsOptional()
  @IsIn(principalStatuses)
  readonly status?: PrincipalState;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class CreateMembershipDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @Length(3, 320)
  readonly email!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  readonly displayName!: string;

  @ApiPropertyOptional({ enum: membershipStatuses, default: 'INVITED' })
  @IsOptional()
  @IsIn(membershipStatuses)
  readonly status: MembershipState = 'INVITED';

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  readonly roleIds: string[] = [];
}

export class UpdateMembershipDto {
  @ApiProperty({ enum: membershipStatuses })
  @IsIn(membershipStatuses)
  readonly status!: MembershipState;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  readonly version!: number;
}

export class CreateRoleDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Length(1, 100)
  readonly name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  readonly description?: string;

  @ApiProperty({ enum: permissionCodes, isArray: true })
  @IsArray()
  @ArrayMaxSize(permissionCodes.length)
  @IsIn(permissionCodes, { each: true })
  readonly permissions!: PermissionCode[];
}
