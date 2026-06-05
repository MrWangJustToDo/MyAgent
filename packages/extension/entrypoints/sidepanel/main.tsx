import { HeroUIProvider } from "@heroui/react";
import { preloadExtendedLanguageIcons } from "markstream-react";
import React from "react";
import { createRoot } from "react-dom/client";

import { loadDevtool } from "@/devtool/load";

import { App } from "./App";

import "@/style.css";
import "markstream-react/index.tailwind.css";

if (typeof window !== "undefined") {
  const preload = () => {
    void preloadExtendedLanguageIcons();
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preload);
  } else {
    setTimeout(preload, 2000);
  }
}

loadDevtool();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <App />
    </HeroUIProvider>
  </React.StrictMode>
);
