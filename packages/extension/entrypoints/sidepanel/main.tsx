import React from "react";
import { createRoot } from "react-dom/client";

import { loadDevtool } from "@/devtool/load";

import { SidepanelApp } from "./App";

import "@/style.css";
import "@my-react/react-terminal/web/css";

loadDevtool();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SidepanelApp />
  </React.StrictMode>
);
