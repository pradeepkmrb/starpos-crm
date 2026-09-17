"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type Channel, type PlatformPublicConfig, completeEmbeddedSignup } from "../../../lib/api";

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

const SDK_LOAD_TIMEOUT_MS = 15_000;
/** How long to wait for FB's own callback after the popup window disappears. */
const POPUP_CLOSE_GRACE_MS = 2_000;

function loadFacebookSdk(appId: string): Promise<void> {
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
function loginCapturingPopup(login: () => void): Window | null {
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

interface SignupData {
  wabaId?: string;
  phoneNumberId?: string;
}

/**
 * The finish event for a regular signup, and for connecting a number that
 * stays on the WhatsApp Business app (coexistence). The latter can omit
 * phone_number_id; the API looks it up from the WABA.
 */
const FINISH_EVENTS = ["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"];

/**
 * Meta's Embedded Signup: FB.login() returns an authorization `code`, while
 * the WABA/phone number the user picked in the popup arrives separately via
 * a postMessage event. Both are needed to complete the connection.
 *
 * `businessApp` runs Meta's coexistence flow instead: the business keeps
 * using the WhatsApp Business app on their phone with the same number.
 */
export function EmbeddedSignupButton({
  config,
  onConnected,
  businessApp = false,
}: {
  config: PlatformPublicConfig;
  onConnected: (channel: Channel) => void;
  businessApp?: boolean;
}) {
  const [loadingSdk, setLoadingSdk] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signupDataRef = useRef<SignupData>({});
  /** A CANCEL/ERROR reported by Meta itself — a better message than our generic one. */
  const signupErrorRef = useRef<string | null>(null);
  const callbackFiredRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const popupWatchRef = useRef<number | null>(null);
  const graceTimerRef = useRef<number | null>(null);

  const clearWatchers = useCallback(() => {
    if (popupWatchRef.current !== null) {
      window.clearInterval(popupWatchRef.current);
      popupWatchRef.current = null;
    }
    if (graceTimerRef.current !== null) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearWatchers, [clearWatchers]);

  useEffect(() => {
    if (!config.metaAppId) {
      setError("This platform has no Meta App ID configured — set it in Platform Admin settings.");
      return;
    }
    let cancelled = false;
    loadFacebookSdk(config.metaAppId)
      .then(() => {
        if (!cancelled) setLoadingSdk(false);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [config.metaAppId]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (FINISH_EVENTS.includes(data.event)) {
          signupDataRef.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
          };
        } else if (data.event === "CANCEL") {
          signupErrorRef.current = data.data?.current_step
            ? `Setup was cancelled at the "${data.data.current_step}" step.`
            : "Setup was cancelled before it finished.";
        } else if (data.event === "ERROR") {
          signupErrorRef.current = data.data?.error_message ?? "Meta reported an error during setup.";
        }
      } catch {
        // Not a JSON embedded-signup message — ignore.
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const finish = useCallback(
    (message: string | null) => {
      clearWatchers();
      popupRef.current = null;
      setError(message);
      setConnecting(false);
    },
    [clearWatchers],
  );

  /** The Meta window opens behind the main window on some setups — let the user surface it. */
  function focusPopup() {
    try {
      popupRef.current?.focus();
    } catch {
      // Cross-origin focus can be refused; nothing useful to do.
    }
  }

  function connect() {
    if (!window.FB) {
      setError("The Facebook SDK isn't ready yet — reload the page and try again.");
      return;
    }
    if (!config.embeddedSignupConfigId) {
      setError("No Embedded Signup configuration ID is set — add it in Platform Admin settings.");
      return;
    }
    setError(null);
    setConnecting(true);
    signupDataRef.current = {};
    signupErrorRef.current = null;
    callbackFiredRef.current = false;
    clearWatchers();

    async function handleLoginResponse(response: { authResponse?: { code?: string } }) {
      const code = response.authResponse?.code;
      if (!code) {
        finish(signupErrorRef.current ?? "WhatsApp connection was cancelled or did not complete.");
        return;
      }
      // The postMessage event usually arrives before this callback fires,
      // but isn't guaranteed to — give it a brief moment if it hasn't yet.
      for (let i = 0; i < 20 && !signupDataRef.current.wabaId; i++) {
        await new Promise((r) => setTimeout(r, 150));
      }
      const { wabaId, phoneNumberId } = signupDataRef.current;
      if (!wabaId || (!phoneNumberId && !businessApp)) {
        finish("Didn't receive the WhatsApp account details from Meta. Please try again.");
        return;
      }
      try {
        const channel = await completeEmbeddedSignup({
          code,
          wabaId,
          phoneNumberId,
          ...(businessApp ? { coexistence: true } : {}),
        });
        finish(null);
        onConnected(channel);
      } catch (err) {
        finish(err instanceof ApiError ? err.message : "Failed to complete WhatsApp connection");
      }
    }

    let popup: Window | null = null;
    try {
      popup = loginCapturingPopup(() =>
        window.FB!.login(
          // The SDK type-checks this argument and rejects an async function
          // outright ("Expression is of type asyncfunction, not function"),
          // throwing before it ever opens the popup — so hand it a plain
          // function that kicks the async work off.
          (response) => {
            callbackFiredRef.current = true;
            void handleLoginResponse(response);
          },
          {
            config_id: config.embeddedSignupConfigId,
            response_type: "code",
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: businessApp ? "whatsapp_business_app_onboarding" : "",
              sessionInfoVersion: "3",
            },
          },
        ),
      );
    } catch (err) {
      // FB throws plain objects, not Errors.
      const detail = (err as { message?: string })?.message;
      finish(detail ? `The Facebook SDK rejected the login call: ${detail}` : "The Facebook SDK rejected the login call.");
      return;
    }

    if (!popup) {
      finish("The Meta setup window was blocked. Allow pop-ups for this site, then try again.");
      return;
    }
    popupRef.current = popup;
    focusPopup();

    popupWatchRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(popupWatchRef.current!);
      popupWatchRef.current = null;
      // The popup also closes on success, moments before FB's callback fires.
      graceTimerRef.current = window.setTimeout(() => {
        if (!callbackFiredRef.current) {
          finish(signupErrorRef.current ?? "The Meta setup window was closed before the connection finished.");
        }
      }, POPUP_CLOSE_GRACE_MS);
    }, 500);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={connect} disabled={loadingSdk || connecting} className="btn-primary">
          {loadingSdk
            ? "Loading…"
            : connecting
              ? "Connecting…"
              : businessApp
                ? "Connect WhatsApp Business app"
                : "Connect WhatsApp"}
        </button>
        {connecting && (
          <>
            <button
              type="button"
              onClick={focusPopup}
              className="text-sm text-slate-600 underline hover:text-slate-900"
            >
              Show the Meta window
            </button>
            <button
              type="button"
              onClick={() => finish(null)}
              className="text-sm text-slate-500 underline hover:text-slate-700"
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {connecting && (
        <p className="mt-2 text-sm text-slate-500">
          Finish the setup in the Meta window — it may have opened behind this one.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
