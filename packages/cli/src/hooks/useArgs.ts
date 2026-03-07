export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export const parseArgs = (args: string[]): ParsedArgs => {
  const result: ParsedArgs = {
    positional: [],
    flags: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i += 1;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i += 1;
      }
    } else {
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
};

export const getFlag = (args: ParsedArgs, ...keys: string[]): string | boolean | undefined => {
  for (const key of keys) {
    if (args.flags[key] !== undefined) {
      return args.flags[key];
    }
  }
  return undefined;
};

export const getFlagString = (args: ParsedArgs, defaultValue: string, ...keys: string[]): string => {
  const value = getFlag(args, ...keys);
  if (typeof value === "string") {
    return value;
  }
  return defaultValue;
};
