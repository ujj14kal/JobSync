import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// All NEXT_PUBLIC_ Firebase values are intentionally public — they are baked
// into the client JS bundle and visible to every visitor. Security comes from
// Firebase Auth rules, not from keeping these values secret.
// Fallbacks let the build succeed even when env vars are not set in CI;
// set the real values in Vercel Project Settings → Environment Variables.
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? "AIzaSyDFk4c3oXeXUaVSdg-Z7uAU6oYU7tPYh4o",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "jobsync-497608.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? "jobsync-497608",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "jobsync-497608.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "329097420297",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? "1:329097420297:web:8f3805cb02460eeace62d8",
};

// Lazy singleton — only initialised in the browser.
// initializeApp() throws during SSR/prerender because the DOM APIs it relies
// on are unavailable; guard with typeof window to prevent build failures.
let _app: FirebaseApp;
let _auth: Auth;

function init() {
  if (typeof window === "undefined") return;
  if (_auth) return;
  _app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  _auth = getAuth(_app);
}

// Proxy so existing `import { auth } from "@/lib/firebase/client"` still works.
// The actual Auth object is resolved on first property access in the browser.
export const auth = new Proxy({} as Auth, {
  get(_t, prop) {
    init();
    return (_auth as never)?.[prop as never];
  },
});
