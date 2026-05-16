import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Capture PWA install prompt as early as possible — before any component loads
(window as any).__buspay_install_prompt = null;
window.addEventListener("beforeinstallprompt", (e: any) => {
  e.preventDefault();
  (window as any).__buspay_install_prompt = e;
});
window.addEventListener("appinstalled", () => {
  (window as any).__buspay_install_prompt = null;
});

createRoot(document.getElementById("root")!).render(<App />);
