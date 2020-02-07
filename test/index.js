const browserstack = require("browserstack-local");
const webdriver = require("selenium-webdriver");
const { promisify } = require("util");
// const request = require("request");
// const requestPromise = promisify(request);
const sleep = promisify(setTimeout);
const { SERVER_PORT } = require("./constants");

const {
  BS_CAPABILITIES,
  BS_LOCAL_OPTIONS,
  BS_USERNAME,
  BS_KEY,
  BS_BUILD_ID
} = require("./constants/browserstack");

const server = require("./helpers/server");
// const proxy = require("./helpers/proxy");

const log = (...messages) => console.log("=> Test:", ...messages);

if (!BS_USERNAME || !BS_KEY || !BS_BUILD_ID) {
  log("BS_USERNAME, BS_KEY, nor BS_BUILD_ID are not defined.");
  process.exit(1);
}

let driver;

(async () => {
  log("Starting");

  // await proxy();

  const { done, requests } = await server();

  try {
    log("start with bs", BS_LOCAL_OPTIONS);
    const BrowserStackLocal = new browserstack.Local();
    const start = promisify(BrowserStackLocal.start).bind(BrowserStackLocal);
    const stop = promisify(BrowserStackLocal.stop).bind(BrowserStackLocal);

    await start(BS_LOCAL_OPTIONS);
    log("Is running?", BrowserStackLocal.isRunning());

    driver = new webdriver.Builder()
      .usingServer("http://hub-cloud.browserstack.com/wd/hub")
      .withCapabilities(BS_CAPABILITIES)
      .build();

    const { id_: sessionId } = await driver.session_;
    log("Session", sessionId);

    const script = "/latest/hello.js";
    const page = `http://localhost:${SERVER_PORT}/?script=${encodeURIComponent(
      script
    )}&push=true`;

    await driver.get(page);

    await sleep(2000);
    await driver.close();
    await sleep(2000);
    await driver.quit();

    await done();
    await stop();

    const foundScript =
      requests.find(({ pathname } = {}) => pathname === "/script.js") !==
      undefined;

    const twoPageViews =
      requests.find(
        ({ method, pathname, body } = {}) =>
          method === "POST" &&
          pathname === "/v2/post" &&
          body &&
          body.pageviews &&
          body.pageviews.length === 2
      ) !== undefined;

    // log("Requests", requests);

    log("Found script", foundScript);
    log("Has two page views (beacon)", twoPageViews);
  } catch ({ message }) {
    log("Error:", message);
    if (driver) await driver.quit();

    process.exit(1);
  }
})();
