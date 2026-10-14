export type GoogleSession = {
  accessToken: string;
  expiresAt: number;
  sub: string;
  email: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (override?: { prompt?: string }) => void;
};

type GoogleIdentityApi = {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        include_granted_scopes: boolean;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => GoogleTokenClient;
      hasGrantedAllScopes: (
        response: GoogleTokenResponse,
        ...scopes: string[]
      ) => boolean;
      revoke?: (token: string, callback?: () => void) => void;
    };
  };
};

const env = (
  import.meta as ImportMeta & {
    env?: Record<string, unknown>;
  }
).env;
export const GOOGLE_CLIENT_ID =
  typeof env?.VITE_GOOGLE_CLIENT_ID === 'string'
    ? env.VITE_GOOGLE_CLIENT_ID.trim()
    : '';

const GIS_URL = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const USER_SCOPES = ['openid', 'email'];
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const REQUESTED_SCOPES = [...USER_SCOPES, DRIVE_SCOPE];
const AUTH_SCRIPT_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 120_000;
const PROFILE_TIMEOUT_MS = 15_000;

let authScriptPromise: Promise<void> | undefined;
let hasPendingAuth = false;
let currentSession: GoogleSession | undefined;

function googleApi(): GoogleIdentityApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { google?: GoogleIdentityApi }).google;
}

function authError(message: string, cause?: unknown): Error {
  return cause === undefined
    ? new Error(message)
    : new Error(message, { cause });
}

function authErrorForPopup(type = ''): Error {
  if (type === 'popup_closed' || type === 'popup_closed_by_user') {
    return authError('Google認証がキャンセルされました。');
  }
  if (type === 'popup_failed_to_open') {
    return authError(
      'Google認証画面を開けませんでした。ポップアップ設定を確認してください。',
    );
  }
  return authError(
    'Google認証に失敗しました。時間をおいて再試行してください。',
  );
}

export function loadGoogleAuth(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    // Keep the app usable without sync configuration. The connect action reports
    // the missing public client ID when the user tries to connect.
    return Promise.resolve();
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      authError('Google認証はブラウザでのみ利用できます。'),
    );
  }
  if (googleApi()?.accounts?.oauth2) return Promise.resolve();
  if (authScriptPromise) return authScriptPromise;

  authScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_URL}"]`,
    );
    const script = existing ?? document.createElement('script');
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      clearTimeout(timeout);
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const onLoad = () => {
      if (!googleApi()?.accounts?.oauth2) {
        finish(authError('Google認証ライブラリを読み込めませんでした。'));
        return;
      }
      finish();
    };
    const onError = (event: Event) => {
      finish(authError('Google認証ライブラリに接続できませんでした。', event));
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    const timeout = setTimeout(
      () =>
        finish(
          authError('Google認証ライブラリの読み込みがタイムアウトしました。'),
        ),
      AUTH_SCRIPT_TIMEOUT_MS,
    );
    try {
      if (!existing) {
        script.src = GIS_URL;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    } catch (error) {
      finish(authError('Google認証ライブラリに接続できませんでした。', error));
    }
  }).catch((error: unknown) => {
    authScriptPromise = undefined;
    throw error;
  });
  return authScriptPromise;
}

async function loadUserProfile(
  accessToken: string,
): Promise<{ sub: string; email: string }> {
  let response: Response;
  try {
    response = await fetch(USERINFO_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'name' in error &&
      ((error as { name?: unknown }).name === 'TimeoutError' ||
        (error as { name?: unknown }).name === 'AbortError')
    ) {
      throw authError(
        'Googleアカウント情報の取得がタイムアウトしました。',
        error,
      );
    }
    throw authError(
      'Googleアカウント情報を取得できませんでした。ネットワークを確認してください。',
      error,
    );
  }
  if (response.status === 401) {
    throw authError(
      'Google認証の有効期限が切れました。もう一度接続してください。',
    );
  }
  if (response.status === 403) {
    throw authError(
      'Googleアカウント情報の読み取りが許可されていません。もう一度接続してください。',
    );
  }
  if (!response.ok) {
    throw authError(
      'Googleアカウント情報を取得できませんでした。時間をおいて再試行してください。',
    );
  }
  let profile: unknown;
  try {
    profile = await response.json();
  } catch (error) {
    throw authError('Googleアカウント情報の形式が不正です。', error);
  }
  if (!profile || typeof profile !== 'object') {
    throw authError('Googleアカウント情報の形式が不正です。');
  }
  const { sub, email } = profile as { sub?: unknown; email?: unknown };
  if (
    typeof sub !== 'string' ||
    sub.length === 0 ||
    typeof email !== 'string' ||
    email.length === 0
  ) {
    throw authError('Googleアカウントの識別情報を確認できませんでした。');
  }
  return { sub, email };
}

