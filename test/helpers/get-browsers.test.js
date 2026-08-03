const { expect } = require("chai");

const {
  findDeviceLifecycle,
  getUsage,
  isLifecycleEligible,
  selectBrowsers,
  validateMatrix,
} = require("./browser-matrix");
const {
  IE_RELEASES,
  parseBrowserStackPayload,
  parseEolPayload,
  parseMdnPayload,
  parseUsagePayload,
  withRetries,
} = require("./get-browsers");

const NOW = new Date("2026-08-03T00:00:00.000Z");

const maintained = (name, releaseDate = "2025-01-01") => ({
  name,
  releaseDate,
  eolFrom: null,
  isMaintained: true,
});
const retired = (name, eolFrom, releaseDate = "2020-01-01") => ({
  name,
  releaseDate,
  eolFrom,
  isMaintained: false,
});

const sources = () => ({
  eol: {
    chrome: [
      maintained("151", "2026-07-28"),
      retired("120", "2025-01-01", "2023-12-01"),
      retired("100", "2022-04-01", "2022-03-01"),
    ],
    firefox: [
      maintained("153", "2026-07-21"),
      retired("120", "2025-01-01", "2023-11-01"),
    ],
    ie: IE_RELEASES,
    windows: [
      maintained("11-26h1-w", "2026-02-10"),
      {
        ...maintained("10-22h2", "2022-10-18"),
        eolFrom: "2025-10-14",
      },
      retired("8.1", "2023-01-10", "2013-10-17"),
      retired("8", "2016-01-12", "2012-10-26"),
      { ...retired("7-sp1", "2020-01-14"), label: "7 SP1" },
    ],
    macos: [
      { ...maintained("26", "2025-09-15"), codename: "Tahoe" },
      { ...maintained("14", "2023-09-26"), codename: "Sonoma" },
      {
        ...retired("13", "2025-09-15", "2022-10-24"),
        codename: "Ventura",
      },
    ],
    android: [
      maintained("17", "2026-06-16"),
      retired("12", "2025-03-01", "2021-10-04"),
      retired("9", "2022-01-01", "2018-08-06"),
    ],
    ios: [
      maintained("26", "2025-09-15"),
      maintained("15", "2021-09-20"),
      retired("11", "2018-01-01", "2017-09-19"),
    ],
    iphone: [
      { ...maintained("15-pro-max", "2023-09-22"), label: "15 Pro Max" },
      { ...maintained("13-pro-max", "2021-09-24"), label: "13 Pro Max" },
    ],
    ipad: [
      {
        ...maintained("pro-8-13", "2025-10-22"),
        label: "iPad Pro 13-inch (M5)",
      },
      {
        ...maintained("9", "2021-09-24"),
        label: "iPad (9th generation)",
      },
    ],
    pixel: [{ ...maintained("9", "2024-08-22"), label: "Pixel 9" }],
    "samsung-mobile": [
      {
        ...maintained("galaxy-s22-ultra", "2022-02-25"),
        label: "Galaxy S22 Ultra",
      },
      {
        ...retired("galaxy-note-9", "2022-07-01", "2018-08-24"),
        label: "Galaxy Note 9",
      },
    ],
  },
  mdn: {
    edge: {
      130: {
        release_date: "2024-08-01",
        status: "retired",
      },
      151: {
        release_date: "2026-07-01",
        status: "current",
      },
      152: {
        release_date: "2026-08-20",
        status: "beta",
      },
    },
    safari: {
      17: {
        release_date: "2023-09-18",
        status: "retired",
      },
      26: {
        release_date: "2025-09-15",
        status: "current",
      },
      27: {
        release_date: "2026-09-15",
        status: "beta",
      },
    },
    opera: {},
  },
  usage: {
    chrome: { usage_global: { 100: 0, 120: 0.05, 151: 20 } },
    edge: { usage_global: { 130: 0, 151: 5 } },
    firefox: { usage_global: { 120: 0, 153: 3 } },
    safari: { usage_global: { 17: 0.5, 26: 15 } },
    ie: { usage_global: { 9: 0, 10: 0, 11: 0.217074 } },
    opera: { usage_global: {} },
  },
});

