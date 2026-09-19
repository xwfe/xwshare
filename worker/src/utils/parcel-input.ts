import { EXPIRES_IN_VALUES, PARCEL_LIMITS } from '../config/limits';

export type ParcelValidationError = {
  error: string;
  code: string;
  status: 400 | 413;
};

export function validateExpiresIn(value: unknown): ParcelValidationError | null {
  if (typeof value !== 'string' || !EXPIRES_IN_VALUES.has(value)) {
    return { error: 'Invalid expiry', code: 'INVALID_EXPIRY', status: 400 };
  }
  return null;
}

export function validateOptionalBoolean(
  value: unknown,
  field: string
): ParcelValidationError | null {
  if (value !== undefined && typeof value !== 'boolean') {
    return { error: `Invalid ${field}`, code: 'INVALID_OPTION', status: 400 };
  }
  return null;
}

export function normalizeMaxDownloads(value: unknown): number | ParcelValidationError {
  if (value === undefined || value === null || value === 0) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return { error: 'Invalid max downloads', code: 'INVALID_MAX_DOWNLOADS', status: 400 };
  }
  return value;
}

export function validateTitle(value: unknown): ParcelValidationError | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > PARCEL_LIMITS.MAX_TITLE_LENGTH) {
    return { error: 'Invalid title', code: 'INVALID_TITLE', status: 400 };
  }
  return null;
}

export function validateTextContent(value: unknown): ParcelValidationError | null {
  if (typeof value !== 'string' || value.length === 0) {
    return { error: 'Invalid content', code: 'INVALID_CONTENT', status: 400 };
  }
  if (new TextEncoder().encode(value).byteLength > PARCEL_LIMITS.MAX_TEXT_BYTES) {
    return { error: 'Text too large', code: 'TEXT_TOO_LARGE', status: 413 };
  }
  return null;
}

export function validateFileMetadata(
  fileName: unknown,
  fileSize: unknown,
  contentType: unknown
): ParcelValidationError | null {
  if (
    typeof fileName !== 'string' ||
    fileName.trim().length === 0 ||
    fileName.length > PARCEL_LIMITS.MAX_FILE_NAME_LENGTH
  ) {
    return { error: 'Invalid file name', code: 'INVALID_FILE_NAME', status: 400 };
  }
  if (typeof fileSize !== 'number' || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
    return { error: 'Invalid file size', code: 'INVALID_FILE_SIZE', status: 400 };
  }
  if (fileSize > PARCEL_LIMITS.MAX_FILE_SIZE) {
    return { error: 'File too large', code: 'FILE_TOO_LARGE', status: 413 };
  }
  if (
    typeof contentType !== 'string' ||
    contentType.length === 0 ||
    contentType.length > PARCEL_LIMITS.MAX_CONTENT_TYPE_LENGTH
  ) {
    return { error: 'Invalid content type', code: 'INVALID_CONTENT_TYPE', status: 400 };
  }
  return null;
}
