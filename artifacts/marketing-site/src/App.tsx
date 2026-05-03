import { Switch, Route, Router as WouterRouter } from "wouter";
import Home from "@/pages/Home";
import Listing from "@/pages/Listing";
import Onboarding from "@/pages/Onboarding";
import OnboardingSuccess from "@/pages/OnboardingSuccess";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/listing/:slug" component={Listing} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/onboarding/success" component={OnboardingSuccess} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}

export default App;
