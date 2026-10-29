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
// than --min-daily pageviews per day are ignored. The hour before the deploy is
// checked too, so a drop that started earlier isn't blamed on the deploy. The request stores these settings, so analyze reads them from
// the response.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const INDEX = "live-datapoints-*";
const FIELD = "hostname_non_robot_pageview"; // only set on non-robot pageviews
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
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
  if (!(start < end))
    throw new Error(
      `The deploy at ${deploy} is newer than ${to}; wait a few minutes after a deploy so there is a window to measure`
    );
  const shifts = [0, ...Array.from({ length: weeks }, (_, i) => i + 1)];
  const at = (time: number, w: number) =>
    new Date(time - w * 7 * DAY).toISOString();
  // current/w1..wN cover the time since the deploy, before/bw1..bwN the hour
  // before it (shorter windows only see when a drop started more sharply)
  const beforeStart = start - Math.min(end - start, HOUR);
  return [
    ...shifts.map((w) => ({
      name: w ? `w${w}` : "current",
      gte: at(start, w),
      lt: at(end, w),
    })),
    ...shifts.map((w) => ({
      name: w ? `bw${w}` : "before",
      gte: at(beforeStart, w),
      lt: at(start, w),
    })),
  ];
}

const range = ({ gte, lt }: Window) => ({
  range: { "@timestamp": { gte, lt } },
});

function pageviewsRequest(settings: Settings): Request {
  const ws = windows(settings);
  const minWindow = minPerWindow(settings);
  const baselines = ws.filter((w) => /^w\d+$/.test(w.name));
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
  const read = (withToken: boolean) =>
    fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(withToken && token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  let response = await read(true);
  // A stale token must not block reading public data
  if (token && response.status === 401) response = await read(false);
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
    `# Pageviews from ${settings.deploy} to ${settings.to} and the hour before the deploy, compared with the same hours ${settings.weeks} weeks before.`
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
      `Elasticsearch didn't answer completely: ${JSON.stringify(response.error ?? (response.timed_out ? "timed out" : response._shards))}`
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
  const names = (pattern: RegExp) =>
    ws.filter((w) => pattern.test(w.name)).map((w) => w.name);
  const afterWeeks = names(/^w\d+$/);
  const beforeWeeks = names(/^bw\d+$/);
  // A missing count would read as zero and look like a drop
  const incomplete = buckets.find((b) =>
    ws.some((w) => typeof b[w.name]?.doc_count !== "number")
  );
  if (incomplete)
    throw new Error(
      `The response has no counts for every window (${incomplete.key}); run the query again`
    );
  const minDrop = Number(values["min-drop"]) / 100;
  const minZ = Number(values["min-z"]);

  // Compares a window with the median of the same window in earlier weeks
  const compare = (
    b: Record<string, any>,
    name: string,
    weekNames: string[]
  ) => {
    const weeks = weekNames.map((week) => b[week].doc_count as number);
    const baseline = median(weeks);
    const count = b[name].doc_count as number;
    // Pageview counts are roughly Poisson, so the noise is at least
    // √baseline; websites that vary more from week to week get that instead
    const noise = Math.sqrt(Math.max(baseline, variance(weeks), 1));
    const z = (count - baseline) / noise;
    const dropped = 1 - count / baseline >= minDrop && z <= -minZ;
    return { count, baseline, weeks, drop: 1 - count / baseline, z, dropped };
  };

  const sites = buckets
    .map((b) => ({
      hostname: b.key as string,
      after: compare(b, "current", afterWeeks),
      before: compare(b, "before", beforeWeeks),
    }))
    .filter((s) => s.after.baseline >= minWindow);

  const total = sites.reduce((sum, s) => sum + s.after.count, 0);
  const totalBaseline = sites.reduce((sum, s) => sum + s.after.baseline, 0);
  const missing = (s: (typeof sites)[number]) =>
    s.after.baseline - s.after.count;
  const dropped = sites
    .filter((s) => s.after.dropped)
    .sort((a, b) => missing(b) - missing(a));
  // When did the drop start? Only one that started or got worse after the
  // deploy can be caused by it
  const when = (s: (typeof sites)[number]) => {
    if (s.before.dropped) {
      // Already down before: if after kept the same share of the two windows,
      // its count is binomial, so a much smaller count means it got worse
      const total = s.after.count + s.before.count;
      const share = s.after.baseline / (s.after.baseline + s.before.baseline);
      const spread = Math.sqrt(total * share * (1 - share));
      return spread > 0 && (s.after.count - total * share) / spread <= -minZ
        ? "worse after the deploy"
        : "already down";
    }
    return s.before.baseline > 0 && s.before.drop < minDrop
      ? "after the deploy"
      : "unclear, little data before";
  };
  const flagged = dropped
    .map((s) => ({ ...s, when: when(s) }))
    .filter((s) => s.when !== "already down");
  const alreadyDown = dropped.filter((s) => when(s) === "already down");
  const percent = (drop: number) => `${Math.round(drop * 100)}%`;

  console.log(
    `Pageviews from ${settings.deploy} to ${settings.to} and the hour before the deploy, compared with the same hours ${settings.weeks} weeks before`
  );
  console.log(
    `${sites.length} websites above ${settings.minDaily} pageviews/day, ${response.took ?? "?"} ms in Elasticsearch`
  );
  console.log(
    `All of them together: ${total} pageviews vs ${Math.round(totalBaseline)} baseline (${((total / totalBaseline - 1) * 100).toFixed(1)}%)`
  );
  console.log(
    `${flagged.length} dropped after the deploy or can't be ruled out (at least ${values["min-drop"]}% with z ≤ -${values["min-z"]})\n`
  );
  if (flagged.length)
    console.table(
      flagged.slice(0, Number(values.limit)).map((s) => ({
        hostname: s.hostname,
        current: s.after.count,
        baseline: s.after.baseline,
        drop: percent(s.after.drop),
        z: Number(s.after.z.toFixed(1)),
        weeks: s.after.weeks.join(" "),
        "hour before": `${s.before.count} vs ${s.before.baseline}`,
        when: s.when,
      }))
    );
  if (alreadyDown.length) {
    console.log(
      `\n${alreadyDown.length} were already down in the hour before the deploy and didn't get clearly worse:\n`
    );
    console.table(
      alreadyDown.slice(0, 10).map((s) => ({
        hostname: s.hostname,
        before: `${s.before.count} vs ${s.before.baseline} (-${percent(s.before.drop)})`,
        after: `${s.after.count} vs ${s.after.baseline} (-${percent(s.after.drop)})`,
      }))
    );
  }
  if (flagged.length) {
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
      .split("\nimport ")[0]
      .replace(/^\/\/ ?/gm, "")
  );
}
