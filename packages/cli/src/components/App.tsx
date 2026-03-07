import { Box } from "ink";

import { Chat } from "./Chat.js";
import { Help } from "./Help.js";
import { Models } from "./Models.js";
import { Status } from "./Status.js";
import { Translate } from "./Translate.js";

export interface AppProps {
  command: string;
  args: string[];
}

export const App = ({ command, args }: AppProps) => {
  const renderCommand = () => {
    switch (command) {
      case "translate":
      case "t":
        return <Translate args={args} />;
      case "chat":
      case "c":
        return <Chat args={args} />;
      case "models":
      case "m":
        return <Models args={args} />;
      case "status":
      case "s":
        return <Status args={args} />;
      case "help":
      case "h":
      case "--help":
      case "-h":
      default:
        return <Help />;
    }
  };

  return <Box flexDirection="column">{renderCommand()}</Box>;
};