const capabilities = () => [
  {
    browser: "chrome",
    browser_version: "100.0",
    os: "Windows",
    os_version: "10",
  },
  {
    browser: "chrome",
    browser_version: "120.0",
    os: "Windows",
    os_version: "10",
  },
  {
    browser: "chrome",
    browser_version: "151.0",
    os: "Windows",
    os_version: "11",
  },
  {
    browser: "chrome",
    browser_version: "151.0",
    os: "Windows",
    os_version: "11",
  },
  {
    browser: "edge",
    browser_version: "130.0",
    os: "Windows",
    os_version: "10",
  },
  {
    browser: "edge",
    browser_version: "151.0",
    os: "Windows",
    os_version: "11",
  },
  {
    browser: "edge",
    browser_version: "152 beta",
    os: "Windows",
    os_version: "11",
  },
  {
    browser: "firefox",
    browser_version: "120.0",
    os: "OS X",
    os_version: "Ventura",
  },
  {
    browser: "firefox",
    browser_version: "153.0",
    os: "OS X",
    os_version: "Tahoe",
  },
  {
    browser: "safari",
    browser_version: "17.0",
    os: "OS X",
    os_version: "Sonoma",
  },
  {
    browser: "safari",
    browser_version: "26.0",
    os: "OS X",
    os_version: "Tahoe",
  },
  {
    browser: "safari",
    browser_version: "27.0",
    os: "OS X",
    os_version: "Golden Gate",
  },
  {
    browser: "ie",
    browser_version: "9.0",
    os: "Windows",
    os_version: "7",
  },
  {
    browser: "ie",
    browser_version: "10.0",
    os: "Windows",
    os_version: "8.1",
  },
  {
    browser: "ie",
    browser_version: "11.0",
    os: "Windows",
    os_version: "10",
  },
  {
    browser: "android",
    browser_version: "android",
    os: "android",
    os_version: "9.0",
    device: "Samsung Galaxy Note 9",
  },
  {
    browser: "android",
    browser_version: "android",
    os: "android",
    os_version: "12.0",
    device: "Samsung Galaxy S22 Ultra",
  },
  {
    browser: "android",
    browser_version: "android",
    os: "android",
    os_version: "17.0",
    device: "Google Pixel 9",
  },
  {
    browser: "iphone",
    browser_version: "15",
    os: "ios",
    os_version: "15",
    device: "iPhone 13 Pro Max",
  },
  {
    browser: "iphone",
    browser_version: "26",
    os: "ios",
    os_version: "26",
    device: "iPhone 15 Pro Max",
  },
  {
    browser: "iphone",
    browser_version: "27 Beta",
    os: "ios",
    os_version: "27 Beta",
    device: "iPhone 15 Pro Max",
  },
  {
    browser: "ipad",
    browser_version: "15",
    os: "ios",
    os_version: "15",
    device: "iPad 9th",
  },
  {
    browser: "ipad",
    browser_version: "26",
    os: "ios",
    os_version: "26",
    device: "iPad Pro 13 2025",
  },
];

