import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ScriptChoice = "default" | "auto-events";
export type Destination = "cdn" | "caddy";
export type FileStatus = "create" | "replace" | "unchanged" | "blocked";
type FileKind = "javascript" | "source-map";
type ContentTransform =
  | "none"
  | "cdn-sri-javascript"
  | "cdn-sri-map"
  | "caddy-ssi";

// Every script is deployed with all of its files (latest, SRI, light, proxy),
// so a destination never runs a mix of releases for one script
export interface DeploySelections {
  scripts: ScriptChoice[];
  destinations: Destination[];
}

export interface DeployFile {
  destination: Destination;
  immutable: boolean;
  kind: FileKind;
  localPath: string;
  remotePath: string;
  transform: ContentTransform;
  version?: number;
}

export interface PreparedFile extends DeployFile {
  localContent: Buffer;
  localHeader: string | null;
}

export interface PreviewFile extends PreparedFile {
  remoteContent: Buffer | null;
  remoteHeader: string | null;
  status: FileStatus;
}

interface CommandResult {
  stdout: Buffer;
  stderr: Buffer;
}

interface CdnCredentials {
  accessKey: string;
  accountKey: string;
}

interface DeploymentResult {
  completed: string[];
  skipped: string[];
  failed: string[];
}

interface Release {
  archiveDigest: string | null;
  archiveUrl: string;
  publishedAt: string;
  tag: string;
  url: string;
}

const ROOT = dirname(fileURLToPath(import.meta.url));
// Caddy injects the request hostname at serve time with its templates
// directive, so the nginx SSI directives are rewritten to Go template
// placeholders (or their static defaults) on upload.
const CADDY_HOST = "user@esapp05.simpleanalytics.com";
const CADDY_ROOT = "/home/user/apps/custom-domains-www";
const CADDY_SSI_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['<!--# echo var="http_host" default="" -->', "{{.Req.Host}}"],
  // Substituted from the proxy-product query parameters at serve time
  // (docs.simpleanalytics.com/proxy), like nginx's `set $proxy_hostname
  // $arg_hostname`. Custom-domain requests carry no such args, so these
  // render as "" there — matching the old nginx vhost's defined-but-empty
  // variables (its SSI defaults never applied). Go's Query.Get
  // percent-decodes, which covers nginx's %2F-rewrite hack too. Escape the
  // decoded values before inserting them into the script's string literal.
  [
    '<!--# echo var="proxy_hostname" default="" -->',
    '{{js (.Req.URL.Query.Get "hostname")}}',
  ],
  [
    '<!--# echo var="proxy_path" default="/simple" -->',
    '{{js (.Req.URL.Query.Get "path")}}',
  ],
];

const CDN_PUBLIC_ROOT = "https://scripts.simpleanalyticscdn.com";
const CDN_STORAGE_ROOT = "https://storage.bunnycdn.com/sa-cdn";
const CDN_PURGE_URL =
  "https://api.bunny.net/purge?url=https://simpleanalyticscdn.b-cdn.net/*";
const GITHUB_REPOSITORY = "simpleanalytics/scripts";
const GITHUB_API_ROOT = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
// GitHub deployment environments that record which release each script runs
// per destination, shown at github.com/simpleanalytics/scripts/deployments.
const ENVIRONMENTS: Record<
  Destination,
  Record<ScriptChoice, { name: string; url?: string }>
> = {
  caddy: {
    default: { name: "custom-domains" },
    "auto-events": { name: "custom-domains-auto-events" },
  },
  cdn: {
    default: { name: "cdn", url: `${CDN_PUBLIC_ROOT}/latest.js` },
    "auto-events": {
      name: "cdn-auto-events",
      url: `${CDN_PUBLIC_ROOT}/auto-events.js`,
    },
  },
};
export const HEADER_PATTERN =
  /^\/\* Simple Analytics - Privacy(?: friendly|-first) analytics \(docs\.simpleanalytics\.com\/[^;]+; \d{4}-\d{2}-\d{2}; [0-9a-f]{4}(?:; SRI-version)?(?:; v\d+)?\) \*\/$/;

const ansi = {
  bold: (value: string) => color("1", value),
  cyan: (value: string) => color("36", value),
  dim: (value: string) => color("2", value),
  green: (value: string) => color("32", value),
  red: (value: string) => color("31", value),
  yellow: (value: string) => color("33", value),
};

function color(code: string, value: string): string {
  return process.stdout.isTTY ? `\u001B[${code}m${value}\u001B[0m` : value;
}

