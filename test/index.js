const { expect } = require("chai");

const browserstack = require("browserstack-local");
const { Builder } = require("selenium-webdriver");
const { promisify } = require("util");
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

const log = (...messages) => console.log("    => Test:", ...messages);

if (!BS_USERNAME || !BS_KEY || !BS_BUILD_ID) {
  log("BS_USERNAME, BS_KEY, nor BS_BUILD_ID are not defined.");
  process.exit(1);
}

const getRequest = (allRequests, params) => {
  params = { method: "POST", ...params };
  const keys = Object.keys(params);
  const request = allRequests.find(request => {
    const foundKeys = keys.filter(key => {
      return params[key] === request[key];
    });
    return foundKeys.length === keys.length;
  });
  return request;
};

const navigate = async ({ driver, script }) => {
  const page = `http://localhost:${SERVER_PORT}/?script=${encodeURIComponent(
    script
  )}&push=true`;

  // When iOS and no valid ssl:
  // await driver.executeScript('browserstack_executor: {"action": "acceptSsl"}');

  await driver.get(page);
  await sleep(2000);
  await driver.get(`http://localhost:${SERVER_PORT}/empty`);
  await sleep(500);
  await driver.close();
  await sleep(500);
};

describe("Collect data", () => {
  let driver, stopServer, startLocal, stopLocal, requests;

  before(async () => {
    const BrowserStackLocal = new browserstack.Local();
    startLocal = promisify(BrowserStackLocal.start).bind(BrowserStackLocal);
    stopLocal = promisify(BrowserStackLocal.stop).bind(BrowserStackLocal);

    const s = await server();
    stopServer = s.done;
    requests = s.requests;

    await startLocal(BS_LOCAL_OPTIONS);
    log("Is running?", BrowserStackLocal.isRunning());

    driver = await new Builder()
      .usingServer("http://hub-cloud.browserstack.com/wd/hub")
      .withCapabilities(BS_CAPABILITIES)
      .build();
  });

  it("should collect page views via pushState", async () => {
    await navigate({ driver, script: "/latest/hello.js" });

    console.log(JSON.stringify(requests, null, 2));

    expect(
      requests,
      "There should be requests recorded"
    ).to.have.lengthOf.at.least(2);

    const postRequest = getRequest(requests, { pathname: "/v2/post" });

    expect(
      postRequest.body,
      "All required keys should be present"
    ).to.include.all.keys(
      // "timezone",
      "version",
      "hostname",
      "https",
      "width",
      "source",
      "pageviews",
      "time"
    );

    expect(
      postRequest.body.pageviews.length,
      "There should be 2 page views"
    ).to.equal(2);

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
    ).to.equal(2);

    expect(
      postRequest.body.time - postRequest.body.pageviews[1].added,
      "Time between page view and request should be ~2 seconds"
    ).to.be.within(
      postRequest.body.pageviews[1].duration - 1,
      postRequest.body.pageviews[1].duration + 1
    );
  });

  after(async () => {
    await driver.quit();
    await stopLocal();
    await stopServer();
  });
});
