import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.facebase.app',
  appName: 'facebase',
  webDir: 'public',
  server: {
    // Android Emulator: 10.0.2.2, Genymotion: 10.0.3.2, Real Device: 192.168.x.x
    url: 'https://facebase.vercel.app', 
    cleartext: true
  }
};

export default config;
