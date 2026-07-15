/// <reference types="expo/types" />

// Minimal typing for Expo public env vars (injected by babel at build time).
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
