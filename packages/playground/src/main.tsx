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
