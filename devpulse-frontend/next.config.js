/** @type {import('next').NextConfig} */
const TS_BACKEND_URL = process.env.NEXT_PUBLIC_TS_API_URL || "http://localhost:3000";
const PYTHON_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig = {
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
