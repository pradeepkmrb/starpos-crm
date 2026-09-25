"use client";

import { useEffect, useRef, useState } from "react";
import type { PlatformPublicConfig } from "../../../../lib/api";
import {
  type FacebookLoginResponse,
  POPUP_CLOSE_GRACE_MS,
  loadFacebookSdk,
  loginCapturingPopup,
} from "../../../../lib/facebook-sdk";

/**
 * What lead ads need: the Pages list and Page tokens, leadgen webhook
 * subscription (pages_manage_metadata), and the leads themselves.
 * business_management lets Pages owned through a Business portfolio show up.
 */
const LEAD_ADS_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_ads",
  "leads_retrieval",
  "business_management",
].join(",");

/**
 * Opens Facebook's login and hands back what the API needs to finish the
 * connection. With a Facebook Login for Business config the SDK returns a
 * code; without one it asks for the scopes directly and returns a user token.
 */
export function ConnectMetaButton({
  config,
  label = "Continue with Facebook",
  className = "btn-primary",
  disabled,
  onLogin,
}: {
  config: PlatformPublicConfig | null;
  label?: string;
  className?: string;
  disabled?: boolean;
  onLogin: (credentials: { code?: string; accessToken?: string }) => Promise<void>;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearInterval(id)), []);

  useEffect(() => {
    if (!config) return;
    if (!config.metaAppId) {
      setError("This platform has no Meta App configured yet — ask your agency to set it up.");
      return;
    }
    let cancelled = false;
    loadFacebookSdk(config.metaAppId)
      .then(() => !cancelled && setSdkReady(true))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [config]);

  function stopWatching() {
    timers.current.forEach((id) => window.clearInterval(id));
    timers.current = [];
  }

  function connect() {
    if (!window.FB || !config) return;
    setError(null);
    setWaiting(true);
    let answered = false;

    const onResponse = (response: FacebookLoginResponse) => {
      answered = true;
      stopWatching();
      const code = response.authResponse?.code;
      const accessToken = response.authResponse?.accessToken;
      if (!code && !accessToken) {
        setWaiting(false);
        setError("Facebook login was cancelled before it finished.");
        return;
      }
      onLogin(code ? { code } : { accessToken })
        .catch((err: Error) => setError(err.message))
        .finally(() => setWaiting(false));
    };

    const options: Record<string, unknown> = config.leadAdsConfigId
      ? { config_id: config.leadAdsConfigId, response_type: "code", override_default_response_type: true }
      : { scope: LEAD_ADS_SCOPES, return_scopes: true, auth_type: "rerequest" };

    let popup: Window | null = null;
    try {
      // A plain function: the SDK refuses async callbacks outright.
      popup = loginCapturingPopup(() => window.FB!.login((response) => onResponse(response), options));
    } catch (err) {
      setWaiting(false);
      setError((err as { message?: string })?.message ?? "The Facebook SDK rejected the login call.");
      return;
    }
    if (!popup) {
      setWaiting(false);
      setError("The Facebook window was blocked. Allow pop-ups for this site, then try again.");
      return;
    }

    const watch = window.setInterval(() => {
      if (!popup!.closed) return;
      stopWatching();
      // The popup also closes on success, a moment before the SDK calls back.
      window.setTimeout(() => {
        if (!answered) {
          setWaiting(false);
          setError("The Facebook window was closed before the login finished.");
        }
      }, POPUP_CLOSE_GRACE_MS);
    }, 500);
    timers.current.push(watch);
  }

  return (
    <div>
      <button
        type="button"
        className={`${className} inline-flex items-center gap-2`}
        disabled={disabled || !sdkReady || waiting}
        onClick={connect}
      >
        <FacebookGlyph className="h-4 w-4" />
        {waiting ? "Waiting for Facebook…" : !sdkReady && !error ? "Loading…" : label}
      </button>
      {waiting && (
        <p className="mt-2 text-xs text-slate-500">
          Finish in the Facebook window — pick every Page whose lead forms should arrive here.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function FacebookGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}
