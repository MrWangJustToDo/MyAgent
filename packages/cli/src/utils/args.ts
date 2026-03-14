// ============================================================================
// Types
// ============================================================================

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

// ============================================================================
// Argument Parsing Utilities
// ============================================================================

/**
 * Parse command line arguments into structured format
 *
 * Supports:
 * - Long flags: --model gpt-4
 * - Short flags: -m gpt-4
 * - Boolean flags: --help, -h
 * - Positional args: "hello world"
 */
export const parseArgs = (args: string[]): ParsedArgs => {
  const result: ParsedArgs = {
    positional: [],
    flags: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      // Long flag: --model value or --help
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i += 1;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Short flag: -m value or -h
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
      // Positional argument
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
};

/**
 * Get a flag value by multiple possible keys
 */
export const getFlag = (args: ParsedArgs, ...keys: string[]): string | boolean | undefined => {
  for (const key of keys) {
    if (args.flags[key] !== undefined) {
      return args.flags[key];
    }
  }
  return undefined;
};

/**
 * Get a flag value as string with default
 */
export const getFlagString = (args: ParsedArgs, defaultValue: string, ...keys: string[]): string => {
  const value = getFlag(args, ...keys);
  if (typeof value === "string") {
    return value;
  }
  return defaultValue;
};

/**
 * Get a flag value as number with default
 */
export const getFlagNumber = (args: ParsedArgs, defaultValue: number, ...keys: string[]): number => {
  const value = getFlag(args, ...keys);
  if (typeof value === "string") {
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  }
  return defaultValue;
};

/**
 * Get a flag value as boolean
 */
export const getFlagBoolean = (args: ParsedArgs, ...keys: string[]): boolean => {
  const value = getFlag(args, ...keys);
  return value === true || value === "true";
};
