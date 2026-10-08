import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { storage } from '@/src/utils/storage';
import { Platform } from 'react-native';
import { KizilkanNativeCore } from '@/modules/kizilkan-native-core';

// Prevents "browser doesn't return" issue on iOS
WebBrowser.maybeCompleteAuthSession();

/**
 * Google Drive OAuth service.
 *
 * v18.7.18: OAuth Client ID artık KULLANICI tarafından uygulama içinde (Ayarlar → Google Drive)
 * girilebilir — build/deploy sırasında env gerekmez. Kullanıcı kendi Google Cloud projesinden bir
 * OAuth 2.0 Client ID (tip: Web uygulaması) oluşturur, uygulamanın gösterdiği yönlendirme (redirect)
 * URI'sini Google Console'a ekler, Drive API'yi açar ve ID'yi Ayarlar'a yapıştırır. "Giriş yap"
 * tarayıcıda Google oturumu açar. Env değeri (EXPO_PUBLIC_GOOGLE_CLIENT_ID) hâlâ yedek olarak okunur.
 */

const ENV_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

const GOOGLE_CLIENT_ID_KEY = 'kizilkan.googleDrive.clientId';
let runtimeClientId: string | null = null; // Ayarlardan girilen ID (storage'dan hidratlanır).

/** Uygulama açılışında çağrılır: kullanıcının girdiği client ID'yi belleğe yükler (senkron erişim için). */
export async function hydrateGoogleDriveConfig(): Promise<void> {
  try { runtimeClientId = String((await storage.getItem(GOOGLE_CLIENT_ID_KEY, '')) || '').trim() || null; } catch { runtimeClientId = null; }
}
/** Kullanıcının girdiği OAuth Client ID'yi kaydet (boş → sil). */
export async function setGoogleDriveClientId(id: string): Promise<void> {
  const value = String(id || '').trim();
  runtimeClientId = value || null;
  try { if (value) await storage.setItem(GOOGLE_CLIENT_ID_KEY, value); else await storage.removeItem(GOOGLE_CLIENT_ID_KEY); } catch {}
}
/** Kullanıcı ID'si → yoksa env. */
export function getGoogleDriveClientId(): string { return runtimeClientId || ENV_CLIENT_ID || ''; }

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export function isGoogleDriveConfigured(): boolean {
  if (Platform.OS === 'android') return KizilkanNativeCore.available;
  return !!getGoogleDriveClientId();
}
/** Google Console'a eklenecek yönlendirme (redirect) URI'si — kullanıcıya gösterilir. */
export function getGoogleDriveRedirectUri(): string {
  if (Platform.OS === 'android') {
    const config = KizilkanNativeCore.getGoogleDriveClientConfiguration();
    return config ? `Android OAuth · Paket: ${config.packageName}\nSHA-1: ${config.sha1}` : 'Android yetkilendirme yapılandırması kullanılamıyor.';
  }
  try { return AuthSession.makeRedirectUri({ path: 'oauth/google' }); } catch { return ''; }
}

export interface DriveAuthResult {
  accessToken: string;
  expiresIn?: number;
  refreshToken?: string;
}

/**
 * Trigger Google OAuth flow and return access token for Drive API.
 * Throws if not configured or user cancels.
 */
export async function authenticateGoogleDrive(): Promise<DriveAuthResult> {
  if (Platform.OS === 'android') return await KizilkanNativeCore.authorizeGoogleDrive();
  const clientId = getGoogleDriveClientId();
  if (!clientId) {
    throw new Error(
      'Google Drive yapılandırılmadı. Ayarlar → Google Drive bölümünden kendi OAuth Client ID’nizi girin (Google Cloud → API ve Hizmetler → Kimlik Bilgileri).'
    );
  }

  // v18.7.18: scheme hardcode edilmez; expo-auth-session native build'de uygulamanın kendi scheme'ini
  // (kizilkan-gpt) otomatik kullanır. Kullanıcı bu redirect URI'yi Google Console'a eklemelidir.
  const redirectUri = AuthSession.makeRedirectUri({ path: 'oauth/google' });

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: [DRIVE_SCOPE, 'openid', 'email', 'profile'],
    redirectUri,
    responseType: AuthSession.ResponseType.Token,
  });

  await request.makeAuthUrlAsync(discovery);
  const result = await request.promptAsync(discovery);

  if (result.type !== 'success' || !result.params.access_token) {
    throw new Error('Google girişi iptal edildi veya başarısız oldu.');
  }

  return {
    accessToken: result.params.access_token as string,
    expiresIn: result.params.expires_in ? Number(result.params.expires_in) : undefined,
  };
}

/**
 * Upload a JSON string as a file to the user's Google Drive.
 */
export async function uploadJsonToDrive(
  accessToken: string,
  fileName: string,
  jsonContent: string,
  signal?: AbortSignal
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const metadata = { name: fileName, mimeType: 'application/json' };
  const boundary = 'kizilkan-boundary-' + Date.now();

  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    jsonContent + '\r\n' +
    `--${boundary}--`;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    signal,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Drive yüklemesi başarısız: ' + err);
  }
  return res.json();
}
