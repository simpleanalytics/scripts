const browserstack = require("browserstack-local");
const webdriver = require("selenium-webdriver");
const { promisify } = require("util");
const request = require("request");
const requestPromise = promisify(request);
const sleep = promisify(setTimeout);
const { PORT } = require("./constants");

const {
  BS_CAPABILITIES,
  BS_LOCAL_OPTIONS,
  BS_USERNAME,
  BS_KEY,
  BS_BUILD_ID
} = require("./constants/browserstack");
const server = require("./helpers/server");

const log = (...messages) => console.log("=> Test:", ...messages);

if (!BS_USERNAME || !BS_KEY || !BS_BUILD_ID) {
  log("BS_USERNAME, BS_KEY, nor BS_BUILD_ID are not defined.");
  process.exit(1);
}

let driver;

(async () => {
  log("Starting");
  try {
    const { done } = await server({ script: "/latest/hello.js" });

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

    await driver.get(`http://localhost:${PORT}/latest/hello`);

    await sleep(2000);
    await driver.close();
    await sleep(2000);
    await driver.quit();

    await done();
    await stop();

    const networkLogsUrl =
      `https://${BS_USERNAME}:${BS_KEY}@api.browserstack.com` +
      `/automate/builds/${BS_BUILD_ID}/sessions/${sessionId}/networklogs`;

    // Wait for the network log files to be written
    await sleep(3000);

    const { body } = await requestPromise({
      method: "GET",
      json: true,
      url: networkLogsUrl
    });

    if (!body || !body.log || !body.log.entries)
      return log("No log file available");

    const {
      log: { entries }
    } = body;

    const postEntry = entries.find(({ request }) => {
      return request.url === "https://queue.simpleanalyticscdn.com/v2/post";
    });

    if (!postEntry) {
      log(
        "Files",
        entries.map(({ request }) => request.url)
      );
      return log("Our post request was not found");
    } else if (postEntry.response.status !== 201)
      return log("Our post request did not return 201 created");

    return log("Our post request was found");
  } catch ({ message }) {
    log(message);
    await driver.quit();
  }
})();
