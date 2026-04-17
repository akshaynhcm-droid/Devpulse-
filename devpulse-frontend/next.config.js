/** @type {import('next').NextConfig} */
const TS_BACKEND_URL =
  process.env.NEXT_PUBLIC_TS_API_URL || "http://localhost:3000";
const PYTHON_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig = {
  // Don't advertise Next.js in response headers. Attackers can still
  // fingerprint us via HTML quirks, but no reason to make it trivial.
  poweredByHeader: false,
  // Never emit browser source maps for production. Makes the deployed
  // JS significantly harder to reverse-engineer into original TS.
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  compiler: {
    // SWC drops `console.*` calls (except console.error) from production
    // bundles. Smaller output + zero debug noise leaked to end users.
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  // Extra hardening headers for every HTML / static asset response.
  // (API requests proxy through to the TS backend where helmet already
  // adds the full suite of headers.)
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // TS backend: OAuth and tRPC
      {
        source: "/api/oauth/:path*",
        destination: `${TS_BACKEND_URL}/api/oauth/:path*`,
      },
      {
        source: "/api/trpc/:path*",
        destination: `${TS_BACKEND_URL}/api/trpc/:path*`,
      },
      // Python backend: auth, agent, security, analytics, admin, payments, webhooks
      {
        source: "/api/:path*",
        destination: `${PYTHON_API_URL}/api/:path*`,
      },
      // Python backend: webhooks (not under /api)
      {
        source: "/webhooks/:path*",
        destination: `${PYTHON_API_URL}/webhooks/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
