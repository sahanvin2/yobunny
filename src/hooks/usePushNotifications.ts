import { useEffect, useState } from 'react';
import { fetchNotifications } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

export function usePushNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if (!('Notification' in window)) return;
        setPermission(Notification.permission);
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(setPermission);
        }
    }, []);

    useEffect(() => {
        if (permission !== 'granted' || !isAuthenticated()) return;

        const notifiedSet = new Set<string>();
        let isFirstRun = true;

        const checkNotifications = async () => {
            try {
                const data = await fetchNotifications();
                const unread = data.items.filter(n => !n.isRead);
                
                if (isFirstRun) {
                    unread.forEach((n: any) => notifiedSet.add(n.id));
                    isFirstRun = false;
                    return;
                }

                for (const n of unread) {
                    if (!notifiedSet.has(n.id)) {
                        notifiedSet.add(n.id);
                        new Notification('YoBunny', {
                            body: n.message,
                            icon: '/logo.png',
                            silent: false
                        });
                    }
                }
            } catch (err) {
                // Silence polling errors
            }
        };

        checkNotifications();
        // Check for new notifications every 15 seconds
        const interval = setInterval(checkNotifications, 15000);

        return () => clearInterval(interval);
    }, [permission]);

    return { permission };
}
