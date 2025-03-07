import type { Environment, RawEnvironment } from "./environment";

/**
 * This is the static type definition for the configuration object.
 *
 * It reflects the configuration that you can write in wrangler.toml,
 * and optionally augment with arguments passed directly to wrangler.
 *
 * For more information about the configuration object, see the
 * documentation at https://developers.cloudflare.com/workers/cli-wrangler/configuration
 *
 * Notes:
 *
 * - Fields that are only specified in `ConfigFields` and not `Environment` can only appear
 * in the top level config and should not appear in any environments.
 * - All top level fields in config and environments are optional in the wrangler.toml file.
 *
 * Legend for the annotations:
 *
 * - `@breaking`: the deprecation/optionality is a breaking change from wrangler 1.
 * - `@todo`: there's more work to be done (with details attached).
 */
export type Config = ConfigFields<Environment> & Environment;

export type RawConfig = Partial<ConfigFields<RawEnvironment>> &
  RawEnvironment &
  DeprecatedConfigFields;

export interface ConfigFields<Env extends RawEnvironment> {
  configPath: string | undefined;

  /**
   * The entrypoint/path to the JavaScript file that will be executed.
   */
  main: string | undefined;

  /**
   * A boolean to enable "legacy" style wrangler environments (from wrangler 1).
   * These have been superseded by Services, but there may be projects that won't
   * (or can't) use them. If you're using a legacy environment, you can set this
   * to `true` to enable it.
   */
  legacy_env: boolean;

  /**
   * The `env` section defines overrides for the configuration for different environments.
   *
   * All environment fields can be specified at the top level of the config indicating the default environment settings.
   *
   * - Some fields are inherited and overridable in each environment.
   * - But some are not inherited and must be explicitly specified in every environment, if they are specified at the top level.
   *
   * For more information, see the documentation at https://developers.cloudflare.com/workers/cli-wrangler/configuration#environments
   *
   * @default `{}`
   */
  env: {
    [envName: string]: Env;
  };

  /**
   * Options to configure the development server that your worker will use.
   *
   * @default `{}`
   */
  dev: {
    /**
     * IP address for the local dev server to listen on,
     *
     * @default `127.0.0.1`
     * @todo this needs to be implemented
     */
    ip?: string;

    /**
     * Port for the local dev server to listen on
     *
     * @default `8787`
     */
    port?: number;

    /**
     * Protocol that local wrangler dev server listens to requests on.
     *
     * @default `http`
     * @todo this needs to be implemented
     */
    local_protocol?: string;

    /**
     * Protocol that wrangler dev forwards requests on
     *
     * @default `https`
     * @todo this needs to be implemented
     */
    upstream_protocol?: string;
  };

  /**
   * A list of migrations that should be uploaded with your Worker.
   *
   * These define changes in your Durable Object declarations.
   *
   * More details at https://developers.cloudflare.com/workers/learning/using-durable-objects#configuring-durable-object-classes-with-migrations
   *
   * @default `[]`
   */
  migrations: {
    /** A unique identifier for this migration. */
    tag: string;
    /** The new Durable Objects being defined. */
    new_classes?: string[];
    /** The Durable Objects being renamed. */
    renamed_classes?: {
      from: string;
      to: string;
    }[];
    /** The Durable Objects being removed. */
    deleted_classes?: string[];
  }[];

  /**
   * The definition of a Worker Site, a feature that lets you upload
   * static assets with your Worker.
   *
   * More details at https://developers.cloudflare.com/workers/platform/sites
   */
  site:
    | {
        /**
         * The directory containing your static assets.
         *
         * It must be a path relative to your wrangler.toml file.
         * Example: bucket = "./public"
         *
         * If there is a `site` field then it must contain this `bucket` field.
         */
        bucket: string;

        /**
         * The location of your Worker script.
         *
         * @deprecated DO NOT use this (it's a holdover from wrangler 1.x). Either use the top level `main` field, or pass the path to your entry file as a command line argument.
         * @breaking
         */
        "entry-point"?: string;

        /**
         * An exclusive list of .gitignore-style patterns that match file
         * or directory names from your bucket location. Only matched
         * items will be uploaded. Example: include = ["upload_dir"]
         *
         * @optional
         * @default `[]`
         */
        include?: string[];

        /**
         * A list of .gitignore-style patterns that match files or
         * directories in your bucket that should be excluded from
         * uploads. Example: exclude = ["ignore_dir"]
         *
         * @optional
         * @default `[]`
         */
        exclude?: string[];
      }
    | undefined;

  /**
   * A list of wasm modules that your worker should be bound to. This is
   * the "legacy" way of binding to a wasm module. ES module workers should
   * do proper module imports.
   */
  wasm_modules:
    | {
        [key: string]: string;
      }
    | undefined;

  /**
   * A list of text files that your worker should be bound to. This is
   * the "legacy" way of binding to a text file. ES module workers should
   * do proper module imports.
   */
  text_blobs:
    | {
        [key: string]: string;
      }
    | undefined;

  /**
   * Configures a custom build step to be run by Wrangler when building your Worker.
   *
   * Refer to the [custom builds documentation](https://developers.cloudflare.com/workers/cli-wrangler/configuration#build)
   * for more details.
   *
   * @default {}
   */
  build: {
    /** The command used to build your Worker. On Linux and macOS, the command is executed in the `sh` shell and the `cmd` shell for Windows. The `&&` and `||` shell operators may be used. */
    command?: string;
    /** The directory in which the command is executed. */
    cwd?: string;
    /** The directory to watch for changes while using wrangler dev, defaults to the current working directory */
    watch_dir?: string;
    /** Deprecated field previously used to configure the build and upload of the script. */
    upload?: DeprecatedUpload;
  };
}

export interface DeprecatedConfigFields {
  /**
   * The project "type". A holdover from wrangler 1.x.
   * Valid values were "webpack", "javascript", and "rust".
   *
   * @deprecated DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.
   * @breaking
   */
  type?: "webpack" | "javascript" | "rust";

  /**
   * Path to the webpack config to use when building your worker.
   * A holdover from wrangler 1.x, used with `type: "webpack"`.
   *
   * @deprecated DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.
   * @breaking
   */
  webpack_config?: string;
}

/**
 * Deprecated upload configuration.
 */
export interface DeprecatedUpload {
  /**
   * The format of the Worker script.
   *
   * @deprecated We infer the format automatically now.
   */
  format?: "modules" | "service-worker";

  /**
   * The directory you wish to upload your worker from,
   * relative to the wrangler.toml file.
   *
   * Defaults to the directory containing the wrangler.toml file.
   *
   * @deprecated
   * @breaking In wrangler 1, this defaults to ./dist, whereas in wrangler 2 it defaults to ./
   */
  dir?: string;

  /**
   * The path to the Worker script, relative to `upload.dir`.
   *
   * @deprecated This will be replaced by a command line argument.
   */
  main?: string;

  /**
   * @deprecated This is now defined at the top level `rules` field.
   */
  rules?: Environment["rules"];
}
