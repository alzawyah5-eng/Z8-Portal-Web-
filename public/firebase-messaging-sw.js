/* Firebase web-push worker. Public Firebase app identifiers arrive in the
 * worker registration URL; no server credentials belong in this file. */
importScripts('https://www.gstatic.com/firebasejs/12.5.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging-compat.js');

const config = Object.fromEntries(new URL(self.location.href).searchParams.entries());
if (config.apiKey && config.projectId && config.appId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'Z8 Card Manager';
    const link = payload.fcmOptions?.link || payload.data?.link || '/';
    self.registration.showNotification(title, {
      body: payload.notification?.body || '',
      icon: payload.notification?.icon || '/favicon.ico',
      data: { link },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requested = new URL(event.notification.data?.link || '/', self.location.origin);
  const target = requested.origin === self.location.origin ? requested.href : self.location.origin;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(target).then(() => existing.focus());
    return self.clients.openWindow(target);
  }));
});
