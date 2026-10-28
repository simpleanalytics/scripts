// Finds websites whose pageviews dropped after a script deploy.
//
//   pnpm run traffic-drop query [--weeks 4] [--deploy "2026-10-28 08:00"]
//     Prints a request to paste into Kibana Dev Tools. Save the whole
//     response to a file, for example response.json. Without --deploy, it
//     uses the newest deploy recorded in GitHub Deployments.
//   pnpm run traffic-drop analyze response.json
//     Lists the websites with a significant drop, and prints follow-up
//     requests for their script versions and script errors.
//
// The time since the deploy (until 10 minutes ago) is compared with the same
// hours 1 to --weeks weeks earlier, so weekdays line up. Websites with fewer
// than --min-daily pageviews per day are ignored. The request stores these
// settings, so analyze reads them from the response.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const INDEX = "live-datapoints-*";
const FIELD = "hostname_non_robot_pageview"; // only set on non-robot pageviews
const DAY = 24 * 60 * 60 * 1000;
// GitHub deployment environments that deploy.mts records for latest.js
const GITHUB_DEPLOYMENTS =
  "https://api.github.com/repos/simpleanalytics/scripts/deployments";
const ENVIRONMENTS = ["cdn", "custom-domains"];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    deploy: { type: "string" },
    to: { type: "string" },
    weeks: { type: "string", default: "4" },
    "min-daily": { type: "string", default: "50" },
    "min-drop": { type: "string", default: "30" },
    "min-z": { type: "string", default: "3" },
    limit: { type: "string", default: "100" },
  },
});
const [command, file] = positionals;

type Window = { name: string; gte: string; lt: string };
type Settings = { deploy: string; to: string; weeks: number; minDaily: number };
type Request = { path: string; body: unknown };

const devTools = ({ path, body }: Request) =>
  `GET ${path}\n${JSON.stringify(body, null, 2)}\n`;

function windows({ deploy, to, weeks }: Settings): Window[] {
  const start = Date.parse(deploy);
  const end = Date.parse(to);
  if (!(start < end)) throw new Error("The deploy time must be in the past");
  return [0, ...Array.from({ length: weeks }, (_, i) => i + 1)].map((w) => ({
    name: w ? `w${w}` : "current",
    gte: new Date(start - w * 7 * DAY).toISOString(),
    lt: new Date(end - w * 7 * DAY).toISOString(),
  }));
}

const range = ({ gte, lt }: Window) => ({
  range: { "@timestamp": { gte, lt } },
});

function pageviewsRequest(settings: Settings): Request {
  const ws = windows(settings);
  const minWindow = minPerWindow(settings);
  const baselines = ws.filter((w) => w.name !== "current");
  return {
    // filter_path keeps the response small enough to copy from Kibana
    path: `${INDEX}/_search?request_cache=true&filter_path=took,timed_out,_shards.failed,aggregations.sites.meta,aggregations.sites.buckets.key,aggregations.sites.buckets.*.doc_count`,
    body: {
      size: 0,
      track_total_hits: false,
      query: {
        bool: {
          filter: [
            { exists: { field: FIELD } },
            { bool: { should: ws.map(range), minimum_should_match: 1 } },
          ],
        },
      },
      aggs: {
        sites: {
          // Elasticsearch returns meta as is, so analyze knows the settings
          meta: settings,
          terms: {
            field: FIELD,
            size: 65000,
            // A website needs at least one baseline window above the minimum
            min_doc_count: Math.ceil(minWindow),
          },
          aggs: {
            ...Object.fromEntries(
              ws.map((w) => [w.name, { filter: range(w) }])
            ),
            keep: {
              bucket_selector: {
                buckets_path: Object.fromEntries(
                  baselines.map((w) => [w.name, `${w.name}>_count`])
                ),
                script: {
                  source: baselines
                    .map((w) => `params.${w.name} >= params.min`)
                    .join(" || "),
                  params: { min: Math.ceil(minWindow) },
                },
              },
            },
          },
        },
      },
    },
  };
}

