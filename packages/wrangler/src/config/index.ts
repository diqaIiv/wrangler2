import { findUpSync } from "find-up";
import { parseTOML, readFile } from "../parse";
import { normalizeAndValidateConfig } from "./validation";
import type { Config, RawConfig } from "./config";

export type { Config, RawConfig } from "./config";
export type {
  Environment,
  RawEnvironment,
  ConfigModuleRuleType,
} from "./environment";

/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export function readConfig(configPath?: string): Config {
  let rawConfig: RawConfig = {};
  if (!configPath) {
    configPath = findWranglerToml();
  }

  // Load the configuration from disk if available
  if (configPath) {
    rawConfig = parseTOML(readFile(configPath), configPath);
  }

  // Process the top-level configuration.
  const { config, diagnostics } = normalizeAndValidateConfig(
    rawConfig,
    configPath
  );

  if (diagnostics.hasWarnings()) {
    console.warn(diagnostics.renderWarnings());
  }
  if (diagnostics.hasErrors()) {
    throw new Error(diagnostics.renderErrors());
  }

  return config;
}

/**
 * Find the wrangler.toml file by searching up the file-system
 * from the current working directory.
 */
export function findWranglerToml(
  referencePath: string = process.cwd()
): string | undefined {
  const configPath = findUpSync("wrangler.toml", { cwd: referencePath });
  return configPath;
}
