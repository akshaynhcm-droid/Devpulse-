import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Invite from "./pages/Invite";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Collections from "./pages/Collections";
import Scanning from "./pages/Scanning";
import ShadowAPIs from "./pages/ShadowAPIs";
import TokenAnalytics from "./pages/TokenAnalytics";
import KillSwitch from "./pages/KillSwitch";
import Compliance from "./pages/Compliance";
import Team from "./pages/Team";
import Onboarding from "./pages/Onboarding";
import Pricing from "./pages/Pricing";
import CollectionDetail from "./pages/CollectionDetail";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/invite/:token"} component={Invite} />
      <Route path={"/onboarding"} component={Onboarding} />

      {/* Dashboard Routes — each wrapped in its own error boundary */}
      <Route path={"/dashboard"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Dashboard">
              <Dashboard />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/collections"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Collections">
              <Collections />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/collections/:id"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Collection Detail">
              <CollectionDetail />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/scanning"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Security Scanning">
              <Scanning />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/shadow-apis"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Shadow API Detection">
              <ShadowAPIs />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/analytics"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Token Analytics">
              <TokenAnalytics />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/kill-switch"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Kill Switch">
              <KillSwitch />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/compliance"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Compliance Reports">
              <Compliance />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/team"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Team Management">
              <Team />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/pricing"}>
        {() => (
          <DashboardLayout>
            <PageErrorBoundary pageName="Pricing">
              <Pricing />
            </PageErrorBoundary>
          </DashboardLayout>
        )}
      </Route>

      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
