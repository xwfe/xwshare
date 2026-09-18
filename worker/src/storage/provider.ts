export interface UploadInstructions {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  fileKey: string;
}

export interface StorageProvider {
  createUploadUrl(fileKey: string, contentType: string, contentLength: number): Promise<UploadInstructions>;
  getDownloadUrl(fileKey: string): Promise<string>;
  delete(fileKey: string): Promise<void>;
  exists(fileKey: string): Promise<boolean>;
}
