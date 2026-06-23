import { createContext, use } from "react";

export const StaticContext = createContext({ staticMessage: false });

export const useStaticContext = () => use(StaticContext);
