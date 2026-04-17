import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      setError(null);
      await utils.auth.me.invalidate();
      navigate("/dashboard");
    },
    onError: err => {
      setError(err.message || "Login failed");
    },
  });

  const forgot = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => {
      setError(
        "If that email exists, we sent a password reset link. Check your inbox."
      );
    },
    onError: err => {
      setError(err.message || "Could not send reset email");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    login.mutate({ email: email.trim(), password });
  };

  const handleForgot = () => {
    if (!email.trim()) {
      setError("Enter your email above first, then click 'Forgot password?'");
      return;
    }
    forgot.mutate({ email: email.trim() });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 mb-6 text-foreground"
        >
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Shield className="w-5 h-5 text-accent-foreground" />
          </div>
          <span className="text-2xl font-bold">DevPulse</span>
        </Link>

        <div className="rounded-xl border border-border bg-card p-8 space-y-6 shadow-sm">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">
              Sign in to DevPulse
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome back. Sign in with your email and password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgot}
                  className="text-xs text-accent hover:underline"
                  disabled={forgot.isPending}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending}
            >
              {login.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <div className="grid gap-2">
            <a
              href="/api/oauth/google"
              className="w-full py-2.5 rounded-lg border border-border bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-all text-center dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Continue with Google
            </a>
            <a
              href={getLoginUrl()}
              className="w-full py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-all text-center text-foreground"
            >
              Manus Login
            </a>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
