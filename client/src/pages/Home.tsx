import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import {
  Shield,
  Zap,
  BarChart3,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

// Google "G" SVG icon — official branding colors
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function handleGoogleLogin() {
  window.location.href = "/api/oauth/google";
}

export default function Home() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user && !loading) {
      if ((user as any).onboardingCompleted) {
        navigate("/dashboard");
      } else {
        navigate("/onboarding");
      }
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 rounded-lg bg-accent mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Navigation */}
      <nav className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Shield className="w-5 h-5 text-accent-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">DevPulse</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              id="nav-google-signin"
              onClick={handleGoogleLogin}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 hover:shadow-sm transition-all dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <GoogleIcon className="w-4 h-4" />
              Sign in with Google
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.href = getLoginUrl())}
            >
              Manus Login
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-8">
        <div className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Powered by MiniMax M2.7
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground">
            API Security &amp; LLM Cost Intelligence
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Unified platform for managing API vulnerabilities, compliance, and
            autonomous agent spending
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              id="hero-google-signin"
              onClick={handleGoogleLogin}
              className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-800 text-base font-semibold hover:shadow-md hover:border-gray-300 transition-all dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <GoogleIcon className="w-5 h-5" />
              Continue with Google
            </button>
            <Button
              size="lg"
              onClick={() => (window.location.href = getLoginUrl())}
              className="text-base font-semibold"
            >
              Get Started
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            No credit card required · Free to start
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
          {[
            {
              icon: Shield,
              title: "Security Scanning",
              description: "OWASP vulnerability detection and analysis",
            },
            {
              icon: Zap,
              title: "Kill Switch",
              description: "Budget limits and emergency LLM controls",
            },
            {
              icon: BarChart3,
              title: "Token Analytics",
              description: "Track AI model usage and costs",
            },
            {
              icon: Users,
              title: "Team Collaboration",
              description: "Role-based access and team management",
            },
          ].map(feature => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-lg border border-border/50 bg-card p-6 space-y-3 hover:shadow-md transition-all"
              >
                <Icon className="w-8 h-8 text-accent" />
                <h3 className="font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-card border-t border-border/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold text-foreground">
              Complete API Security Platform
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to secure and manage your APIs
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {[
              {
                title: "API Collection Management",
                items: [
                  "Import Postman and OpenAPI collections",
                  "Organize and manage multiple collections",
                  "Track API endpoints and versions",
                ],
              },
              {
                title: "Security Intelligence",
                items: [
                  "OWASP Top 10 vulnerability scanning",
                  "Shadow API detection",
                  "Risk scoring and severity levels",
                ],
              },
              {
                title: "Compliance & Reporting",
                items: [
                  "PCI DSS compliance reports",
                  "Automated compliance tracking",
                  "Detailed requirement breakdowns",
                ],
              },
              {
                title: "LLM Cost Management",
                items: [
                  "Token analytics with MiniMax M2.7",
                  "Cost breakdown by model",
                  "Budget limits and kill switch",
                ],
              },
            ].map(section => (
              <div key={section.title} className="space-y-4">
                <h3 className="text-xl font-semibold text-foreground">
                  {section.title}
                </h3>
                <ul className="space-y-3">
                  {section.items.map(item => (
                    <li
                      key={item}
                      className="flex items-center gap-3 text-muted-foreground"
                    >
                      <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MiniMax Brain Callout */}
      <section className="py-16 bg-gradient-to-r from-blue-600/5 to-violet-600/5 border-y border-border/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/10 border border-blue-600/20 text-blue-600 dark:text-blue-400 text-sm font-semibold">
            🧠 AI Brain
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            Powered by MiniMax M2.7
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            DevPulse uses MiniMax M2.7 — a cutting-edge reasoning model — as its
            core intelligence engine. Every scan analysis, compliance mapping,
            and threat explanation is generated with deep reasoning and
            automatically tracked in your token analytics dashboard.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              OpenAI-compatible API
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Chain-of-thought reasoning
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              Auto cost tracking
            </span>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center space-y-6">
        <h2 className="text-4xl font-bold text-foreground">
          Ready to secure your APIs?
        </h2>
        <p className="text-lg text-muted-foreground">
          Start with a free account and get full access to all features
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            id="cta-google-signin"
            onClick={handleGoogleLogin}
            className="flex items-center gap-3 px-8 py-3.5 rounded-xl bg-white border border-gray-200 text-gray-800 text-base font-semibold hover:shadow-lg hover:border-gray-300 transition-all dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <GoogleIcon className="w-5 h-5" />
            Sign in with Google — it&apos;s free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-muted-foreground text-sm">
          <p>
            © 2026 DevPulse. All rights reserved. · Powered by MiniMax M2.7
          </p>
        </div>
      </footer>
    </div>
  );
}
