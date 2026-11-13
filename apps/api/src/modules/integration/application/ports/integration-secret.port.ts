export interface EncryptedSecretResult {
  readonly encryptedSecret: string;
  readonly keyVersion: number;
  readonly secretHash: string;
}

export interface IntegrationSecretPort {
  generateSecret(): string;
  encryptSecret(secret: string): EncryptedSecretResult;
  decryptSecret(encryptedSecret: string): string;
}
