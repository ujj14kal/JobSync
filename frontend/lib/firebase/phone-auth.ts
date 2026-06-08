/**
 * Firebase phone auth using the MODULAR v9 SDK.
 *
 * Uses the same default FirebaseApp already initialized in client.ts so there
 * is exactly one app instance. Firebase v9 does NOT do a client-side hostname
 * check (that strict check was added in v10+). Domain validation happens
 * server-side via Identity Toolkit against Firebase's Authorized Domains list.
 */
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { getFirebaseApp } from "./client";

export type { RecaptchaVerifier };
export type ConfirmationResult = Awaited<ReturnType<typeof signInWithPhoneNumber>>;

export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  const auth = getAuth(getFirebaseApp());
  // v9 constructor: (container, params, auth) — auth is the THIRD arg
  return new RecaptchaVerifier(containerId, { size: "invisible" }, auth);
}

export async function sendPhoneOtp(
  phone: string,
  verifier: RecaptchaVerifier,
): Promise<ConfirmationResult> {
  const auth = getAuth(getFirebaseApp());
  return signInWithPhoneNumber(auth, phone, verifier);
}
