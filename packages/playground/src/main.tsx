// Must run before App/Ink import chalk — browser supports-color is Chromium-only.
import "./force-chalk-color.js";

import React from "react";
import { createRoot } from "react-dom/client";

import { PlaygroundApp } from "./App.js";

import "@my-react/react-terminal/web/css";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PlaygroundApp />
  </React.StrictMode>
);