function addScriptPair(
  files: DeployFile[],
  input: {
    destination: Destination;
    immutable?: boolean;
    localPath: string;
    remotePath: string;
    sourceMap?: boolean;
    transform?: ContentTransform;
    version?: number;
  },
): void {
  const {
    destination,
    immutable = false,
    localPath,
    remotePath,
    sourceMap = true,
    transform = "none",
    version,
  } = input;

  files.push({
    destination,
    immutable,
    kind: "javascript",
    localPath,
    remotePath,
    transform,
    version,
  });

  if (!sourceMap) return;

  files.push({
    destination,
    immutable,
    kind: "source-map",
    localPath: `${localPath}.map`,
    remotePath: `${remotePath}.map`,
    // Source maps carry the SSI directive too, so caddy-ssi applies to both.
    transform:
      transform === "cdn-sri-javascript"
        ? "cdn-sri-map"
        : transform === "caddy-ssi"
          ? "caddy-ssi"
          : "none",
    version,
  });
}

export function createManifest(
  selections: DeploySelections,
  version: number,
): DeployFile[] {
  const files: DeployFile[] = [];
  const hasScript = (choice: ScriptChoice) => selections.scripts.includes(choice);
  const hasDestination = (destination: Destination) =>
    selections.destinations.includes(destination);
  const hasDefault = hasScript("default");

  const addCaddyPair = (
    input: Omit<Parameters<typeof addScriptPair>[1], "destination">,
  ) => {
    if (!hasDestination("caddy")) return;
    addScriptPair(files, {
      ...input,
      destination: "caddy",
      transform: "caddy-ssi",
    });
  };

  if (hasDefault) {
    if (hasDestination("cdn")) {
      addScriptPair(files, {
        destination: "cdn",
        localPath: "dist/latest/latest.js",
        remotePath: "latest.js",
      });
      addScriptPair(files, {
        destination: "cdn",
        localPath: "dist/latest/hello.js",
        remotePath: "hello.js",
      });
      addScriptPair(files, {
        destination: "cdn",
        localPath: "dist/latest/latest.dev.js",
        remotePath: "latest.dev.js",
        sourceMap: false,
      });
    }

    addCaddyPair({
      localPath: "dist/latest/custom/latest.js",
      remotePath: "latest.js",
    });
    addCaddyPair({
      localPath: "dist/latest/custom/e.js",
      remotePath: "events.js",
    });
    addCaddyPair({
      localPath: "dist/latest/custom/latest.dev.js",
      remotePath: "latest.dev.js",
      sourceMap: false,
    });
  }

  if (hasDefault) {
    if (hasDestination("cdn")) {
      addScriptPair(files, {
        destination: "cdn",
        immutable: true,
        localPath: `dist/v${version}/app.js`,
        remotePath: `sri/v${version}.js`,
        transform: "cdn-sri-javascript",
        version,
      });
    }

    addCaddyPair({
      immutable: true,
      localPath: `dist/v${version}/custom/app.js`,
      remotePath: `v${version}/app.js`,
      version,
    });
  }

  if (hasDefault) {
    if (hasDestination("cdn")) {
      addScriptPair(files, {
        destination: "cdn",
        localPath: "dist/latest/light.js",
        remotePath: "light.js",
      });
    }

    addCaddyPair({
      localPath: "dist/latest/custom/light.js",
      remotePath: "light.js",
    });

    addCaddyPair({
      immutable: true,
      localPath: `dist/v${version}/custom/light.js`,
      remotePath: `v${version}/light.js`,
      version,
    });
  }

  if (hasDefault && hasDestination("caddy")) {
    addCaddyPair({
      localPath: "dist/latest/custom/proxy.js",
      remotePath: "proxy.js",
    });

    addCaddyPair({
      immutable: true,
      localPath: `dist/v${version}/custom/proxy.js`,
      remotePath: `v${version}/proxy.js`,
      version,
    });
  }

  if (hasScript("auto-events")) {
    if (hasDestination("cdn")) {
      addScriptPair(files, {
        destination: "cdn",
        localPath: "dist/latest/auto-events.js",
        remotePath: "auto-events.js",
      });
    }

    addCaddyPair({
      localPath: "dist/latest/custom/auto-events.js",
      remotePath: "auto-events.js",
    });

    addCaddyPair({
      immutable: true,
      localPath: `dist/v${version}/custom/auto-events.js`,
      remotePath: `v${version}/auto-events.js`,
      version,
    });
  }

  return files;
}

