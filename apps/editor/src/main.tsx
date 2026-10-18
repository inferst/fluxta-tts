import { ActionEditorProvider } from "@fluxta/sdk/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Connects to Fluxta and hands the connection to every hook below. */}
    <ActionEditorProvider>
      <App />
    </ActionEditorProvider>
  </StrictMode>,
);
