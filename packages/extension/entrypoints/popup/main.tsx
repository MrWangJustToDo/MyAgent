import { HeroUIProvider } from "@heroui/react";
import React from "react";
import { createRoot } from "react-dom/client";

import { loadDevtool } from "@/devtool/load";

import App from "./App";

import "@/style.css";

loadDevtool();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <App />
    </HeroUIProvider>
  </React.StrictMode>
);
