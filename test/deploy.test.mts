import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  classifyContent,
  createManifest,
  firstLine,
  HEADER_PATTERN,
  latestVersionFromNames,
  repositoryPolicy,
  summarize,
  transformContent,
  type DeployFile,
  type PreviewFile,
} from "../deploy.mts";

describe("deployment headers", () => {
  it("accepts every generated JavaScript header in the current manifest", async () => {
    const version = latestVersionFromNames(
      await readdir(new URL("../dist", import.meta.url))
    );
    assert.ok(version !== undefined, "dist has no versioned SRI directory");
    assert.match(
      firstLine(
        await readFile(new URL("../dist/latest/latest.js", import.meta.url))
      ),
      new RegExp(`; v${version}\\) \\*/$`),
      "SRI directory version must match dist/latest/latest.js"
    );
    const files = createManifest(
      {
        destinations: ["cdn", "custom"],
        scripts: ["default", "auto-events"],
        variants: ["latest", "sri", "light", "proxy"],
      },
      version
    );
    for (const file of files.filter((file) => file.kind === "javascript")) {
      const content = await readFile(
        new URL("../" + file.localPath, import.meta.url)
      );
      assert.match(firstLine(content), HEADER_PATTERN, file.localPath);
    }
  });

  it("keeps accepting legacy headers", () => {
    assert.match(
      "/* Simple Analytics - Privacy friendly analytics (docs.simpleanalytics.com/script; 2024-01-01; abcd; SRI-version; v11) */",
      HEADER_PATTERN
    );
  });

  it("rejects malformed or unrelated headers", () => {
    for (const header of [
      "/* unrelated script */",
      "/* Simple Analytics - Privacy-first analytics (docs.simpleanalytics.com/script; 2026-10-15; not-a-hash; v12) */",
    ]) {
      assert.doesNotMatch(header, HEADER_PATTERN);
    }
  });
});

describe("deployment manifest", () => {
  it("maps latest and its legacy companions to both destinations", () => {
    const files = createManifest({
      destinations: ["cdn", "custom"],
      scripts: ["default"],
      variants: ["latest"],
    });

    assert.deepEqual(
      files.map((file) => `${file.destination}:${file.remotePath}`),
      [
        "cdn:latest.js",
        "cdn:latest.js.map",
        "cdn:hello.js",
        "cdn:hello.js.map",
        "cdn:latest.dev.js",
        "custom:latest.js",
        "custom:latest.js.map",
        "custom:events.js",
        "custom:events.js.map",
        "custom:latest.dev.js",
      ],
    );
  });

  it("includes every selected current and versioned file", () => {
    const files = createManifest(
      {
        destinations: ["cdn", "custom"],
        scripts: ["default", "auto-events"],
        variants: ["latest", "sri", "light", "proxy"],
      },
      12,
    );

    assert.equal(files.length, 30);
    assert.deepEqual(
      files
        .filter((file) => file.immutable)
        .map((file) => `${file.destination}:${file.remotePath}`),
      [
        "cdn:sri/v12.js",
        "cdn:sri/v12.js.map",
        "custom:v12/app.js",
        "custom:v12/app.js.map",
        "custom:v12/light.js",
        "custom:v12/light.js.map",
        "custom:v12/proxy.js",
        "custom:v12/proxy.js.map",
        "custom:v12/auto-events.js",
        "custom:v12/auto-events.js.map",
      ],
    );
  });

  it("deploys standalone auto-events without implicit SRI files", () => {
    const files = createManifest({
      destinations: ["cdn", "custom"],
      scripts: ["auto-events"],
      variants: [],
    });

    assert.deepEqual(
      files.map((file) => `${file.destination}:${file.remotePath}`),
      [
        "cdn:auto-events.js",
        "cdn:auto-events.js.map",
        "custom:auto-events.js",
        "custom:auto-events.js.map",
      ],
    );
    assert.equal(files.some((file) => file.immutable), false);
  });

  it("never emits proxy files for a CDN-only selection", () => {
    const files = createManifest(
      {
        destinations: ["cdn"],
        scripts: ["default"],
        variants: ["proxy", "sri"],
      },
      12,
    );

    assert.equal(files.some((file) => file.remotePath.includes("proxy")), false);
    assert.deepEqual(
      files.map((file) => file.remotePath),
      ["sri/v12.js", "sri/v12.js.map"],
    );
  });

  it("requires a version when SRI is selected", () => {
    assert.throws(
      () =>
        createManifest({
          destinations: ["cdn"],
          scripts: ["default"],
          variants: ["sri"],
        }),
      /SRI version is required/,
    );
  });

  it("never invents a source map for latest.dev.js", () => {
    const files = createManifest({
      destinations: ["cdn", "custom"],
      scripts: ["default"],
      variants: ["latest"],
    });

    assert.equal(
      files.some((file) => file.remotePath === "latest.dev.js.map"),
      false,
    );
  });
});

describe("SRI content", () => {
  const javascriptFile: DeployFile = {
    destination: "cdn",
    immutable: true,
    kind: "javascript",
    localPath: "dist/v12/app.js",
    remotePath: "sri/v12.js",
    transform: "cdn-sri-javascript",
    version: 12,
  };
  const mapFile: DeployFile = {
    ...javascriptFile,
    kind: "source-map",
    localPath: "dist/v12/app.js.map",
    remotePath: "sri/v12.js.map",
    transform: "cdn-sri-map",
  };

  it("rewrites CDN source-map references without changing local files", () => {
    assert.equal(
      transformContent(
        javascriptFile,
        Buffer.from("code\n//# sourceMappingURL=app.js.map"),
      ).toString(),
      "code\n//# sourceMappingURL=v12.js.map",
    );
    assert.equal(
      transformContent(
        mapFile,
        Buffer.from('{"file":"app.js","sources":["app.js"]}'),
      ).toString(),
      '{"file":"v12.js","sources":["v12.js"]}',
    );
  });

  it("classifies immutable content without permitting replacement", () => {
    const local = Buffer.from("new");
    assert.equal(classifyContent(local, null, true), "create");
    assert.equal(classifyContent(local, Buffer.from("new"), true), "unchanged");
    assert.equal(classifyContent(local, Buffer.from("old"), true), "blocked");
    assert.equal(classifyContent(local, Buffer.from("old"), false), "replace");
  });
});

describe("preview helpers", () => {
  it("finds the highest numeric SRI directory", () => {
    assert.equal(latestVersionFromNames(["latest", "v2", "v11", "v9"]), 11);
    assert.equal(latestVersionFromNames(["latest", "version-1"]), undefined);
  });

  it("extracts CRLF and LF headers", () => {
    assert.equal(firstLine(Buffer.from("header\r\nbody")), "header");
    assert.equal(firstLine(Buffer.from("header\nbody")), "header");
  });

  it("warns for dirty dry runs and blocks dirty deployments", () => {
    assert.equal(repositoryPolicy(true, true), "warn");
    assert.equal(repositoryPolicy(false, false), "clean");
    assert.throws(() => repositoryPolicy(false, true), /uncommitted changes/);
  });

  it("summarizes every file state", () => {
    const preview = (status: PreviewFile["status"]) =>
      ({ status }) as PreviewFile;
    assert.deepEqual(
      summarize([
        preview("create"),
        preview("replace"),
        preview("unchanged"),
        preview("blocked"),
        preview("blocked"),
      ]),
      { blocked: 2, create: 1, replace: 1, unchanged: 1 },
    );
  });
});
