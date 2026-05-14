import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Must import early so the event listener is registered before the prompt fires
import "./lib/installPrompt";

createRoot(document.getElementById("root")!).render(<App />);
