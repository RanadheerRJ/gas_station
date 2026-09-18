import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./state/AuthContext";
import "./styles.css";
import { registerServiceWorker } from "./lib/pwa";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* On GitHub Pages the app lives under /<repo>/, so the router has to be
        told where its root is or every route would resolve one level too high.
        BASE_URL is "/" in development and for a root deployment. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

registerServiceWorker();
