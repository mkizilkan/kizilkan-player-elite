import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Prevents "browser doesn't return" issue on iOS
WebBrowser.maybeCompleteAuthSession();

/**
 * Google Drive OAuth service.
 *
 * REQUIREMENTS:
 *   1. Create OAuth 2.0 Client ID at https://console.cloud.google.com/apis/credentials
 *   2. Set env var EXPO_PUBLIC_GOOGLE_CLIENT_ID (or web/ios/android specific)
 *   3. Enable Google Drive API for the project
 *   4. Add authorized redirect URIs (see the console during first run)
 *
 * IMPORTANT: This works only in Native Build (Publish sonrası).
 * In Expo Go the redirect URI scheme differs.
 */

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || CLIENT_ID;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || CLIENT_ID;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export function isGoogleDriveConfigured(): boolean {
  return !!CLIENT_ID || !!ANDROID_CLIENT_ID || !!IOS_CLIENT_ID || !!WEB_CLIENT_ID;
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
  if (!isGoogleDriveConfigured()) {
    throw new Error(
      'Google Drive henüz yapılandırılmadı. Uygulamayı Publish edip, Deployment paneli → Secrets bölümünden EXPO_PUBLIC_GOOGLE_CLIENT_ID değerini ekleyin.'
    );
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'frontend',
    path: 'oauth/google',
  });

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
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
  jsonContent: string
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
