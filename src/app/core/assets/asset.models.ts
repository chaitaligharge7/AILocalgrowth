/**
 * M03 Asset Library models aligned with `App\Application\Content\AssetService`.
 */

export interface Asset {
  id: string;
  tenant_id: string;
  uploader_id: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  status: string;
  album?: string | null;
  original_filename?: string | null;
  tags: string[];
  download_url: string;
  created_at: string;
  updated_at: string;
}

export interface AssetAlbum {
  name: string;
  count: number;
}

export interface AssetListResponse {
  assets: Asset[];
  albums: AssetAlbum[];
  tags: string[];
}

export interface AssetSearchParams {
  q?: string;
  album?: string;
  tag?: string;
  limit?: number;
}

export interface UpdateAssetRequest {
  album?: string | null;
  original_filename?: string | null;
  tags?: string[];
}

export interface UploadIntentRequest {
  filename: string;
  declared_mime: string;
  declared_bytes: number;
}

export interface UploadIntentResponse {
  upload_intent_token: string;
  expires_at: string;
  max_bytes: number;
  allowed_mimes: string[];
}

export interface CompleteUploadRequest {
  upload_intent_token: string;
  file_base64: string;
  album?: string;
  tags?: string[];
}

export interface DeleteAssetResponse {
  deleted: true;
}
