import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n"; // Initialize i18n
import App from "./App.tsx";
import { initTokenFromUrl } from "./utils/token.ts";

// Initialize token from URL on app startup
// This saves the token to sessionStorage before SPA navigation changes the URL
initTokenFromUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
