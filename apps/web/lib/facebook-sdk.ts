"use client";

/**
 * Loading the Facebook JS SDK and opening its login popup — shared by
 * WhatsApp Embedded Signup and "Connect with Meta" for lead ads.
 */

export interface FacebookLoginResponse {
  status?: string;
  authResponse?: { code?: string; accessToken?: string } | null;
}

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

const SDK_LOAD_TIMEOUT_MS = 15_000;
/** How long to wait for FB's own callback after the popup window disappears. */
export const POPUP_CLOSE_GRACE_MS = 2_000;

export function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      // Let a later attempt retry from scratch instead of reusing a dead promise.
      sdkLoadPromise = null;
      reject(new Error(message));
    };
    const timer = window.setTimeout(
      () => fail("The Facebook SDK loaded but never initialised."),
      SDK_LOAD_TIMEOUT_MS,
    );

    window.fbAsyncInit = () => {
      window.clearTimeout(timer);
      window.FB!.init({ appId, version: "v21.0", cookie: true, xfbml: false });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      fail(
        "The Facebook SDK could not be loaded — an ad blocker or network policy may be blocking connect.facebook.net.",
      );
    };
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

/**
 * FB.login() opens its popup synchronously (it has to, to keep the click
 * gesture), so temporarily wrapping window.open lets us hold on to the popup
 * handle. Without it we cannot tell "blocked by the popup blocker" or "user
 * closed the window" apart from "still filling in the Meta form", and the
 * button sits on "Connecting…" forever.
 */
export function loginCapturingPopup(login: () => void): Window | null {
  const nativeOpen = window.open;
  let popup: Window | null = null;
  window.open = function (...args: Parameters<typeof window.open>) {
    popup = nativeOpen.apply(window, args);
    return popup;
  } as typeof window.open;
  try {
    login();
  } finally {
    window.open = nativeOpen;
  }
  return popup;
}
