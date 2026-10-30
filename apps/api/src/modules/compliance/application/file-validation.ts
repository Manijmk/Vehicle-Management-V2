import {
  DocumentFileTooLargeError,
  UnsupportedDocumentFileTypeError,
} from '../domain/compliance-errors.js';

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function validateUploadedDocumentFile(
  buffer: Buffer,
  declaredMimeType: string,
  maxSizeBytes: number = MAX_DOCUMENT_FILE_SIZE_BYTES,
): { detectedMimeType: AllowedMimeType; sizeBytes: number } {
  const sizeBytes = buffer.length;

  if (sizeBytes > maxSizeBytes) {
    throw new DocumentFileTooLargeError(sizeBytes, maxSizeBytes);
  }

  if (sizeBytes < 4) {
    throw new UnsupportedDocumentFileTypeError(declaredMimeType || 'unknown', [
      ...ALLOWED_MIME_TYPES,
    ]);
  }

  // Magic bytes inspection
  let detectedType: AllowedMimeType | null = null;

  // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    detectedType = 'application/pdf';
  }
  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  else if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedType = 'image/png';
  }
  // JPEG: 0xFF 0xD8 0xFF
  else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedType = 'image/jpeg';
  }

  if (!detectedType) {
    throw new UnsupportedDocumentFileTypeError(declaredMimeType || 'unknown', [
      ...ALLOWED_MIME_TYPES,
    ]);
  }

  return { detectedMimeType: detectedType, sizeBytes };
}
