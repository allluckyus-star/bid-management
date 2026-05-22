import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installClientFrontendLogging } from "./lib/client-log";
import "./index.css";

installClientFrontendLogging();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
