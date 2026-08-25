"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, type Channel, type PlatformPublicConfig, completeEmbeddedSignup } from "../../../lib/api";

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; version: string; xfbml?: boolean }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: "v21.0", xfbml: false });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

interface SignupData {
  wabaId?: string;
  phoneNumberId?: string;
}

/**
 * Meta's Embedded Signup: FB.login() returns an authorization `code`, while
 * the WABA/phone number the user picked in the popup arrives separately via
 * a postMessage event. Both are needed to complete the connection.
 */
export function EmbeddedSignupButton({
  config,
  onConnected,
}: {
  config: PlatformPublicConfig;
  onConnected: (channel: Channel) => void;
}) {
  const [loadingSdk, setLoadingSdk] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signupDataRef = useRef<SignupData>({});

  useEffect(() => {
    if (!config.metaAppId) return;
    loadFacebookSdk(config.metaAppId).then(() => setLoadingSdk(false));
  }, [config.metaAppId]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.event === "FINISH") {
          signupDataRef.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
          };
        }
      } catch {
        // Not a JSON embedded-signup message — ignore.
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function connect() {
    if (!window.FB || !config.embeddedSignupConfigId) return;
    setError(null);
    setConnecting(true);
    signupDataRef.current = {};

    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setError("WhatsApp connection was cancelled or did not complete.");
          setConnecting(false);
          return;
        }
        // The postMessage event usually arrives before this callback fires,
        // but isn't guaranteed to — give it a brief moment if it hasn't yet.
        for (let i = 0; i < 20 && !signupDataRef.current.wabaId; i++) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const { wabaId, phoneNumberId } = signupDataRef.current;
        if (!wabaId || !phoneNumberId) {
          setError("Didn't receive the WhatsApp account details from Meta. Please try again.");
          setConnecting(false);
          return;
        }
        try {
          const channel = await completeEmbeddedSignup({ code, wabaId, phoneNumberId });
          onConnected(channel);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Failed to complete WhatsApp connection");
        } finally {
          setConnecting(false);
        }
      },
      {
        config_id: config.embeddedSignupConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      },
    );
  }

  return (
    <div>
      <button type="button" onClick={connect} disabled={loadingSdk || connecting} className="btn-primary">
        {loadingSdk ? "Loading…" : connecting ? "Connecting…" : "Connect WhatsApp"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
