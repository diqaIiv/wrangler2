import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { execaCommand } from "execa";
import tmp from "tmp-promise";
import { toFormData } from "./api/form_data";
import { bundleWorker } from "./bundle";
import { fetchResult } from "./cfetch";
import { fileExists } from "./entry";
import guessWorkerFormat from "./guess-worker-format";
import { syncAssets } from "./sites";
import type { CfScriptFormat, CfWorkerInit } from "./api/worker";
import type { Config } from "./config";
import type { AssetPaths } from "./sites";

type Props = {
  config: Config;
  format: CfScriptFormat | undefined;
  entry: { file: string; directory: string };
  rules: Config["rules"];
  name: string | undefined;
  env: string | undefined;
  compatibilityDate: string | undefined;
  compatibilityFlags: string[] | undefined;
  assetPaths: AssetPaths | undefined;
  triggers: (string | number)[] | undefined;
  routes: (string | number)[] | undefined;
  legacyEnv: boolean | undefined;
  jsxFactory: undefined | string;
  jsxFragment: undefined | string;
  experimentalPublic: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function publish(props: Props): Promise<void> {
  // TODO: warn if git/hg has uncommitted changes
  const { config } = props;

  // TODO: should we automatically fallback to top level config if there is no matching environment??
  const envRootObj = (props.env && config.env[props.env]) || config;

  assert(
    envRootObj.compatibility_date || props.compatibilityDate,
    "A compatibility_date is required when publishing. Add one to your wrangler.toml file, or pass it in your terminal as --compatibility_date. See https://developers.cloudflare.com/workers/platform/compatibility-dates for more information."
  );

  const triggers = props.triggers || envRootObj.triggers?.crons;
  const routes =
    props.routes ??
    envRootObj.routes ??
    (envRootObj.route ? [envRootObj.route] : []) ??
    [];

  const { account_id: accountId, workers_dev: deployToWorkersDev } = config;

  if (accountId === undefined) {
    throw new Error("No account_id provided.");
  }

  const jsxFactory = props.jsxFactory || envRootObj.jsx_factory;
  const jsxFragment = props.jsxFragment || envRootObj.jsx_fragment;

  assert(config.account_id, "missing account id");

  const scriptName = props.name;
  assert(
    scriptName,
    'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
  );

  if (config.site?.["entry-point"]) {
    console.warn(
      "Deprecation notice: The `site.entry-point` config field is no longer used.\n" +
        "The entry-point should be specified via the command line (e.g. `wrangler publish path/to/script`) or the `main` config field.\n" +
        "Please remove the `site.entry-point` field from the `wrangler.toml` file."
    );
  }

  assert(
    !config.site || config.site.bucket,
    "A [site] definition requires a `bucket` field with a path to the site's public directory."
  );

  const destination = await tmp.dir({ unsafeCleanup: true });
  try {
    const envName = props.env ?? "production";

    if (config.build.command) {
      // TODO: add a deprecation message here?
      console.log("running:", config.build.command);
      await execaCommand(config.build.command, {
        shell: true,
        stdout: "inherit",
        stderr: "inherit",
        timeout: 1000 * 30,
        ...(config.build.cwd && { cwd: config.build.cwd }),
      });

      if (fileExists(props.entry.file) === false) {
        throw new Error(
          `Could not resolve "${path.relative(
            process.cwd(),
            props.entry.file
          )}".`
        );
      }
    }

    const format = await guessWorkerFormat(props.entry, props.format);

    if (props.experimentalPublic && format === "service-worker") {
      // TODO: check config too
      throw new Error(
        "You cannot publish in the service worker format with a public directory."
      );
    }

    if (config.wasm_modules && format === "modules") {
      throw new Error(
        "You cannot configure [wasm_modules] with an ES module worker. Instead, import the .wasm module directly in your code"
      );
    }

    if (config.text_blobs && format === "modules") {
      throw new Error(
        "You cannot configure [text_blobs] with an ES module worker. Instead, import the file directly in your code, and optionally configure `[build.upload.rules]` in your wrangler.toml"
      );
    }

    const { modules, resolvedEntryPointPath, bundleType } = await bundleWorker(
      props.entry,
      destination.path,
      {
        serveAssetsFromWorker: props.experimentalPublic,
        jsxFactory,
        jsxFragment,
        format,
        rules: props.rules,
      }
    );

    const content = readFileSync(resolvedEntryPointPath, {
      encoding: "utf-8",
    });

    // if config.migrations
    // get current migration tag
    let migrations;
    if (config.migrations.length > 0) {
      const scripts = await fetchResult<
        { id: string; migration_tag: string }[]
      >(`/accounts/${accountId}/workers/scripts`);
      const script = scripts.find(({ id }) => id === scriptName);
      if (script?.migration_tag) {
        // was already published once
        const foundIndex = config.migrations.findIndex(
          (migration) => migration.tag === script.migration_tag
        );
        if (foundIndex === -1) {
          console.warn(
            `The published script ${scriptName} has a migration tag "${script.migration_tag}, which was not found in wrangler.toml. You may have already deleted it. Applying all available migrations to the script...`
          );
          migrations = {
            old_tag: script.migration_tag,
            new_tag: config.migrations[config.migrations.length - 1].tag,
            steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
          };
        } else {
          migrations = {
            old_tag: script.migration_tag,
            new_tag: config.migrations[config.migrations.length - 1].tag,
            steps: config.migrations
              .slice(foundIndex + 1)
              .map(({ tag: _tag, ...rest }) => rest),
          };
        }
      } else {
        migrations = {
          new_tag: config.migrations[config.migrations.length - 1].tag,
          steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
        };
      }
    }

    const assets = await syncAssets(
      accountId,
      // When we're using the newer service environments, we wouldn't
      // have added the env name on to the script name. However, we must
      // include it in the kv namespace name regardless (since there's no
      // concept of service environments for kv namespaces yet).
      scriptName + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
      props.assetPaths,
      false
    );

    const bindings: CfWorkerInit["bindings"] = {
      kv_namespaces: (envRootObj.kv_namespaces || []).concat(
        assets.namespace
          ? { binding: "__STATIC_CONTENT", id: assets.namespace }
          : []
      ),
      vars: envRootObj.vars,
      wasm_modules: config.wasm_modules,
      text_blobs: {
        ...config.text_blobs,
        ...(assets.manifest &&
          format === "service-worker" && {
            __STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
          }),
      },
      durable_objects: envRootObj.durable_objects,
      r2_buckets: envRootObj.r2_buckets,
      unsafe: envRootObj.unsafe?.bindings,
    };

    if (assets.manifest) {
      modules.push({
        name: "__STATIC_CONTENT_MANIFEST",
        content: JSON.stringify(assets.manifest),
        type: "text",
      });
    }

    const worker: CfWorkerInit = {
      name: scriptName,
      main: {
        name: path.basename(resolvedEntryPointPath),
        content: content,
        type: bundleType,
      },
      bindings,
      migrations,
      modules,
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      usage_model: config.usage_model,
    };

    const start = Date.now();
    const notProd = !props.legacyEnv && props.env;
    const workerName = notProd ? `${scriptName} (${envName})` : scriptName;
    const workerUrl = notProd
      ? `/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
      : `/accounts/${accountId}/workers/scripts/${scriptName}`;

    // Upload the script so it has time to propagate.
    const { available_on_subdomain } = await fetchResult(
      workerUrl,
      {
        method: "PUT",
        body: toFormData(worker),
      },
      new URLSearchParams({ available_on_subdomain: "true" })
    );

    const uploadMs = Date.now() - start;
    console.log("Uploaded", workerName, formatTime(uploadMs));
    const deployments: Promise<string[]>[] = [];

    if (deployToWorkersDev) {
      // Deploy to a subdomain of `workers.dev`
      const userSubdomain = (
        await fetchResult<{ subdomain: string }>(
          `/accounts/${accountId}/workers/subdomain`
        )
      ).subdomain;
      const scriptURL =
        props.legacyEnv || !props.env
          ? `${scriptName}.${userSubdomain}.workers.dev`
          : `${envName}.${scriptName}.${userSubdomain}.workers.dev`;
      if (!available_on_subdomain) {
        // Enable the `workers.dev` subdomain.
        deployments.push(
          fetchResult(`${workerUrl}/subdomain`, {
            method: "POST",
            body: JSON.stringify({ enabled: true }),
            headers: {
              "Content-Type": "application/json",
            },
          })
            .then(() => [scriptURL])
            // Add a delay when the subdomain is first created.
            // This is to prevent an issue where a negative cache-hit
            // causes the subdomain to be unavailable for 30 seconds.
            // This is a temporary measure until we fix this on the edge.
            .then(async (url) => {
              await sleep(3000);
              return url;
            })
        );
      } else {
        deployments.push(Promise.resolve([scriptURL]));
      }
    } else {
      // Disable the workers.dev deployment
      await fetchResult(`${workerUrl}/subdomain`, {
        method: "POST",
        body: JSON.stringify({ enabled: false }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Update routing table for the script.
    if (routes.length > 0) {
      deployments.push(
        fetchResult(`${workerUrl}/routes`, {
          // TODO: PATCH will not delete previous routes on this script,
          // whereas PUT will. We need to decide on the default behaviour
          // and how to configure it.
          method: "PUT",
          body: JSON.stringify(routes.map((pattern) => ({ pattern }))),
          headers: {
            "Content-Type": "application/json",
          },
        }).then(() => {
          if (routes.length > 10) {
            return routes
              .slice(0, 9)
              .map(String)
              .concat([`...and ${routes.length - 10} more routes`]);
          }
          return routes.map(String);
        })
      );
    }

    // Configure any schedules for the script.
    // TODO: rename this to `schedules`?
    if (triggers && triggers.length) {
      deployments.push(
        fetchResult(`${workerUrl}/schedules`, {
          // TODO: Unlike routes, this endpoint does not support PATCH.
          // So technically, this will override any previous schedules.
          // We should change the endpoint to support PATCH.
          method: "PUT",
          body: JSON.stringify(triggers.map((cron) => ({ cron }))),
          headers: {
            "Content-Type": "application/json",
          },
        }).then(() => triggers.map(String))
      );
    }

    const targets = await Promise.all(deployments);
    const deployMs = Date.now() - start - uploadMs;

    if (deployments.length > 0) {
      console.log("Published", workerName, formatTime(deployMs));
      for (const target of targets.flat()) {
        console.log(" ", target);
      }
    } else {
      console.log("No publish targets for", workerName, formatTime(deployMs));
    }
  } finally {
    await destination.cleanup();
  }
}

function formatTime(duration: number) {
  return `(${(duration / 1000).toFixed(2)} sec)`;
}
