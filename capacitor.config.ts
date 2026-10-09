import { CapacitorConfig } from '@capacitor/cli';

// Production builds ship the bundled app (webDir). To develop against a live-reload
// server on your network, run:  CAP_SERVER_URL=http://192.168.1.20:8080 npx cap run android
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'app.lovable.67d2790da9aa4f0abe8a1f5b4bc4058b',
  appName: 'qatar-ticketing-hub',
  webDir: 'dist',
  ...(devServerUrl
    ? { server: { url: devServerUrl, cleartext: devServerUrl.startsWith('http://') } }
    : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 0
    }
  }
};

export default config;
