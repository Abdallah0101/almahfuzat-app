import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.mahfuzat.app',
  appName: 'المحفوظات',
  webDir: 'dist/almahfuzat-app/browser',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f7f3ea'
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false
    }
  }
};

export default config;
