const { expect } = require("chai");

const browserstack = require("browserstack-local");
const { Builder } = require("selenium-webdriver");
const { promisify } = require("util");
const sleep = promisify(setTimeout);
const { DEBUG } = require("./constants");

const {
  BS_CAPABILITIES,
  BS_LOCAL_OPTIONS,
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY
} = require("./constants/browserstack");

const { getLocalhost } = require("./helpers");
const server = require("./helpers/server");

const log = (...messages) => DEBUG && console.log("    => Test:", ...messages);

if (!BROWSERSTACK_USERNAME || !BROWSERSTACK_ACCESS_KEY) {
  log("BROWSERSTACK_USERNAME nor BROWSERSTACK_ACCESS_KEY are not defined.");
  process.exit(1);
}

const getRequests = (allRequests, params) => {
  params = { method: "POST", ...params };
  const keys = Object.keys(params);
  return allRequests.filter(request => {
    const foundKeys = keys.filter(key => {
      return params[key] === request[key];
    });
    return foundKeys.length === keys.length;
  });
};

const navigate = async ({ browser, driver, script }) => {
  const localhost = await getLocalhost({
    localhost: !browser || browser.browserName !== "iPhone"
  });
  const page = `http://${localhost}/?script=${encodeURIComponent(script)}`;

  log("page", page);

  await driver.get(page);
  await sleep(2000);
  await driver.get(`http://${localhost}/empty`);
  await sleep(500);
  await driver.close();
  await sleep(500);
  await driver.quit();
};

const browsers = [
  {
    name: "iPhone XS iOS 12",
    browserName: "iPhone",
    os_version: "12",
    device: "iPhone XS",
    real_mobile: "true",
    beacon: false
  },
  {
    name: "Chrome 78",
    browserName: "Chrome",
    browser_version: "78.0",
    os: "Windows",
    os_version: "10",
    "browserstack.selenium_version": "4.0.0-alpha-2",
    beacon: true
  }
  // {
  //   name: "Edge",
  //   browserName: "Edge",
  //   browser_version: "18.0",
  //   os: "Windows",
  //   os_version: "10",
  //   "browserstack.selenium_version": "4.0.0-alpha-2"
  // }
  // {
  //   name: "Internet Explorer",
  //   os: "Windows",
  //   os_version: "10",
  //   browserName: "IE",
  //   browser_version: "11.0",
  //   "browserstack.selenium_version": "4.0.0-alpha-2"
  // }
];

describe("Collect data", () => {
  let driver, stopServer, startLocal, stopLocal, s;

  before(async () => {
    const BrowserStackLocal = new browserstack.Local();
    startLocal = promisify(BrowserStackLocal.start).bind(BrowserStackLocal);
    stopLocal = promisify(BrowserStackLocal.stop).bind(BrowserStackLocal);

    s = await server();
    stopServer = s.done;

    await startLocal(BS_LOCAL_OPTIONS);
    log("Is running?", BrowserStackLocal.isRunning());
  });

  for (const browser of browsers) {
    const {
      browserName,
      browser_version,
      os,
      device,
      os_version,
      beacon
    } = browser;

    const name = device
      ? `${device} ${os_version}`
      : `${os} ${os_version} ${browserName} ${browser_version}`;

    it(`Should collect page views in ${name}`, async () => {
      log("BS new Builder (can take a while)");

      // Create driver
      driver = await new Builder()
        .usingServer("http://hub-cloud.browserstack.com/wd/hub")
        .withCapabilities({ ...BS_CAPABILITIES, name, ...browser })
        .build();

      log("Start navigate");

      // Run steps in the browser
      await navigate({ browser, driver, script: "/latest/hello.js" });

      expect(
        global.REQUESTS,
        "There should be requests recorded"
      ).to.have.lengthOf.at.least(3);

      const postRequests = getRequests(global.REQUESTS, {
        pathname: "/v2/post"
      });
      const hasSendBeacon = beacon;
      const pageViewsInOneRequest = hasSendBeacon ? 2 : 1;

      expect(
        postRequests,
        "There are no /v2/post requests found"
      ).to.have.lengthOf.at.least(hasSendBeacon ? 1 : 2);

      postRequests.map((postRequest, index) => {
        expect(
          postRequest,
          "There is no /v2/post request with body found"
        ).to.have.property("body");

        expect(
          postRequest.body,
          "All required keys should be present"
        ).to.include.all.keys([
          "version",
          "hostname",
          "https",
          "width",
          "pageviews",
          "time"
        ]);

        expect(
          postRequest.body.pageviews,
          `There should be ${pageViewsInOneRequest} page views`
        ).to.have.lengthOf(pageViewsInOneRequest);

        expect(postRequest.body.version, "Version should be a number").to.be.a(
          "number"
        );

        expect(postRequest.body.https, "HTTPS should be a boolean").to.be.a(
          "boolean"
        );

        expect(postRequest.body.time, "Time should be a number").to.be.a(
          "number"
        );

        if (hasSendBeacon) {
          expect(
            postRequest.body.pageviews[0],
            "The first visit should be unique"
          ).to.have.property("unique", true);

          expect(
            postRequest.body.pageviews[1],
            "The second visit should not be unique"
          ).to.have.property("unique", false);

          expect(
            postRequest.body.pageviews[1].duration,
            "Duration should be 2 seconds"
          ).to.be.within(
            postRequest.body.pageviews[1].duration - 1,
            postRequest.body.pageviews[1].duration + 1
          );

          expect(
            postRequest.body.time - postRequest.body.pageviews[1].added,
            "Time between page view and request should be ~2 seconds"
          ).to.be.within(
            postRequest.body.pageviews[1].duration - 1,
            postRequest.body.pageviews[1].duration + 1
          );
        } else {
          expect(
            postRequest.body.pageviews[0],
            index === 0
              ? "The first visit should be unique"
              : "The second visit should not be unique"
          ).to.have.property("unique", index === 0 ? true : false);
        }
      });
    });
  }

  afterEach(() => {
    // Reset requests
    global.REQUESTS = [];
  });

  after(async () => {
    // await driver.quit();
    await stopLocal();
    await stopServer();
  });
});
