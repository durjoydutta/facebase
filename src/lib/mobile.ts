import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const getPlatform = (): string => {
  return Capacitor.getPlatform();
};
