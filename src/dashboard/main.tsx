// DemirTube Aurora UI v2 · unified dashboard visual system
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard";
import "../styles/global.css";
import "../styles/07-library.css";

document.documentElement.classList.add("demirtube-ui");
document.documentElement.style.setProperty("--app-vh", `${window.innerHeight * 0.01}px`);
window.addEventListener("resize", () => document.documentElement.style.setProperty("--app-vh", `${window.innerHeight * 0.01}px`), { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>
);
