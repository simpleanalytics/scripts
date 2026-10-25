// Finds websites whose pageviews dropped after a script deploy.
//
//   pnpm run traffic-drop query --from 2026-10-28T08:00:00Z [--to <iso>]
//     Prints a request to paste into Kibana Dev Tools. Copy the whole
//     response into a file, for example response.json.
//   pnpm run traffic-drop analyze response.json --from <iso> --to <iso>
//     Lists the websites with a significant drop, and prints follow-up
//     requests for their script versions and script errors.
//
// The current window (--from until --to) is compared with the same window
// 1-4 weeks earlier, so weekdays and hours line up. Websites with fewer than
// --min-daily pageviews per day in the baseline are ignored.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const INDEX = "live-datapoints-*";
const FIELD = "hostname_non_robot_pageview"; // only set on non-robot pageviews
const DAY = 24 * 60 * 60 * 1000;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string" },
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
type Request = { path: string; body: unknown };

const devTools = ({ path, body }: Request) =>
  `GET ${path}\n${JSON.stringify(body, null, 2)}\n`;

function windows(from: string, to: string, weeks: number): Window[] {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!(start < end)) throw new Error("--from must be before --to");
  return [0, ...Array.from({ length: weeks }, (_, i) => i + 1)].map((w) => ({
    name: w ? `w${w}` : "current",
    gte: new Date(start - w * 7 * DAY).toISOString(),
    lt: new Date(end - w * 7 * DAY).toISOString(),
  }));
}

const range = ({ gte, lt }: Window) => ({
  range: { "@timestamp": { gte, lt } },
});

function pageviewsRequest(ws: Window[], minWindow: number): Request {
  const baselines = ws.filter((w) => w.name !== "current");
  return {
    // filter_path keeps the response small enough to copy from Kibana
    path: `${INDEX}/_search?request_cache=true&filter_path=took,timed_out,_shards.failed,aggregations.sites.buckets.key,aggregations.sites.buckets.*.doc_count`,
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

function settings() {
  const from = values.from;
  if (!from) throw new Error("--from is required, for example the deploy time");
  // Leave a few minutes for ingestion when --to is omitted
  const to =
    values.to ??
    new Date(
      Math.floor((Date.now() - 10 * 60 * 1000) / 60000) * 60000
    ).toISOString();
  const weeks = Number(values.weeks);
  const ws = windows(from, to, weeks);
  const days = (Date.parse(to) - Date.parse(from)) / DAY;
  const minWindow = Number(values["min-daily"]) * days;
  return { from, to, weeks, ws, days, minWindow };
}

if (command === "query") {
  const { ws, days, minWindow } = settings();
  if (days < 1 / 24) console.error("Warning: windows under an hour are noisy");
  console.log(
    `# Paste into Kibana Dev Tools. Windows: ${ws.map((w) => `${w.name} ${w.gte} → ${w.lt}`).join(", ")}`
  );
  console.log(
    `# Websites need ${Math.ceil(minWindow)}+ pageviews in a baseline window (${values["min-daily"]}/day)\n`
  );
  console.log(devTools(pageviewsRequest(ws, minWindow)));
  console.log(
    `# Then: pnpm run traffic-drop analyze response.json --from ${values.from} --to ${ws[0].lt} --weeks ${values.weeks} --min-daily ${values["min-daily"]}`
  );
} else if (command === "analyze") {
  if (!file) throw new Error("Pass the file with the Kibana response");
  if (!values.to)
    throw new Error(
      "Pass the same --to as the query, printed at the end of `query`"
    );
  const { ws, minWindow } = settings();
  const response = JSON.parse(readFileSync(file, "utf8"));
  // An incomplete response would make broken websites look healthy
  if (response.error || response.timed_out || response._shards?.failed)
    throw new Error(
      `Elasticsearch didn't answer completely: ${JSON.stringify(response.error ?? response._shards ?? "timed out")}`
    );
  const buckets: Array<Record<string, any>> | undefined =
    response.aggregations?.sites?.buckets;
  if (!buckets?.length)
    throw new Error("The response has no websites; paste the whole response");
  const baselineNames = ws
    .filter((w) => w.name !== "current")
    .map((w) => w.name);
  const missing = ws.filter((w) => !(w.name in buckets[0]));
  if (missing.length)
    throw new Error(
      `The response has no ${missing.map((w) => w.name).join(", ")}; use the same --weeks as the query`
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
    `${sites.length} websites above ${values["min-daily"]} pageviews/day, ${response.took ?? "?"} ms in Elasticsearch`
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
