import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNative } from '@/lib/mobile';
// import { toast } from 'sonner';

export const usePushNotifications = () => {
  useEffect(() => {
    if (!isNative()) return;

    const register = async () => {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('Push notifications permission not granted');
        return;
      }

      await PushNotifications.register();
    };

    register();

    // Listeners
    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration success, token: ' + token.value);
      // TODO: Send token to backend
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error: ' + JSON.stringify(error));
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received: ' + JSON.stringify(notification));
      // Show local toast or alert
      // toast(notification.title || 'New Notification', { description: notification.body });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push action performed: ' + JSON.stringify(notification));
      // Navigate to specific page if needed
    });

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);
};
