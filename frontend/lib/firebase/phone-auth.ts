/**
 * Firebase phone auth using the COMPAT SDK (firebase/compat/auth).
 *
 * The modular SDK (firebase/auth) does a stricter client-side hostname check
 * that fails on custom domains with the "Hostname match not found" error.
 * The compat SDK handles it the same way as the CDN-loaded Firebase used in
 * UrbanRide, which works correctly on custom domains.
 */
import firebaseCompat from "firebase/compat/app";
import "firebase/compat/auth";
type ConfirmationResult = firebaseCompat.auth.ConfirmationResult;
type RecaptchaVerifier   = firebaseCompat.auth.RecaptchaVerifier;

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? "AIzaSyDFk4c3oXeXUaVSdg-Z7uAU6oYU7tPYh4o",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "jobsync-497608.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? "jobsync-497608",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "jobsync-497608.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "329097420297",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? "1:329097420297:web:8f3805cb02460eeace62d8",
};

const APP_NAME = "jobsynk-phone";

function getCompatApp(): firebaseCompat.app.App {
  try {
    return firebaseCompat.app(APP_NAME);
  } catch {
    return firebaseCompat.initializeApp(firebaseConfig, APP_NAME);
  }
}

export function getCompatAuth(): firebaseCompat.auth.Auth {
  return getCompatApp().auth();
}

export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  // Mirror exactly what works in UrbanRide
  return new firebaseCompat.auth.RecaptchaVerifier(containerId, { size: "invisible" });
}

export async function sendPhoneOtp(
  phone: string,
  verifier: RecaptchaVerifier,
): Promise<ConfirmationResult> {
  const auth = getCompatAuth();
  return auth.signInWithPhoneNumber(phone, verifier);
}

export type { ConfirmationResult, RecaptchaVerifier };
