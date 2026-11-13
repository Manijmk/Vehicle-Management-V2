import { Inject, Injectable } from '@nestjs/common';
import type { ApiConfig } from '@vms/config';
import { API_CONFIG } from '../../../common/tokens.js';
import type {
  EncryptedSecretResult,
  IntegrationSecretPort,
} from '../application/ports/integration-secret.port.js';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  generateIntegrationSecret,
} from '../domain/integration-secret.js';

@Injectable()
export class AesIntegrationSecretAdapter implements IntegrationSecretPort {
  private readonly masterKey: string;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.masterKey = config.INTEGRATION_MASTER_KEY;
  }

  generateSecret(): string {
    return generateIntegrationSecret();
  }

  encryptSecret(secret: string, keyVersion = 1): EncryptedSecretResult {
    const encrypted = encryptIntegrationSecret(secret, this.masterKey, keyVersion);
    return {
      encryptedSecret: encrypted.encryptedSecret,
      keyVersion: encrypted.keyVersion,
      secretHash: encrypted.secretHash,
    };
  }

  decryptSecret(encryptedSecret: string): string {
    return decryptIntegrationSecret(encryptedSecret, this.masterKey);
  }
}
