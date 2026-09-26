import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./state/AuthContext";
import { ThemeProvider } from "./state/ThemeContext";
import { LanguageProvider } from "./state/LanguageContext.jsx";
import "./styles.css";
import { registerServiceWorker } from "./lib/pwa";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* On GitHub Pages the app lives under /<repo>/, so the router has to be
        told where its root is or every route would resolve one level too high.
        BASE_URL is "/" in development and for a root deployment. */}
    {/* The v7 behaviours are opted into here while still on v6 so the
        eventual major upgrade is a version bump rather than a behaviour
        change: state updates wrap in React.startTransition, and relative
        paths inside splat routes resolve against the splat's own path. */}
    <BrowserRouter
      basename={import.meta.env.BASE_URL}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

registerServiceWorker();
