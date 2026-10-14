/* Firebase Cloud Messaging service worker.
   Yeh file repo ke ROOT mein honi chahiye (assets/ ke andar nahi),
   taake https://www.intramedsolution.com/firebase-messaging-sw.js par mile. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBSTed6jriA6StmbhJ6zo9Bn-Z1Kp96dqY",
  authDomain: "imdf-a8fee.firebaseapp.com",
  projectId: "imdf-a8fee",
  storageBucket: "imdf-a8fee.firebasestorage.app",
  messagingSenderId: "480524572212",
  appId: "1:480524572212:web:143e45079001605a369c61"
});

const messaging = firebase.messaging();

// Site band ho ya background mein ho, tab yeh notification dikhata hai.
messaging.onBackgroundMessage((payload) => {
  const d = (payload && payload.data) || {};
  self.registration.showNotification(d.title || "New inquiry", {
    body: d.body || "",
    icon: "/assets/logo.png",
    badge: "/assets/favicon.png",
    data: { url: d.url || "/#admin" }
  });
});

// Notification par tap karne par dashboard khulta hai.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/#admin";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});
