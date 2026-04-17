"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const COOKIE_KEY = "devpulse.cookieConsent.v1";

/**
 * Non-blocking cookie-consent banner. Because DevPulse only sets first-party
 * strictly-necessary cookies (session + CSRF), this is an informational notice
 * rather than a consent gate, per ePrivacy art. 5(3) exemption. If you later
 * add analytics or marketing cookies, wire them behind this acceptance.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(COOKIE_KEY);
      if (!stored) setVisible(true);
    } catch {
      // Private-mode browsers — just don't show the banner.
    }
  }, []);

  const accept = () => {
    try {
      window.localStorage.setItem(
        COOKIE_KEY,
        JSON.stringify({ accepted: true, at: new Date().toISOString() })
      );
    } catch {
      // no-op
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-sm text-slate-200 shadow-2xl backdrop-blur"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-relaxed">
          DevPulse uses strictly necessary first-party cookies for
          authentication and security. No tracking, no advertising. See our{" "}
          <Link
            href="/privacy"
            className="text-blue-400 underline hover:text-blue-300"
          >
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/privacy"
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Learn more
          </Link>
          <button
            type="button"
            onClick={accept}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