export function latestVersionFromNames(names: string[]): number | undefined {
  const versions = names
    .map((name) => /^v(\d+)$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .filter(Number.isSafeInteger)
    .sort((left, right) => right - left);

  return versions[0];
}

async function discoverSriVersion(root: string): Promise<number> {
  const version = latestVersionFromNames(await readdir(resolve(root, "dist")));
  if (version === undefined) {
    throw new Error("No versioned SRI directory exists in the release.");
  }
  return version;
}

export function transformContent(file: DeployFile, content: Buffer): Buffer {
  if (file.transform === "none") return content;

  if (file.transform === "caddy-ssi") {
    let source = content.toString("utf8");
    // Caddy's templates directive would choke on (or execute) stray actions,
    // turning a bad build into per-request 500s — fail the deploy instead.
    if (source.includes("{{")) {
      throw new Error(
        `${file.localPath} contains Go template delimiters ("{{"); Caddy's templates directive cannot serve it safely.`,
      );
    }
    for (const [pattern, replacement] of CADDY_SSI_REPLACEMENTS) {
      source = source.replaceAll(pattern, replacement);
    }
    if (source.includes("<!--#")) {
      throw new Error(
        `${file.localPath} contains an SSI directive with no Caddy replacement.`,
      );
    }
    return Buffer.from(source);
  }

  if (file.version === undefined) {
    throw new Error(`Missing version for ${file.localPath}.`);
  }

  const replacement = `v${file.version}.js`;
  const source = content.toString("utf8");

  if (file.transform === "cdn-sri-javascript") {
    return Buffer.from(
      source.replaceAll("sourceMappingURL=app.js.map", `sourceMappingURL=${replacement}.map`),
    );
  }

  return Buffer.from(source.replaceAll("app.js", replacement));
}

export function firstLine(content: Buffer): string {
  return content.toString("utf8").split(/\r?\n/, 1)[0] ?? "";
}

export function classifyContent(
  localContent: Buffer,
  remoteContent: Buffer | null,
  immutable: boolean,
): FileStatus {
  if (remoteContent === null) return "create";
  if (localContent.equals(remoteContent)) return "unchanged";
  return immutable ? "blocked" : "replace";
}

export function repositoryPolicy(
  dryRun: boolean,
  dirty: boolean,
): "clean" | "warn" {
  if (!dirty) return "clean";
  if (dryRun) return "warn";
  throw new Error(
    "The scripts repository has uncommitted changes. Commit and test them before deploying.",
  );
}

async function prepareFiles(
  files: DeployFile[],
  root: string,
): Promise<PreparedFile[]> {
  return Promise.all(
    files.map(async (file) => {
      let source: Buffer;
      try {
        source = await readFile(resolve(root, file.localPath));
      } catch (error) {
        throw new Error(`Missing deployment artifact: ${file.localPath}`, {
          cause: error,
        });
      }

      const localContent = transformContent(file, source);
      const localHeader = file.kind === "javascript" ? firstLine(localContent) : null;

      if (localHeader !== null && !HEADER_PATTERN.test(localHeader)) {
        throw new Error(`Invalid script header in ${file.localPath}: ${localHeader}`);
      }

      if (
        file.immutable &&
        file.kind === "javascript" &&
        (!localHeader?.includes("; SRI-version;") ||
          !localHeader.includes(`; v${file.version})`))
      ) {
        throw new Error(
          `Immutable artifact ${file.localPath} is not marked as SRI v${file.version}.`,
        );
      }

      return { ...file, localContent, localHeader };
    }),
  );
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 60_000,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      };
      if (code === 0) {
        resolvePromise(result);
        return;
      }
      const detail = result.stderr.toString("utf8").trim();
      reject(
        new Error(
          `${command} failed${signal ? ` (${signal})` : ` with exit code ${code}`}${
            detail ? `: ${detail}` : ""
          }`,
        ),
      );
    });
  });
}

async function isRepositoryDirty(): Promise<boolean> {
  const { stdout } = await runCommand("git", ["status", "--porcelain"]);
  return stdout.length > 0;
}

function encodedRemotePath(remotePath: string): string {
  return remotePath.split("/").map(encodeURIComponent).join("/");
}

