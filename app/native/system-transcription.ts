import { Utils } from "@nativescript/core";
declare const com: any;
/** Factory availability only; a real synthetic external-PCM trial was performed on the user's Pixel. */
export function isSystemTranscriptionReady(): boolean {
  if (!global.isAndroid) return false;
  try { return Boolean(com.faceclaw.app.FaceclawSystemTranscriber.isAvailable(Utils.android.getApplicationContext())); }
  catch { return false; }
}
