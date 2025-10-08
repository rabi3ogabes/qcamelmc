import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.67d2790da9aa4f0abe8a1f5b4bc4058b',
  appName: 'qatar-ticketing-hub',
  webDir: 'dist',
  server: {
    url: 'https://67d2790d-a9aa-4f0a-be8a-1f5b4bc4058b.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0
    }
  }
};

export default config;
