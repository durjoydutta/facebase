"use client";

import { usePushNotifications } from "@/hooks/use-push-notifications";

export const MobileInitializer = () => {
  usePushNotifications();
  return null;
};
