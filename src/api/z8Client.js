import {
  GoogleAuthProvider,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { firebaseApp, firebaseAuth } from './firebase';

const API_BASE = String(import.meta.env.VITE_Z8_API_URL || 'http://localhost:3001/v1').replace(/\/+$/, '');

/** @typedef {{ status?: number, code?: string, details?: unknown }} Z8ApiErrorOptions */
/** @typedef {{ method?: string, body?: unknown, authenticated?: boolean, headers?: HeadersInit }} RequestOptions */

export class Z8ApiError extends Error {
  /** @param {string} message @param {Z8ApiErrorOptions} [options] */
  constructor(message, { status = 0, code = 'request_failed', details } = {}) {
    super(message);
    this.name = 'Z8ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** @param {string} path @param {RequestOptions} [options] @returns {Promise<any>} */
async function request(path, { method = 'GET', body, authenticated = true, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData)) requestHeaders.set('Content-Type', 'application/json');
  if (authenticated && firebaseAuth?.currentUser) {
    requestHeaders.set('Authorization', `Bearer ${await firebaseAuth.currentUser.getIdToken()}`);
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      credentials: 'omit',
    });
  } catch {
    throw new Z8ApiError('Cannot reach the Z8 service. Check that the backend is running and your device can reach it.', { code: 'service_unavailable' });
  }
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* handled below */ }
  if (!response.ok) {
    const error = data?.message ?? data?.error ?? 'The request could not be completed.';
    const message = Array.isArray(error) ? error.join(', ') : String(error);
    throw new Z8ApiError(message, { status: response.status, code: data?.code ?? 'request_failed', details: data?.details });
  }
  if (text && data === null) throw new Z8ApiError('The Z8 service returned an unexpected response.', { status: response.status, code: 'invalid_response' });
  return data;
}

/** @param {any} result @returns {Promise<any>} */
async function adoptSession(result) {
  if (!result?.firebaseCustomToken || !firebaseAuth) throw new Z8ApiError('Sign-in could not be completed.', { code: 'invalid_session' });
  await signInWithCustomToken(firebaseAuth, result.firebaseCustomToken);
  return request('/me');
}

const entityNames = [
  'AccountEntry', 'Card', 'Cardholder', 'CardholderApplication', 'CardRequest',
  'CardTransaction', 'Notification', 'ProgrammeSettings', 'User',
];

let browserMessaging;
let browserPushToken;
async function getBrowserMessaging() {
  if (!firebaseApp || !('serviceWorker' in navigator) || !await isSupported()) return null;
  if (!browserMessaging) browserMessaging = getMessaging(firebaseApp);
  return browserMessaging;
}

/** @param {{ requestPermission?: boolean }} [options] */
async function registerBrowserPush({ requestPermission = true } = {}) {
  if (!firebaseAuth?.currentUser || !('Notification' in window)) return { registered: false, reason: 'unsupported' };
  if (Notification.permission === 'default' && requestPermission) await Notification.requestPermission();
  if (Notification.permission !== 'granted') return { registered: false, reason: Notification.permission };
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) return { registered: false, reason: 'not_configured' };
  const messaging = await getBrowserMessaging();
  if (!messaging) return { registered: false, reason: 'unsupported' };
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  const workerUrl = new URL('/firebase-messaging-sw.js', window.location.origin);
  for (const [key, value] of Object.entries(config)) if (value) workerUrl.searchParams.set(key, value);
  const serviceWorkerRegistration = await navigator.serviceWorker.register(workerUrl, { updateViaCache: 'none' });
  browserPushToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!browserPushToken) return { registered: false, reason: 'token_unavailable' };
  await request('/me/devices', { method: 'POST', body: { token: browserPushToken, platform: 'web' } });
  return { registered: true };
}

async function removeBrowserPush() {
  if (!browserPushToken) return;
  const messaging = await getBrowserMessaging();
  if (!messaging) return;
  await request('/me/devices', { method: 'DELETE', body: { token: browserPushToken } }).catch(() => undefined);
  await deleteToken(messaging).catch(() => undefined);
  browserPushToken = undefined;
}