describe("BrowserStack support matrix", () => {
  it("uses supported, two-year grace, and usage eligibility rules", () => {
    expect(
      isLifecycleEligible(maintained("1"), { now: NOW, usage: 0 })
    ).to.equal(true);
    expect(
      isLifecycleEligible(retired("1", "2025-01-01"), {
        now: NOW,
        usage: 0,
      })
    ).to.equal(true);
    expect(
      isLifecycleEligible(retired("1", "2022-01-01"), {
        now: NOW,
        usage: 0,
      })
    ).to.equal(false);
    expect(
      isLifecycleEligible(retired("1", "2022-01-01"), {
        now: NOW,
        usage: 0.11,
      })
    ).to.equal(true);
    expect(
      isLifecycleEligible(retired("1", "2022-01-01"), {
        now: NOW,
        usage: 0.1,
      })
    ).to.equal(false);
  });

  it("matches exact and ranged global usage versions", () => {
    const agents = {
      safari: { usage_global: { "15.2-15.3": 0.12, 15.4: 0.04 } },
    };
    expect(getUsage(agents, "safari", "15.3")).to.equal(0.12);
    expect(getUsage(agents, "safari", "15.4")).to.equal(0.04);
  });

  it("selects oldest and newest eligible boundaries without duplicates", () => {
    const matrix = selectBrowsers(capabilities(), sources(), { now: NOW });
    const versions = (browser) =>
      matrix
        .filter((capability) => capability.browser === browser)
        .map((capability) => capability.browser_version);

    expect(matrix).to.have.length(15);
    expect(versions("chrome")).to.have.members(["120.0", "151.0"]);
    expect(versions("edge")).to.have.members(["130.0", "151.0"]);
    expect(versions("firefox")).to.have.members(["120.0", "153.0"]);
    expect(versions("safari")).to.have.members(["17.0", "26.0"]);
    expect(versions("ie")).to.deep.equal(["11.0"]);
    expect(new Set(matrix.map(JSON.stringify)).size).to.equal(matrix.length);

    const desktopOsVersions = matrix
      .filter(({ device }) => !device)
      .map(({ os, os_version: osVersion }) => `${os} ${osVersion}`);
    expect(desktopOsVersions).to.include.members([
      "Windows 10",
      "Windows 11",
      "OS X Ventura",
      "OS X Tahoe",
    ]);
  });

  it("includes IE 11 through usage and excludes IE 9 and IE 10", () => {
    const matrix = selectBrowsers(capabilities(), sources(), { now: NOW });
    const internetExplorer = matrix.filter(({ browser }) => browser === "ie");
    expect(internetExplorer).to.deep.equal([
      {
        browser: "ie",
        browser_version: "11.0",
        os: "Windows",
        os_version: "10",
      },
    ]);
  });

  it("filters expired devices and keeps both mobile OS boundaries", () => {
    const matrix = selectBrowsers(capabilities(), sources(), { now: NOW });
    const mobile = matrix.filter(({ device }) => device);

    expect(mobile.map(({ device }) => device)).to.have.members([
      "Samsung Galaxy S22 Ultra",
      "Google Pixel 9",
      "iPhone 13 Pro Max",
      "iPhone 15 Pro Max",
      "iPad 9th",
      "iPad Pro 13 2025",
    ]);
    expect(
      mobile.some(({ device }) => device === "Samsung Galaxy Note 9")
    ).to.equal(false);
  });

  it("maps supported device names to live lifecycle records", () => {
    const data = sources();
    expect(
      findDeviceLifecycle(data, {
        browser: "android",
        device: "Samsung Galaxy S22 Ultra",
      }).name
    ).to.equal("galaxy-s22-ultra");
    expect(
      findDeviceLifecycle(data, {
        browser: "ipad",
        device: "iPad Pro 13 2025",
      }).name
    ).to.equal("pro-8-13");
  });

  it("fails when a required browser has no lifecycle-mapped capability", () => {
    const data = sources();
    data.mdn.safari = {};
    expect(() => selectBrowsers(capabilities(), data, { now: NOW })).to.throw(
      "missing required browser: safari"
    );
  });

  it("fails when fewer than ten sessions are selected", () => {
    expect(() => validateMatrix(new Array(9).fill({}))).to.throw(
      "expected at least 10"
    );
  });

  it("retries timeouts twice before succeeding", async () => {
    let calls = 0;
    const result = await withRetries(
      "fixture API",
      async () => {
        calls++;
        if (calls < 3) {
          const error = new Error("timed out");
          error.code = "ETIMEDOUT";
          throw error;
        }
        return { ok: true };
      },
      { wait: async () => {} }
    );

    expect(result).to.deep.equal({ ok: true });
    expect(calls).to.equal(3);
  });

  it("reports the source after three failed attempts", async () => {
    let error;
    try {
      await withRetries(
        "fixture API",
        async () => {
          throw new Error("invalid payload");
        },
        { wait: async () => {} }
      );
    } catch (caught) {
      error = caught;
    }

    expect(error.message).to.include("fixture API after 3 attempts");
  });

  it("rejects malformed API responses", () => {
    expect(() => parseBrowserStackPayload({})).to.throw("BrowserStack");
    expect(() => parseEolPayload("chrome", {})).to.throw(
      "endoflife.date/chrome"
    );
    expect(() => parseMdnPayload("edge", {})).to.throw("MDN/edge");
    expect(() => parseUsagePayload({})).to.throw("Can I Use");
    expect(() => parseUsagePayload({ agents: {} })).to.throw(
      "global usage data for chrome"
    );
  });
});
