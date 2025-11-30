import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from '@/lib/mobile';

export const useHaptics = () => {
  const triggerImpact = async (style: ImpactStyle = ImpactStyle.Light) => {
    if (isNative()) {
      await Haptics.impact({ style });
    } else {
      // Web fallback (if supported)
      if (navigator.vibrate) {
        navigator.vibrate(style === ImpactStyle.Heavy ? 50 : 20);
      }
    }
  };

  const triggerNotification = async (type: NotificationType) => {
    if (isNative()) {
      await Haptics.notification({ type });
    } else {
      // Web fallback
      if (navigator.vibrate) {
        switch (type) {
          case NotificationType.Success:
            navigator.vibrate([50, 50, 50]);
            break;
          case NotificationType.Warning:
            navigator.vibrate([100, 50, 100]);
            break;
          case NotificationType.Error:
            navigator.vibrate([200, 100, 200]);
            break;
        }
      }
    }
  };

  const vibrate = async (duration: number = 300) => {
    if (isNative()) {
      await Haptics.vibrate({ duration });
    } else {
      if (navigator.vibrate) {
        navigator.vibrate(duration);
      }
    }
  };

  return {
    triggerImpact,
    triggerNotification,
    vibrate,
  };
};
