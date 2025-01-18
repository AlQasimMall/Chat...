// تحديث إصدار الكاش
const CACHE_VERSION = 'v2';
const CACHE_NAME = `chat-app-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `chat-dynamic-${CACHE_VERSION}`;

// القائمة الأساسية للملفات المطلوب تخزينها
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sounds/ringback.wav',
  '/sounds/ringtone.wav',
  '/sounds/call-end.wav',
  'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.2/css/bootstrap.rtl.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css'
];

// إدارة الحياة في الخلفية
let wakeLock = null;
let isCallActive = false;
let pushSubscription = null;

// وظيفة للحفاظ على نشاط التطبيق
async function keepAlive() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock activated');
        }
    } catch (err) {
        console.error('Wake Lock error:', err);
    }
}

// تثبيت Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then((cache) => {
                console.log('Caching app shell');
                return cache.addAll(urlsToCache);
            }),
            self.skipWaiting() // تفعيل مباشر للإصدار الجديد
        ])
    );
});

// تنشيط Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // تنظيف الكاش القديم
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            return cacheName.startsWith('chat-') && 
                                   cacheName !== CACHE_NAME &&
                                   cacheName !== DYNAMIC_CACHE;
                        })
                        .map((cacheName) => caches.delete(cacheName))
                );
            }),
            // تحديث اشتراك الإشعارات
            self.registration.pushManager.getSubscription()
                .then((subscription) => {
                    pushSubscription = subscription;
                }),
            // تفعيل مباشر
            self.clients.claim()
        ])
    );
});

// معالجة الطلبات وتخزينها
self.addEventListener('fetch', (event) => {
    // معالجة خاصة لملفات الصوت
    if (event.request.url.includes('/sounds/')) {
        event.respondWith(handleSoundFiles(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then((networkResponse) => {
                        // تخزين الاستجابات الناجحة في الكاش
                        if (networkResponse.ok) {
                            const responseToCache = networkResponse.clone();
                            caches.open(DYNAMIC_CACHE)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // عرض صفحة عدم الاتصال للطلبات HTML
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/offline.html');
                        }
                    });
            })
    );
});

// معالجة ملفات الصوت
async function handleSoundFiles(request) {
    const response = await caches.match(request);
    if (response) {
        return response;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

// معالجة الإشعارات
self.addEventListener('push', async (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        let notificationOptions = {
            icon: 'https://firebasestorage.googleapis.com/v0/b/messageemeapp.appspot.com/o/profiles%2F%D8%AE%D9%84%D9%81%D9%8A%D8%A7%D8%AA%20%D8%A7%D9%8A%D9%81%D9%88%D9%86%2014%20%D8%A8%D8%B1%D9%88%20%D9%85%D8%A7%D9%83%D8%B3%20%D8%A7%D8%B5%D9%84%D9%8A%D8%A9%20%D9%81%D8%AE%D9%85%D9%87%20%D8%A8%D8%AF%D9%82%D8%A9%20HD_1.jpg?alt=media&token=fa611f61-008d-4976-a6cf-f32833ae297c',
            badge: 'https://firebasestorage.googleapis.com/v0/b/messageemeapp.appspot.com/o/profiles%2F%D8%AE%D9%84%D9%81%D9%8A%D8%A7%D8%AA%20%D8%A7%D9%8A%D9%81%D9%88%D9%86%2014%20%D8%A8%D8%B1%D9%88%20%D9%85%D8%A7%D9%83%D8%B3%20%D8%A7%D8%B5%D9%84%D9%8A%D8%A9%20%D9%81%D8%AE%D9%85%D9%87%20%D8%A8%D8%AF%D9%82%D8%A9%20HD_1.jpg?alt=media&token=fa611f61-008d-4976-a6cf-f32833ae297c',
            vibrate: [100, 50, 100],
            data: { url: '/', type: data.type }
        };

        // تخصيص الإشعارات حسب النوع
        switch (data.type) {
            case 'incoming_call':
                notificationOptions = {
                    ...notificationOptions,
                    tag: 'call-' + data.callId,
                    body: 'مكالمة واردة من ' + data.caller,
                    requireInteraction: true,
                    actions: [
                        { action: 'answer', title: 'رد' },
                        { action: 'reject', title: 'رفض' }
                    ],
                    renotify: true
                };
                break;

            case 'missed_call':
                notificationOptions = {
                    ...notificationOptions,
                    tag: 'missed-' + data.callId,
                    body: 'مكالمة فائتة من ' + data.caller,
                    timestamp: data.timestamp
                };
                break;

            case 'new_message':
                notificationOptions = {
                    ...notificationOptions,
                    tag: 'msg-' + data.senderId,
                    body: data.message,
                    renotify: true
                };
                break;
        }

        await self.registration.showNotification(data.title, notificationOptions);
    } catch (error) {
        console.error('Error handling push notification:', error);
    }
});

// معالجة رسائل التطبيق
self.addEventListener('message', async (event) => {
    if (event.data.type === 'CALL_STATUS') {
        isCallActive = event.data.isActive;
        
        if (isCallActive) {
            await keepAlive();
            await showCallNotification(event.data);
        } else {
            if (wakeLock) {
                await wakeLock.release();
                wakeLock = null;
            }
            await removeCallNotification();
        }
    }
});

// عرض إشعار المكالمة النشطة
async function showCallNotification(data) {
    const notificationOptions = {
        tag: 'ongoing-call',
        body: 'مكالمة جارية',
        icon: data.callerAvatar || 'https://firebasestorage.googleapis.com/v0/b/messageemeapp.appspot.com/o/profiles%2F%D8%AE%D9%84%D9%81%D9%8A%D8%A7%D8%AA%20%D8%A7%D9%8A%D9%81%D9%88%D9%86%2014%20%D8%A8%D8%B1%D9%88%20%D9%85%D8%A7%D9%83%D8%B3%20%D8%A7%D8%B5%D9%84%D9%8A%D8%A9%20%D9%81%D8%AE%D9%85%D9%87%20%D8%A8%D8%AF%D9%82%D8%A9%20HD_1.jpg?alt=media&token=fa611f61-008d-4976-a6cf-f32833ae297c',
        badge: 'https://firebasestorage.googleapis.com/v0/b/messageemeapp.appspot.com/o/profiles%2F%D8%AE%D9%84%D9%81%D9%8A%D8%A7%D8%AA%20%D8%A7%D9%8A%D9%81%D9%88%D9%86%2014%20%D8%A8%D8%B1%D9%88%20%D9%85%D8%A7%D9%83%D8%B3%20%D8%A7%D8%B5%D9%84%D9%8A%D8%A9%20%D9%81%D8%AE%D9%85%D9%87%20%D8%A8%D8%AF%D9%82%D8%A9%20HD_1.jpg?alt=media&token=fa611f61-008d-4976-a6cf-f32833ae297c',
        requireInteraction: true,
        actions: [{ action: 'endCall', title: 'إنهاء المكالمة' }],
        silent: true
    };
    
    await self.registration.showNotification('مكالمة نشطة', notificationOptions);
}

// إزالة إشعار المكالمة
async function removeCallNotification() {
    const notifications = await self.registration.getNotifications({
        tag: 'ongoing-call'
    });
    notifications.forEach(notification => notification.close());
}

// معالجة النقر على الإشعارات
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'endCall') {
        // إرسال رسالة لإنهاء المكالمة
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({ type: 'END_CALL' });
            });
        });
    } else if (event.action === 'answer' || event.action === 'reject') {
        // معالجة الرد على المكالمة
        handleCallAction(event.action, event.notification.data);
    } else {
        // فتح التطبيق
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(clientList => {
                    if (clientList.length > 0) {
                        return clientList[0].focus();
                    }
                    return self.clients.openWindow('/');
                })
        );
    }
});

// معالجة إجراءات المكالمة
async function handleCallAction(action, data) {
    const message = {
        type: action === 'answer' ? 'ANSWER_CALL' : 'REJECT_CALL',
        callData: data
    };

    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage(message));
}

// مزامنة البيانات في الخلفية
self.addEventListener('sync', (event) => {
    if (event.tag === 'send-messages') {
        event.waitUntil(syncMessages());
    } else if (event.tag === 'sync-calls') {
        event.waitUntil(syncCalls());
    }
});

// مزامنة الرسائل غير المرسلة
async function syncMessages() {
    // تنفيذ منطق مزامنة الرسائل
    console.log('Syncing pending messages');
}

// مزامنة سجلات المكالمات
async function syncCalls() {
    // تنفيذ منطق مزامنة المكالمات
    console.log('Syncing call logs');
}