async function readCdnFile(
  remotePath: string,
  accessKey?: string,
): Promise<Buffer | null> {
  const root = accessKey ? CDN_STORAGE_ROOT : CDN_PUBLIC_ROOT;
  const response = await fetch(`${root}/${encodedRemotePath(remotePath)}`, {
    cache: "no-store",
    headers: accessKey
      ? { AccessKey: accessKey }
      : { "Cache-Control": "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Unable to inspect CDN file ${remotePath}: HTTP ${response.status}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function readGitHub<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_ROOT}/${path}`, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Unable to read GitHub ${path}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function listReleases(): Promise<Release[]> {
  const releases = await readGitHub<
    Array<{
      assets: Array<{
        browser_download_url: string;
        digest: string | null;
        name: string;
      }>;
      html_url: string;
      published_at: string;
      tag_name: string;
    }>
  >("releases?per_page=100");

  return releases.flatMap((release) => {
    const archive = release.assets.find(
      (asset) => asset.name === `scripts-${release.tag_name}.tar.gz`,
    );
    // Without a recorded digest the download can't be verified
    if (!archive?.digest) return [];
    return [
      {
        archiveDigest: archive.digest,
        archiveUrl: archive.browser_download_url,
        publishedAt: release.published_at,
        tag: release.tag_name,
        url: release.html_url,
      },
    ];
  });
}

// Downloads the release archive built and tested by the Release workflow,
// checks it against the digest GitHub recorded, and extracts it.
async function downloadRelease(release: Release): Promise<string> {
  const response = await fetch(release.archiveUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Unable to download ${release.tag}: HTTP ${response.status}`);
  }
  const archive = Buffer.from(await response.arrayBuffer());
  const digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
  if (digest !== release.archiveDigest) {
    throw new Error(
      `The ${release.tag} archive does not match the digest GitHub recorded (${
        release.archiveDigest ?? "none"
      }).`,
    );
  }

  const directory = await mkdtemp(join(tmpdir(), "sa-release-"));
  try {
    const archivePath = join(directory, "release.tar.gz");
    await writeFile(archivePath, archive);
    await runCommand("tar", ["-xzf", archivePath, "-C", directory]);
    return directory;
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
}

function assertSafeRemotePath(remotePath: string): void {
  if (!/^[a-zA-Z0-9._/-]+$/.test(remotePath) || remotePath.startsWith("/")) {
    throw new Error(`Unsafe remote path: ${remotePath}`);
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function readCaddyFiles(
  remotePaths: string[],
): Promise<Map<string, Buffer | null>> {
  const uniquePaths = [...new Set(remotePaths)];
  if (uniquePaths.length === 0) return new Map();
  uniquePaths.forEach(assertSafeRemotePath);

  const pathArguments = uniquePaths.map(shellQuote).join(" ");
  const command = [
    `for relative_path in ${pathArguments}; do`,
    `printf '__SA_FILE__:%s\\n' "$relative_path";`,
    `full_path=${shellQuote(CADDY_ROOT)}/$relative_path;`,
    'if test -f "$full_path"; then',
    `printf '__SA_DATA__:'; base64 "$full_path" | tr -d '\\n'; printf '\\n';`,
    "else printf '__SA_MISSING__\\n'; fi;",
    "done",
  ].join(" ");
  const { stdout } = await runCommand(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", CADDY_HOST, command],
    { timeout: 45_000 },
  );

  const result = new Map<string, Buffer | null>();
  let currentPath: string | undefined;
  for (const line of stdout.toString("utf8").split("\n")) {
    if (line.startsWith("__SA_FILE__:")) {
      currentPath = line.slice("__SA_FILE__:".length);
      continue;
    }
    if (line === "__SA_MISSING__" && currentPath !== undefined) {
      result.set(currentPath, null);
      currentPath = undefined;
      continue;
    }
    if (line.startsWith("__SA_DATA__:") && currentPath !== undefined) {
      result.set(
        currentPath,
        Buffer.from(line.slice("__SA_DATA__:".length), "base64"),
      );
      currentPath = undefined;
    }
  }

  for (const remotePath of uniquePaths) {
    if (!result.has(remotePath)) {
      throw new Error(`Caddy server did not return a result for ${remotePath}.`);
    }
  }
  return result;
}

async function inspectFiles(files: PreparedFile[]): Promise<PreviewFile[]> {
  const pathsFor = (destination: Destination) =>
    files
      .filter((file) => file.destination === destination)
      .map((file) => file.remotePath);

  const [cdnEntries, caddyFiles] = await Promise.all([
    Promise.all(
      pathsFor("cdn").map(
        async (remotePath) => [remotePath, await readCdnFile(remotePath)] as const,
      ),
    ),
    readCaddyFiles(pathsFor("caddy")),
  ]);
  const cdnFiles = new Map(cdnEntries);

  return files.map((file) => {
    const remoteFiles = file.destination === "cdn" ? cdnFiles : caddyFiles;
    const remoteContent = remoteFiles.get(file.remotePath) ?? null;
    return {
      ...file,
      remoteContent,
      remoteHeader:
        file.kind === "javascript" && remoteContent !== null
          ? firstLine(remoteContent)
          : null,
      status: classifyContent(file.localContent, remoteContent, file.immutable),
    };
  });
}

function remoteLabel(file: DeployFile): string {
  if (file.destination === "cdn") return `${CDN_PUBLIC_ROOT}/${file.remotePath}`;
  return `${CADDY_HOST}:${CADDY_ROOT}/${file.remotePath}`;
}

function statusLabel(status: FileStatus): string {
  if (status === "create") return ansi.green("CREATE");
  if (status === "replace") return ansi.yellow("CHANGE");
  if (status === "blocked") return ansi.red("BLOCKED");
  return ansi.dim("SKIP");
}

export function summarize(files: PreviewFile[]): Record<FileStatus, number> {
  return files.reduce<Record<FileStatus, number>>(
    (counts, file) => {
      counts[file.status] += 1;
      return counts;
    },
    { blocked: 0, create: 0, replace: 0, unchanged: 0 },
  );
}

function renderPreview(
  files: PreviewFile[],
  selections: DeploySelections,
  dryRun: boolean,
  version?: number,
): void {
  note(
    [
      `Mode: ${dryRun ? "Dry run" : "Deploy"}`,
      `Scripts: ${selections.scripts.join(", ")}`,
      `Destinations: ${selections.destinations.join(", ")}`,
      version === undefined ? null : `SRI version: v${version}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    "Deployment preview",
  );

  const destinationLabels: Record<Destination, string> = {
    caddy: "Caddy",
    cdn: "CDN",
  };
  for (const destination of ["cdn", "caddy"] as const) {
    const destinationFiles = files.filter(
      (file) => file.destination === destination,
    );
    if (destinationFiles.length === 0) continue;

    console.log(`\n  ${ansi.bold(destinationLabels[destination])}`);
    for (const file of destinationFiles) {
      console.log(
        `  ${statusLabel(file.status).padEnd(process.stdout.isTTY ? 19 : 8)} ${ansi.cyan(
          file.localPath,
        )}`,
      );
      console.log(`           ${ansi.dim(`→ ${remoteLabel(file)}`)}`);

      if (file.kind !== "javascript") continue;
      if (file.status === "unchanged") {
        console.log(`           ${ansi.dim(`= ${file.localHeader}`)}`);
        continue;
      }
      const previous = file.remoteHeader ?? "<new file>";
      console.log(`           ${ansi.red(`- ${previous}`)}`);
      console.log(`           ${ansi.green(`+ ${file.localHeader}`)}`);
    }
  }

  const counts = summarize(files);
  note(
    [
      `Create: ${counts.create}`,
      `Change: ${counts.replace}`,
      `Skip: ${counts.unchanged}`,
      `Blocked: ${counts.blocked}`,
    ].join("  ·  "),
    "Files",
  );
}

async function renderRelease(
  release: Release,
  selections: DeploySelections,
): Promise<void> {
  const lines = [
    `${release.tag}, published ${release.publishedAt.slice(0, 10)}`,
    release.url,
  ];
  const environments = selections.destinations.flatMap((destination) =>
    selections.scripts.map((script) => ENVIRONMENTS[destination][script].name),
  );
  for (const environment of environments) {
    const deployments = (
      await readGitHub<Array<{ created_at: string; id: number; ref: string }>>(
        `deployments?environment=${environment}&per_page=10`,
      )
    ).sort((a, b) => b.created_at.localeCompare(a.created_at));

    // A failed attempt doesn't change what runs, so the newest success does
    let current: (typeof deployments)[number] | undefined;
    for (const deployment of deployments) {
      const [status] = await readGitHub<Array<{ state: string }>>(
        `deployments/${deployment.id}/statuses?per_page=1`,
      );
      if (status?.state === "success") {
        current = deployment;
        break;
      }
      lines.push(
        `${environment}: ${deployment.ref} ${status?.state ?? "without status"} on ${deployment.created_at.slice(
          0,
          10,
        )}`,
      );
    }
    if (!current) {
      lines.push(
        `${environment}: ${
          deployments.length
            ? `no successful deployment in the last ${deployments.length}`
            : "no recorded deployment"
        } → ${release.tag}`,
      );
      continue;
    }

    lines.push(
      `${environment}: ${current.ref} (deployed ${current.created_at.slice(
        0,
        10,
      )}) → ${release.tag}`,
    );
    if (current.ref !== release.tag) {
      lines.push(
        `  https://github.com/${GITHUB_REPOSITORY}/compare/${current.ref}...${release.tag}`,
      );
    }
  }
  note(lines.join("\n"), "Release");
}

// Records the deployment per destination so GitHub shows what is live. The
// command defaults to gh; DEPLOY_GH_COMMAND can point to a token broker.
async function recordDeployments(
  release: Release,
  selections: DeploySelections,
  state: "success" | "failure",
): Promise<void> {
  const [command, ...prefix] = (process.env.DEPLOY_GH_COMMAND || "gh")
    .trim()
    .split(/\s+/);
  const environments = selections.destinations.flatMap((destination) =>
    selections.scripts.map((script) => ({
      script,
      ...ENVIRONMENTS[destination][script],
    })),
  );

  for (const environment of environments) {
    const progress = spinner();
    progress.start(`Recording ${release.tag} on ${environment.name} in GitHub`);
    try {
      const { stdout } = await runCommand(
        command,
        [
          ...prefix,
          "api",
          `repos/${GITHUB_REPOSITORY}/deployments`,
          "-f",
          `ref=${release.tag}`,
          "-f",
          `environment=${environment.name}`,
          "-f",
          `description=${environment.script}`,
          "-F",
          "auto_merge=false",
          "-F",
          "production_environment=true",
          "-f",
          "required_contexts[]",
        ],
        { timeout: 120_000 },
      );
      const { id } = JSON.parse(stdout.toString("utf8")) as { id: number };
      await runCommand(
        command,
        [
          ...prefix,
          "api",
          `repos/${GITHUB_REPOSITORY}/deployments/${id}/statuses`,
          "-f",
          `state=${state}`,
          "-f",
          `log_url=${release.url}`,
          ...(environment.url ? ["-f", `environment_url=${environment.url}`] : []),
        ],
        { timeout: 120_000 },
      );
      progress.stop(`Recorded ${release.tag} on ${environment.name} as ${state}`);
    } catch (error) {
      progress.error(`Unable to record ${release.tag} on ${environment.name}`);
      log.warn(
        `${error instanceof Error ? error.message : String(error)}\nRun the deployment of ${
          release.tag
        } again: unchanged files are skipped and the deployment is recorded.`,
      );
    }
  }
}

function cdnCredentials(): CdnCredentials {
  const accessKey = process.env.BUNNY_SCRIPTS_ACCESS_KEY;
  const accountKey = process.env.BUNNY_SCRIPTS_ACCOUNT_KEY;
  if (!accessKey || !accountKey) {
    throw new Error(
      "BUNNY_SCRIPTS_ACCESS_KEY and BUNNY_SCRIPTS_ACCOUNT_KEY must be set in .env for a CDN deployment.",
    );
  }
  return { accessKey, accountKey };
}

async function readCurrentFile(
  file: PreparedFile,
  credentials?: CdnCredentials,
): Promise<Buffer | null> {
  if (file.destination === "cdn") {
    return readCdnFile(file.remotePath, credentials?.accessKey);
  }
  const remoteFiles = await readCaddyFiles([file.remotePath]);
  return remoteFiles.get(file.remotePath) ?? null;
}

async function uploadCdnFile(
  file: PreparedFile,
  credentials: CdnCredentials,
): Promise<void> {
  const response = await fetch(
    `${CDN_STORAGE_ROOT}/${encodedRemotePath(file.remotePath)}`,
    {
      body: new Uint8Array(file.localContent),
      headers: { AccessKey: credentials.accessKey },
      method: "PUT",
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (response.status !== 201) {
    throw new Error(
      `Unable to upload CDN file ${file.remotePath}: HTTP ${response.status} ${await response.text()}`,
    );
  }
}

async function uploadCaddyFile(file: PreparedFile): Promise<void> {
  assertSafeRemotePath(file.remotePath);

  // SSI directives become Caddy template placeholders, so upload the
  // transformed content from a temporary file.
  const remoteDirectory = dirname(`${CADDY_ROOT}/${file.remotePath}`);
  await runCommand("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    CADDY_HOST,
    `mkdir -p -- ${shellQuote(remoteDirectory)}`,
  ]);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sa-deploy-"));
  try {
    const temporaryPath = join(temporaryDirectory, basename(file.remotePath));
    await writeFile(temporaryPath, file.localContent);

    const args = ["--quiet"];
    if (file.immutable) args.push("--ignore-existing");
    args.push(temporaryPath, `${CADDY_HOST}:${CADDY_ROOT}/${file.remotePath}`);
    await runCommand("rsync", args, { timeout: 120_000 });
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function purgeCdn(credentials: CdnCredentials): Promise<void> {
  const response = await fetch(CDN_PURGE_URL, {
    headers: { AccessKey: credentials.accountKey },
    method: "POST",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Unable to purge Bunny CDN: HTTP ${response.status}`);
  }
}

async function verifyUploadedFiles(
  files: PreparedFile[],
  credentials?: CdnCredentials,
): Promise<void> {
  const cdnFiles = files.filter((file) => file.destination === "cdn");
  const caddyFiles = files.filter((file) => file.destination === "caddy");
  const [cdnContents, caddyContents] = await Promise.all([
    Promise.all(
      cdnFiles.map((file) => readCdnFile(file.remotePath, credentials?.accessKey)),
    ),
    readCaddyFiles(caddyFiles.map((file) => file.remotePath)),
  ]);

  for (const [index, file] of cdnFiles.entries()) {
    if (!cdnContents[index]?.equals(file.localContent)) {
      throw new Error(`CDN verification failed for ${file.remotePath}.`);
    }
  }
  for (const file of caddyFiles) {
    if (!caddyContents.get(file.remotePath)?.equals(file.localContent)) {
      throw new Error(`Caddy verification failed for ${file.remotePath}.`);
    }
  }
}

class DeploymentFailure extends Error {
  result: DeploymentResult;

  constructor(message: string, result: DeploymentResult, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeploymentFailure";
    this.result = result;
  }
}

async function deployFiles(
  previews: PreviewFile[],
  credentials: CdnCredentials | undefined,
  result: DeploymentResult,
): Promise<DeploymentResult> {
  const filesToWrite: PreparedFile[] = [];

  try {
    for (const file of previews) {
      if (file.status === "unchanged") {
        result.skipped.push(remoteLabel(file));
        continue;
      }
      if (file.status === "blocked") {
        throw new Error(`Immutable SRI file already differs: ${remoteLabel(file)}`);
      }

      if (file.immutable) {
        const current = await readCurrentFile(file, credentials);
        const currentStatus = classifyContent(file.localContent, current, true);
        if (currentStatus === "unchanged") {
          result.skipped.push(remoteLabel(file));
          continue;
        }
        if (currentStatus === "blocked") {
          result.failed.push(remoteLabel(file));
          throw new Error(
            `Immutable SRI file changed after preview: ${remoteLabel(file)}`,
          );
        }
      }

      const progress = spinner();
      progress.start(`Uploading ${file.remotePath} to ${file.destination}`);
      try {
        if (file.destination === "cdn") {
          if (!credentials) throw new Error("Missing CDN credentials.");
          await uploadCdnFile(file, credentials);
        } else {
          await uploadCaddyFile(file);
        }
        progress.stop(`Uploaded ${file.remotePath} to ${file.destination}`);
      } catch (error) {
        progress.error(`Failed ${file.remotePath} on ${file.destination}`);
        result.failed.push(remoteLabel(file));
        throw error;
      }

      result.completed.push(remoteLabel(file));
      filesToWrite.push(file);
    }

    if (filesToWrite.length > 0) {
      const progress = spinner();
      progress.start("Verifying uploaded files");
      try {
        await verifyUploadedFiles(filesToWrite, credentials);
        progress.stop("Verified uploaded files");
      } catch (error) {
        progress.error("Uploaded-file verification failed");
        result.failed.push("Uploaded-file verification");
        throw error;
      }
    }

    if (filesToWrite.some((file) => file.destination === "cdn")) {
      if (!credentials) throw new Error("Missing CDN credentials.");
      const progress = spinner();
      progress.start("Purging Bunny CDN");
      try {
        await purgeCdn(credentials);
        progress.stop("Purged Bunny CDN");
      } catch (error) {
        progress.error("Bunny CDN purge failed");
        result.failed.push("Bunny CDN purge");
        throw error;
      }
    }

    return result;
  } catch (error) {
    throw new DeploymentFailure("Deployment stopped after a failed operation.", result, {
      cause: error,
    });
  }
}

function renderDeploymentResult(result: DeploymentResult): void {
  note(
    [
      `Completed: ${result.completed.length}`,
      `Skipped: ${result.skipped.length}`,
      `Failed: ${result.failed.length}`,
    ].join("  ·  "),
    "Deployment result",
  );
}

function selectedValue<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Deployment cancelled.");
    process.exit(0);
  }
  return value;
}

async function main(): Promise<void> {
  intro("Simple Analytics script deployment");

  const caddyOnly = process.argv.includes("--caddy-only");
  if (caddyOnly) {
    log.info("Deploying only to Caddy (--caddy-only).");
  }

  const dryRun = selectedValue(
    await confirm({
      initialValue: true,
      message: "Do you want to dry run this?",
    }),
  );
  const dirty = await isRepositoryDirty();
  if (repositoryPolicy(dryRun, dirty) === "warn") {
    log.warn(
      "The repository has uncommitted changes. This dry run uses the local deployment code.",
    );
  }

  const releases = await listReleases();
  if (releases.length === 0) {
    throw new Error("No GitHub release has a scripts-vN.tar.gz archive yet.");
  }
  const release = selectedValue(
    await select<Release>({
      message: "Which release do you want to deploy?",
      options: releases.map((release) => ({
        hint: `published ${release.publishedAt.slice(0, 10)}`,
        label: release.tag,
        value: release,
      })),
    }),
  );

  const scripts = selectedValue(
    await multiselect<ScriptChoice>({
      initialValues: ["default", "auto-events"],
      message: "Scripts to deploy",
      options: [
        { label: "Default embed (latest, SRI, light, proxy)", value: "default" },
        { label: "Auto-events", value: "auto-events" },
      ],
      required: true,
    }),
  );
  const destinations: Destination[] = caddyOnly
    ? ["caddy"]
    : selectedValue(
        await multiselect<Destination>({
          initialValues: ["cdn", "caddy"],
          message: "Where do you want to deploy these scripts?",
          options: [
            { label: "CDN", value: "cdn" },
            { label: "Caddy", value: "caddy" },
          ],
          required: true,
        }),
      );

  const selections = { destinations, scripts };
  const download = spinner();
  download.start(`Downloading ${release.tag}`);
  let directory: string;
  try {
    directory = await downloadRelease(release);
    download.stop(`Downloaded and verified ${release.tag}`);
  } catch (error) {
    download.error(`Unable to download ${release.tag}`);
    throw error;
  }

  let version: number;
  let preparedFiles: PreparedFile[];
  try {
    version = await discoverSriVersion(directory);
    preparedFiles = await prepareFiles(createManifest(selections, version), directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }

  const inspection = spinner();
  inspection.start("Inspecting deployed files");
  let previews: PreviewFile[];
  try {
    previews = await inspectFiles(preparedFiles);
    inspection.stop("Inspected deployed files");
  } catch (error) {
    inspection.error("Unable to inspect deployed files");
    throw error;
  }
  await renderRelease(release, selections);
  renderPreview(previews, selections, dryRun, version);

  const counts = summarize(previews);
  if (counts.blocked > 0) {
    cancel(
      `Deployment blocked: ${counts.blocked} immutable SRI file${
        counts.blocked === 1 ? "" : "s"
      } already exist with different content.`,
    );
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    outro("Dry run complete—nothing changed.");
    return;
  }

  const credentials = destinations.includes("cdn") ? cdnCredentials() : undefined;
  const shouldDeploy = selectedValue(
    await confirm({
      initialValue: false,
      message: `Deploy ${counts.create + counts.replace} changed files now?`,
    }),
  );
  if (!shouldDeploy) {
    cancel("Deployment cancelled—nothing changed.");
    return;
  }

  // Deploy and record one destination at a time, so a failure on one doesn't
  // mark the other as failed
  const result: DeploymentResult = { completed: [], failed: [], skipped: [] };
  for (const destination of destinations) {
    let state: "success" | "failure" = "failure";
    try {
      await deployFiles(
        previews.filter((file) => file.destination === destination),
        credentials,
        result,
      );
      state = "success";
    } finally {
      await recordDeployments(
        release,
        { ...selections, destinations: [destination] },
        state,
      );
    }
  }
  renderDeploymentResult(result);
  if (scripts.includes("default")) {
    log.warn(
      "Update https://docs.simpleanalytics.com/sri with the SRI version.",
    );
  }
  outro("Scripts deployed successfully.");
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error: unknown) => {
    if (error instanceof DeploymentFailure) {
      renderDeploymentResult(error.result);
      log.error(
        error.cause instanceof Error ? error.cause.message : error.message,
      );
    } else {
      log.error(error instanceof Error ? error.message : String(error));
    }
    cancel("Deployment stopped—review the error above.");
    process.exitCode = 1;
  });
}
