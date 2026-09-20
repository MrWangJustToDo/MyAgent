// Must run before App/Ink import chalk — browser supports-color is Chromium-only.
import "./force-chalk-color.js";

import React from "react";
import { createRoot } from "react-dom/client";

import { AppShell } from "./shell/AppShell.js";

import "@my-react/react-terminal/web/css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./styles/overlays.css";
import "./styles/feedback.css";
import "./styles/shell.css";
import "./styles/workspace.css";
import "./styles/settings.css";
import "./styles/variants.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
