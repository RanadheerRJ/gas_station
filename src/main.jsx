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
    {/* Router v7 makes both of the behaviours this app opted into on v6
        (state updates wrapped in React.startTransition, splat-relative path
        resolution) the default, so the future flags are gone rather than
        turned off. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
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
