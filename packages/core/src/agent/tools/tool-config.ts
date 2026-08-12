/**
 * Agent tool configuration — secrets and provider prefs passed explicitly by hosts.
 * Core tools MUST NOT dig credentials from CoreEnv.getEnv().
 */

export interface WebsearchToolConfig {
  /** Brave Search API key (when set, Brave may be selected). */
  braveApiKey?: string;
  /**
   * Preferred provider name (`brave`, `duckduckgo`, …) or `auto`.
   * When omitted or `auto`, first available provider in registration order wins.
   */
  provider?: string;
}

export interface AgentToolConfig {
  websearch?: WebsearchToolConfig;
}
