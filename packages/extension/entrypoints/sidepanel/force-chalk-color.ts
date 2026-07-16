import chalk from "chalk";

/**
 * chalk's browser supports-color only enables Chromium (userAgentData / Chrome UA).
 * Firefox and other browsers get level 0 → all ANSI stripped before xterm.
 * InkTerminalBox / xterm support truecolor, so force level 3 for every browser host.
 */
chalk.level = 3;