const entities = Object.fromEntries(entityNames.map((entity) => [entity, {
  filter: (filter = {}, options = {}) => request(`/entities/${entity}/query`, { method: 'POST', body: { filter, ...options } }),
  list: (options = {}) => request(`/entities/${entity}/query`, { method: 'POST', body: { filter: {}, ...options } }),
  count: (filter = {}) => request(`/entities/${entity}/count`, { method: 'POST', body: { filter } }),
  get: (id) => request(`/entities/${entity}/${encodeURIComponent(id)}`),
  create: (data) => request(`/entities/${entity}`, { method: 'POST', body: { data } }),
  update: (id, data) => request(`/entities/${entity}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { data } }),
  updateMany: (filter, update) => request(`/entities/${entity}/update-many`, { method: 'POST', body: { filter, update } }),
  delete: (id) => request(`/entities/${entity}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}]));

export const z8 = {
  auth: {
    me: () => request('/me'),
    register: async ({ email, password }) => request('/auth/password/register', { method: 'POST', authenticated: false, body: { email, password } }),
    verifyOtp: async ({ email, otpCode }) => adoptSession(await request('/auth/password/register/verify', { method: 'POST', authenticated: false, body: { email, code: otpCode } })),
    resendOtp: (input) => request('/auth/password/register/resend-verification', { method: 'POST', authenticated: false, body: { email: typeof input === 'string' ? input : input?.email } }),
    loginViaEmailPassword: async (email, password) => adoptSession(await request('/auth/password/login', { method: 'POST', authenticated: false, body: { email, password } })),
    resetPasswordRequest: (email) => request('/auth/password/reset/request', { method: 'POST', authenticated: false, body: { email } }),
    resetPassword: ({ resetToken, newPassword }) => {
      const params = new URLSearchParams(window.location.search);
      return request('/auth/password/reset/confirm', { method: 'POST', authenticated: false, body: { email: params.get('email'), token: resetToken, password: newPassword } });
    },
    loginWithProvider: async (provider) => {
      if (provider !== 'google' || !firebaseAuth) throw new Z8ApiError('Google sign-in is not configured.', { code: 'google_not_configured' });
      try {
        let credential;
        try {
          credential = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
        } catch (error) {
          if (error?.code !== 'auth/account-exists-with-different-credential') throw error;
          const googleCredential = GoogleAuthProvider.credentialFromError(error);
          if (!googleCredential?.idToken) throw error;
          const session = await request('/auth/google/session', {
            method: 'POST', authenticated: false, body: { idToken: googleCredential.idToken },
          });
          return adoptSession(session);
        }
        const idToken = await credential.user.getIdToken();
        const result = await request('/auth/google/firebase-session', { method: 'POST', authenticated: false, headers: { Authorization: `Bearer ${idToken}` } });
        return await adoptSession(result);
      } catch (error) {
        await signOut(firebaseAuth).catch(() => undefined);
        throw error;
      }
    },
    logout: async (destination) => {
      await removeBrowserPush();
      if (firebaseAuth) await signOut(firebaseAuth);
      if (destination) window.location.assign(destination);
    },
    redirectToLogin: () => window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`),
  },
  entities,
  functions: {
    // Keep the Base44-style response envelope used throughout the existing UI
    // while routing every call through the local API.
    invoke: async (name, data = {}) => ({
      data: await request(`/functions/${encodeURIComponent(name)}`, { method: 'POST', body: data }),
    }),
  },
  agents: {
    /** @param {{ q?: { agent_name?: string }, limit?: number }} [options] */
    listConversations: ({ q = {}, limit = 20 } = {}) => request(`/agents/conversations?agent_name=${encodeURIComponent(q.agent_name || '')}&limit=${limit}`),
    getConversation: (id) => request(`/agents/conversations/${encodeURIComponent(id)}`),
    createConversation: (data) => request('/agents/conversations', { method: 'POST', body: data }),
    addMessage: (conversation, message) => request(`/agents/conversations/${encodeURIComponent(conversation.id)}/messages`, { method: 'POST', body: message }),
    subscribeToConversation: (id, callback) => {
      let active = true;
      const poll = async () => {
        if (!active) return;
        try { callback(await request(`/agents/conversations/${encodeURIComponent(id)}`)); } catch { /* transient poll errors are retried */ }
      };
      const timer = window.setInterval(poll, 2000);
      return () => { active = false; window.clearInterval(timer); };
    },
  },
  notifications: {
    enableWebPush: () => registerBrowserPush(),
    registerIfAllowed: () => registerBrowserPush({ requestPermission: false }),
    onForeground: async (callback) => {
      const messaging = await getBrowserMessaging();
      if (!messaging) return () => undefined;
      return onMessage(messaging, (payload) => {
        window.dispatchEvent(new CustomEvent('z8:notification'));
        callback(payload);
      });
    },
  },
  app: { getPublicSettings: async () => ({ id: 'z8-card-flow', public_settings: {} }) },
};

export { API_BASE, request };

