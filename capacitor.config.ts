import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sagarkolte.nyccommute',
  appName: 'Commute',
  webDir: 'out',
  // server: {
  //   url: 'http://192.168.1.146:3000',
  //   cleartext: true
  // },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: "#000000",
      showSpinner: false,
    },
  },
};

export default config;
