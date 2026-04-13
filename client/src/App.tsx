import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import AdminPage from "./pages/AdminPage";
import HistoryPage from "./pages/HistoryPage";
import AccountsPage from "./pages/AccountsPage";
import ApiKeysPage from "./pages/ApiKeysPage";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/admin"} component={AdminPage} />
      <Route path={"/history"} component={HistoryPage} />
      <Route path={"/accounts"} component={AccountsPage} />
      <Route path={"/api-keys"} component={ApiKeysPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors theme="dark" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
