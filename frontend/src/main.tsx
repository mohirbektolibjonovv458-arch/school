import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "./styles.css";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./ui/toast";

// Yangi versiya chiqqanda eski sahifa yo'q faylni so'rasa — bir marta avtomatik yangilanadi
window.addEventListener("vite:preloadError", () => {
  try {
    if (sessionStorage.getItem("sp-reloaded") !== "1") { sessionStorage.setItem("sp-reloaded", "1"); location.reload(); }
  } catch { location.reload(); }
});
setTimeout(() => { try { sessionStorage.removeItem("sp-reloaded"); } catch { /* */ } }, 10000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
