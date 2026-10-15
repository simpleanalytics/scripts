const request = require("request");

const { selectBrowsers } = require("./browser-matrix");
const {
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY,
} = require("../constants/browserstack");

const REQUEST_TIMEOUT = 10000;
const REQUEST_ATTEMPTS = 3;
const EOL_API = "https://endoflife.date/api/v1/products";
const MDN_API =
  "https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers";
const CANIUSE_API =
  "https://raw.githubusercontent.com/Fyrd/caniuse/main/data.json";
const BROWSERSTACK_API = "https://api.browserstack.com/automate/browsers.json";

const EOL_PRODUCTS = [
  "chrome",
  "firefox",
  "windows",
  "macos",
  "android",
  "ios",
  "iphone",
  "ipad",
  "pixel",
  "samsung-mobile",
];
const MDN_BROWSERS = ["edge", "safari", "opera"];
const USAGE_BROWSERS = ["chrome", "edge", "firefox", "safari", "opera", "ie"];

// Microsoft retired the IE 11 desktop application on June 15, 2022. IE 9 and
// IE 10 stopped receiving support when Microsoft moved to the latest-version
// support policy on January 12, 2016. These immutable dates use the same
// lifecycle and usage policy as every other browser.
// https://learn.microsoft.com/en-us/lifecycle/products/internet-explorer-11
const IE_RELEASES = [
  {
    name: "11",
    releaseDate: "2013-10-17",
    eolFrom: "2022-06-15",
    isMaintained: false,
  },
  {
    name: "10",
    releaseDate: "2012-09-04",
    eolFrom: "2016-01-12",
    isMaintained: false,
  },
  {
    name: "9",
    releaseDate: "2011-03-14",
    eolFrom: "2016-01-12",
    isMaintained: false,
  },
];

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const withRetries = async (
  source,
  load,
  { attempts = REQUEST_ATTEMPTS, wait = sleep } = {}
) => {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(attempt * 250);
    }
  }

  const reason = lastError?.code || lastError?.message || "unknown error";
  throw new Error(
    `Unable to load ${source} after ${attempts} attempts: ${reason}`
  );
};

const requestJson = (options) =>
  new Promise((resolve, reject) => {
    request(
      { method: "GET", json: true, timeout: REQUEST_TIMEOUT, ...options },
      (error, response, body) => {
        if (error) return reject(error);
        if (
          !response ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        )
          return reject(new Error(`HTTP ${response?.statusCode || "unknown"}`));
        return resolve(body);
      }
    );
  });

const requireArray = (source, value) => {
  if (!Array.isArray(value) || !value.length)
    throw new Error(`${source} returned an unexpected response`);
  return value;
};

const parseEolPayload = (product, payload) =>
  requireArray(`endoflife.date/${product}`, payload?.result?.releases);

const parseMdnPayload = (browser, payload) => {
  const releases = payload?.browsers?.[browser]?.releases;
  if (
    !releases ||
    typeof releases !== "object" ||
    Array.isArray(releases) ||
    !Object.keys(releases).length
  )
    throw new Error(`MDN/${browser} returned an unexpected response`);
  return releases;
};

const parseUsagePayload = (payload) => {
  if (!payload?.agents || typeof payload.agents !== "object")
    throw new Error("Can I Use returned an unexpected response");
  for (const browser of USAGE_BROWSERS) {
    if (
      !payload.agents[browser]?.usage_global ||
      typeof payload.agents[browser].usage_global !== "object"
    )
      throw new Error(`Can I Use returned no global usage data for ${browser}`);
  }
  return payload.agents;
};

const parseBrowserStackPayload = (payload) =>
  requireArray("BrowserStack", payload);

const loadJson = (source, options, parse, dependencies) =>
  withRetries(
    source,
    async () => parse(await dependencies.requestJson(options)),
    dependencies
  );

const loadSources = async ({
  requestJson: load = requestJson,
  attempts = REQUEST_ATTEMPTS,
  wait = sleep,
} = {}) => {
  if (!BROWSERSTACK_USERNAME || !BROWSERSTACK_ACCESS_KEY)
    throw new Error("BrowserStack credentials are required to load browsers");

  const dependencies = { requestJson: load, attempts, wait };
  const eolRequests = EOL_PRODUCTS.map(async (product) => [
    product,
    await loadJson(
      `endoflife.date/${product}`,
      { url: `${EOL_API}/${product}` },
      (payload) => parseEolPayload(product, payload),
      dependencies
    ),
  ]);
  const mdnRequests = MDN_BROWSERS.map(async (browser) => [
    browser,
    await loadJson(
      `MDN/${browser}`,
      { url: `${MDN_API}/${browser}.json` },
      (payload) => parseMdnPayload(browser, payload),
      dependencies
    ),
  ]);
  const browserStackRequest = loadJson(
    "BrowserStack",
    {
      url: BROWSERSTACK_API,
      auth: {
        user: BROWSERSTACK_USERNAME,
        pass: BROWSERSTACK_ACCESS_KEY,
        sendImmediately: true,
      },
    },
    parseBrowserStackPayload,
    dependencies
  );
  const usageRequest = loadJson(
    "Can I Use",
    { url: CANIUSE_API },
    parseUsagePayload,
    dependencies
  );

  const [eolEntries, mdnEntries, all, usage] = await Promise.all([
    Promise.all(eolRequests),
    Promise.all(mdnRequests),
    browserStackRequest,
    usageRequest,
  ]);

  return {
    all,
    sources: {
      eol: { ...Object.fromEntries(eolEntries), ie: IE_RELEASES },
      mdn: Object.fromEntries(mdnEntries),
      usage,
    },
  };
};

const getBrowsers = async ({ now = new Date(), load = loadSources } = {}) => {
  const { all, sources } = await load();
  return selectBrowsers(all, sources, { now });
};

module.exports = getBrowsers;
module.exports.IE_RELEASES = IE_RELEASES;
module.exports.loadSources = loadSources;
module.exports.parseBrowserStackPayload = parseBrowserStackPayload;
module.exports.parseEolPayload = parseEolPayload;
module.exports.parseMdnPayload = parseMdnPayload;
module.exports.parseUsagePayload = parseUsagePayload;
module.exports.requestJson = requestJson;
module.exports.withRetries = withRetries;
