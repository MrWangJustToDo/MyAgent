import tailwindcss from "@tailwindcss/postcss";

import prefixSelector from "./postcss-prefix.mjs";

export default {
  plugins: [tailwindcss(), prefixSelector("[data-translate]")],
};
