import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDocumentTypeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]{2,50}$/, {
    message: 'Code must be 2-50 uppercase alphanumeric characters or underscores',
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsIn(['VEHICLE', 'DRIVER'])
  subjectType!: 'VEHICLE' | 'DRIVER';

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  expires?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  defaultValidityDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  warningDaysBeforeExpiry?: number;

  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;
}

export class UpdateDocumentTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  expires?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  defaultValidityDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  warningDaysBeforeExpiry?: number;

  @IsOptional()
  @IsBoolean()
  blocksOperation?: boolean;
}

export class UploadComplianceDocumentDto {
  @IsString()
  @IsNotEmpty()
  documentTypeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  issuingAuthority?: string;

  @IsOptional()
  @IsString()
  issuedOn?: string;

  @IsOptional()
  @IsString()
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReplaceComplianceDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  issuingAuthority?: string;

  @IsOptional()
  @IsString()
  issuedOn?: string;

  @IsOptional()
  @IsString()
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RevokeComplianceDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ListDocumentTypesQueryDto {
  @IsOptional()
  @IsIn(['VEHICLE', 'DRIVER'])
  subjectType?: 'VEHICLE' | 'DRIVER';

  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListComplianceDocumentsQueryDto {
  @IsOptional()
  @IsIn(['VEHICLE', 'DRIVER'])
  subjectType?: 'VEHICLE' | 'DRIVER';

  @IsOptional()
  @IsString()
  documentTypeId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUPERSEDED', 'REVOKED'])
  status?: 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ComplianceExceptionsQueryDto {
  @IsOptional()
  @IsIn(['VEHICLE', 'DRIVER'])
  subjectType?: 'VEHICLE' | 'DRIVER';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  operationallyBlocked?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