function followUpRequests(hostnames: string[], ws: Window[]): Request[] {
  const [current, previous] = ws;
  return [
    {
      // Which script versions sent pageviews, now and a week earlier
      path: `${INDEX}/_search?filter_path=aggregations`,
      body: {
        size: 0,
        track_total_hits: false,
        query: {
          bool: {
            filter: [
              { terms: { [FIELD]: hostnames } },
              {
                bool: {
                  should: [range(current), range(previous)],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
        aggs: {
          sites: {
            terms: { field: FIELD, size: hostnames.length },
            aggs: Object.fromEntries(
              [current, previous].map((w) => [
                w.name,
                {
                  filter: range(w),
                  aggs: {
                    versions: { terms: { field: "meta.script_id", size: 5 } },
                  },
                },
              ])
            ),
          },
        },
      },
    },
    {
      // Errors our scripts reported in the current window
      path: `${INDEX}/_search?filter_path=aggregations`,
      body: {
        size: 0,
        track_total_hits: false,
        query: {
          bool: {
            filter: [
              { term: { datapoint: "error" } },
              { terms: { hostname: hostnames } },
              range(current),
            ],
          },
        },
        aggs: {
          sites: {
            terms: { field: "hostname", size: hostnames.length },
            aggs: {
              versions: { terms: { field: "meta.script_id", size: 5 } },
              example: {
                top_hits: {
                  size: 1,
                  _source: [
                    "metadata_flattened.message",
                    "metadata.message",
                    "meta.script_id",
                  ],
                },
              },
            },
          },
        },
      },
    },
  ];
}

const variance = (list: number[]) => {
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  return (
    list.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(list.length - 1, 1)
  );
};

const median = (list: number[]) => {
  const sorted = [...list].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const days = ({ deploy, to }: Settings) =>
  (Date.parse(to) - Date.parse(deploy)) / DAY;

const minPerWindow = (settings: Settings) =>
  Math.ceil(settings.minDaily * days(settings));

type Deployment = { environment: string; ref: string; at: string };

// Public data, but a token avoids the 60 requests per hour limit
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const readGitHub = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok)
    throw new Error(
      `GitHub answered HTTP ${response.status} for ${url}. Set GH_TOKEN or pass --deploy.`
    );
  return (await response.json()) as T;
};

// The newest successful deployment per environment
async function lastDeployments(): Promise<Deployment[]> {
  const found: Deployment[] = [];
  for (const environment of ENVIRONMENTS) {
    const deployments = await readGitHub<
      Array<{ id: number; ref: string; created_at: string }>
    >(`${GITHUB_DEPLOYMENTS}?environment=${environment}&per_page=100`);
    deployments.sort((a, b) => b.created_at.localeCompare(a.created_at));
    let success = false;
    for (const { id, ref } of deployments) {
      const [status] = await readGitHub<
        Array<{ state: string; created_at: string }>
      >(`${GITHUB_DEPLOYMENTS}/${id}/statuses?per_page=1`);
      if (status?.state !== "success") continue;
      found.push({ environment, ref, at: status.created_at });
      success = true;
      break;
    }
    if (deployments.length && !success)
      console.error(
        `Warning: no successful deployment found for ${environment}`
      );
  }
  return found;
}

// The newest successful deployment on any destination. Comparing from the
// newest one also covers rollbacks and destinations deployed days apart.
async function deployTime(): Promise<string> {
  const deployments = await lastDeployments();
  if (!deployments.length)
    throw new Error(
      'No deployment is recorded in GitHub, pass --deploy "2026-10-28 08:00"'
    );
  const newest = deployments.reduce((a, b) => (a.at > b.at ? a : b));
  console.log(
    `# Last deploys: ${deployments.map((d) => `${d.environment} ${d.ref} at ${d.at}`).join(", ")}. Using ${newest.environment}.`
  );
  return newest.at;
}

if (command === "query") {
  const settings: Settings = {
    deploy: new Date(values.deploy ?? (await deployTime())).toISOString(),
    // Leave a few minutes for ingestion
    to: new Date(
      values.to ?? Math.floor((Date.now() - 10 * 60 * 1000) / 60000) * 60000
    ).toISOString(),
    weeks: Number(values.weeks),
    minDaily: Number(values["min-daily"]),
  };
  if (days(settings) < 1 / 24)
    console.error("Warning: less than an hour since the deploy is noisy");
  console.log(
    `# Pageviews from ${settings.deploy} to ${settings.to}, compared with the same hours ${settings.weeks} weeks before.`
  );
  console.log(
    `# Paste this into Kibana Dev Tools and save the response, then run: pnpm run traffic-drop analyze response.json\n`
  );
  console.log(devTools(pageviewsRequest(settings)));
} else if (command === "analyze") {
  if (!file) throw new Error("Pass the file with the Kibana response");
  const response = JSON.parse(readFileSync(file, "utf8"));
  // An incomplete response would make broken websites look healthy
  if (response.error || response.timed_out || response._shards?.failed)
    throw new Error(
      `Elasticsearch didn't answer completely: ${JSON.stringify(response.error ?? response._shards ?? "timed out")}`
    );
  const settings: Settings | undefined = response.aggregations?.sites?.meta;
  const buckets: Array<Record<string, any>> | undefined =
    response.aggregations?.sites?.buckets;
  if (!settings || !buckets?.length)
    throw new Error(
      "The response has no websites; save the whole response of the query"
    );
  const ws = windows(settings);
  const minWindow = minPerWindow(settings);
  const baselineNames = ws
    .filter((w) => w.name !== "current")
    .map((w) => w.name);
  const missing = ws.filter((w) => !(w.name in buckets[0]));
  if (missing.length)
    throw new Error(
      `The response has no ${missing.map((w) => w.name).join(", ")}; run the query again`
    );
  const minDrop = Number(values["min-drop"]) / 100;
  const minZ = Number(values["min-z"]);

  const sites = buckets
    .map((b) => {
      const weeks = baselineNames.map((name) => b[name]?.doc_count ?? 0);
      const baseline = median(weeks);
      const current = b.current?.doc_count ?? 0;
      // Pageview counts are roughly Poisson, so the noise is at least
      // √baseline; websites that vary more from week to week get that instead
      const noise = Math.sqrt(Math.max(baseline, variance(weeks), 1));
      const z = (current - baseline) / noise;
      return {
        hostname: b.key as string,
        baseline,
        current,
        weeks,
        drop: 1 - current / baseline,
        z,
      };
    })
    .filter((s) => s.baseline >= minWindow);

  const total = sites.reduce((sum, s) => sum + s.current, 0);
  const totalBaseline = sites.reduce((sum, s) => sum + s.baseline, 0);
  const flagged = sites
    .filter((s) => s.drop >= minDrop && s.z <= -minZ)
    .sort((a, b) => b.baseline - b.current - (a.baseline - a.current));

  console.log(
    `Pageviews from ${settings.deploy} to ${settings.to}, compared with the same hours ${settings.weeks} weeks before`
  );
  console.log(
    `${sites.length} websites above ${settings.minDaily} pageviews/day, ${response.took ?? "?"} ms in Elasticsearch`
  );
  console.log(
    `All of them together: ${total} pageviews vs ${Math.round(totalBaseline)} baseline (${((total / totalBaseline - 1) * 100).toFixed(1)}%)`
  );
  console.log(
    `${flagged.length} dropped at least ${values["min-drop"]}% with z ≤ -${values["min-z"]}\n`
  );
  if (flagged.length) {
    console.table(
      flagged.slice(0, Number(values.limit)).map((s) => ({
        hostname: s.hostname,
        current: s.current,
        baseline: s.baseline,
        drop: `${Math.round(s.drop * 100)}%`,
        z: Number(s.z.toFixed(1)),
        weeks: s.weeks.join(" "),
      }))
    );
    const [versions, errors] = followUpRequests(
      flagged.slice(0, Number(values.limit)).map((s) => s.hostname),
      ws
    );
    console.log(
      "\n# Script versions of these websites, now and a week earlier:\n"
    );
    console.log(devTools(versions));
    console.log("# Errors our scripts reported on these websites:\n");
    console.log(devTools(errors));
  }
} else {
  console.log(
    readFileSync(new URL(import.meta.url), "utf8")
      .split("\n")
      .slice(0, 12)
      .join("\n")
      .replace(/^\/\/ ?/gm, "")
  );
}
