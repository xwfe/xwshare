import type { UploadInstructions, StorageProvider } from './provider';

export class R2Storage implements StorageProvider {
  constructor(private origin: string, private bucket: R2Bucket) {}

  async createUploadUrl(fileKey: string, contentType: string, contentLength: number): Promise<UploadInstructions> {
    return {
      method: 'PUT',
      url: `${this.origin}/api/upload/${encodeURIComponent(fileKey)}`,
      headers: {
        'Content-Type': contentType,
      },
      fileKey,
    };
  }

  async getDownloadUrl(fileKey: string, token?: string): Promise<string> {
    const url = `${this.origin}/api/download-file/${encodeURIComponent(fileKey)}`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
  }

  async delete(fileKey: string): Promise<void> {
    await this.bucket.delete(fileKey);
  }

  async exists(fileKey: string): Promise<boolean> {
    const obj = await this.bucket.head(fileKey);
    return obj !== null;
  }
}