/**
 * Start this function directly from a user click after loadGoogleAuth has
 * completed. GIS opens its popup synchronously from requestAccessToken.
 */
export function requestGoogleSession(): Promise<GoogleSession> {
  const oauth = googleApi()?.accounts?.oauth2;
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(
      authError(
        'Google Drive同期が設定されていません。GoogleクライアントIDを設定してください。',
      ),
    );
  }
  if (!oauth) {
    return Promise.reject(
      authError(
        'Google認証の準備ができていません。ページを再読み込みしてください。',
      ),
    );
  }
  if (hasPendingAuth) {
    return Promise.reject(
      authError('Google認証を処理中です。しばらくお待ちください。'),
    );
  }

  hasPendingAuth = true;
  return new Promise<GoogleSession>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, session?: GoogleSession) => {
      if (settled) return;
      settled = true;
      hasPendingAuth = false;
      clearTimeout(timeout);
      if (error) reject(error);
      else if (session) {
        currentSession = session;
        resolve(session);
      } else reject(authError('Google認証を完了できませんでした。'));
    };
    const timeout = setTimeout(
      () =>
        finish(
          authError(
            'Google認証がタイムアウトしました。もう一度お試しください。',
          ),
        ),
      AUTH_TIMEOUT_MS,
    );

    const onTokenResponse = (response: GoogleTokenResponse) => {
      void (async () => {
        if (response.error) throw authErrorForPopup(response.error);
        if (
          typeof response.access_token !== 'string' ||
          response.access_token.length === 0 ||
          typeof response.expires_in !== 'number' ||
          !Number.isFinite(response.expires_in) ||
          response.expires_in <= 0
        ) {
          throw authError('Google認証の応答が不正です。');
        }
        let allGranted = false;
        try {
          allGranted = oauth.hasGrantedAllScopes(response, ...REQUESTED_SCOPES);
        } catch (error) {
          throw authError(
            'Google Drive同期の権限を確認できませんでした。',
            error,
          );
        }
        if (!allGranted) {
          throw authError(
            'Google Drive同期に必要な権限が許可されませんでした。',
          );
        }
        const profile = await loadUserProfile(response.access_token);
        finish(undefined, {
          accessToken: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1_000,
          sub: profile.sub,
          email: profile.email,
        });
      })().catch((error: unknown) => {
        finish(
          error instanceof Error
            ? error
            : authError(
                'Google認証に失敗しました。時間をおいて再試行してください。',
                error,
              ),
        );
      });
    };

    try {
      const client = oauth.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: REQUESTED_SCOPES.join(' '),
        include_granted_scopes: true,
        callback: onTokenResponse,
        error_callback: (error) => finish(authErrorForPopup(error?.type)),
      });
      // Keep this call synchronous with the user's click so the browser allows the popup.
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
      finish(authError('Google認証画面を開けませんでした。', error));
    }
  });
}

export function revokeGoogleSession(session: GoogleSession): void {
  if (currentSession?.accessToken === session.accessToken)
    currentSession = undefined;
  try {
    googleApi()?.accounts?.oauth2?.revoke?.(session.accessToken, () => {});
  } catch {
    // Revocation is best effort. The caller must clear its local account state.
  }
}

/** Forget the in-memory session without revoking the Google grant. */
export function forgetGoogleSession(): void {
  currentSession = undefined;
}
