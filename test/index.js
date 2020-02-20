const Mocha = require("mocha");
const { expect } = require("chai");

const browserstack = require("browserstack-local");
const { Builder } = require("selenium-webdriver");
const { promisify } = require("util");
const { DEBUG, CI } = require("./constants");
const { version, navigate } = require("./helpers");
const getBrowsers = require("./helpers/get-browsers");
const server = require("./helpers/server");

const {
  BS_CAPABILITIES,
  BS_LOCAL_OPTIONS,
  STOP_ON_FAIL,
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY
} = require("./constants/browserstack");

// 1080000 ms = 10 minutes
const getDriverWithTimeout = (capabilities, timeout = 1080000) =>
  new Promise(resolve => {
    const start = Date.now();
    let responded = false;

    const response = () => {
      if (responded) return;
      responded = true;
      return Date.now() - start < timeout ? resolve(driver) : resolve();
    };

    const driver = new Builder()
      .usingServer("http://hub-cloud.browserstack.com/wd/hub")
      .withCapabilities(capabilities)
      .build()
      .then(response)
      .catch(response);

    setTimeout(response);
  });

const log = (...messages) => DEBUG && console.log("    => Test:", ...messages);

if (!BROWSERSTACK_USERNAME || !BROWSERSTACK_ACCESS_KEY) {
  log("BROWSERSTACK_USERNAME nor BROWSERSTACK_ACCESS_KEY are not defined.");
  process.exit(1);
}

const getDeviceName = ({
  browser,
  browser_version,
  os,
  device,
  os_version
} = {}) =>
  device
    ? `${device} ${
        os === "ios"
          ? `with iOS ${os_version}`
          : `with ${browser} ${os_version}`
      }`
    : `${os} ${os_version} with ${browser} ${browser_version}`;

(async () => {
  const BrowserStackLocal = new browserstack.Local();
  const startLocal = promisify(BrowserStackLocal.start).bind(BrowserStackLocal);
  const stopLocal = promisify(BrowserStackLocal.stop).bind(BrowserStackLocal);
  let driver;

  const stopServer = (await server()).done;
  await startLocal(BS_LOCAL_OPTIONS);
  log("Is BrowserStack Local running?", BrowserStackLocal.isRunning());

  // Do not filter browsers when running as CI
  const retrievedBrowsers = await getBrowsers();
  const browsers = CI
    ? retrievedBrowsers
    : retrievedBrowsers.filter(br => br.browser === "opera").slice(0, 1);

  log("Testing", browsers.length, "browsers:");
  browsers.map(browser => {
    const name = getDeviceName(browser);
    browser.name = name;
    browser.browserName = browser.browser;
    log(` - ${name}`);
    return browser;
  });

  const mochaInstance = new Mocha();
  mochaInstance.timeout(0);

  const suiteInstance = Mocha.Suite.create(
    mochaInstance.suite,
    "Public Script Test Suite"
  );

  for (const browser of browsers) {
    suiteInstance.addTest(
      new Mocha.Test(`Testing ${browser.name}`, async function() {
        const isMobile = ["ios", "android"].indexOf(browser.os) > -1;
        if (!isMobile)
          browser["browserstack.selenium_version"] = "4.0.0-alpha-2";
        if (browser.browser === "opera")
          browser["browserstack.selenium_version"] = "2.43.1";

        browser.supportsSendBeacon =
          (browser.os === "ios" && version(browser.os_version) <= 12) ||
          browser.browser === "ie"
            ? false
            : true;

        browser.useLocalIp = browser.os === "ios";

        log(`Waiting to get ${browser.name}...`);

        driver = await getDriverWithTimeout({
          ...BS_CAPABILITIES,
          ...browser
        });

        if (!driver) {
          // Device seems unavailable the test will complete
          expect(true, "Getting device take more than 10 minutes").to.be.false;
          return;
        }

        const commands = browser.supportsSendBeacon
          ? [
              { script: "/latest/hello.js" },
              { wait: "/script.js", amount: 1 },
              { wait: "/get.gif", amount: 2 },
              { close: true }
            ]
          : [
              { script: "/latest/hello.js" },
              { wait: "/script.js", amount: 1 },
              { wait: "/get.gif", amount: 2 },
              { close: true }
            ];

        // Empty global REQUESTS
        global.REQUESTS = [];

        await navigate({
          ...browser,
          commands,
          driver
        });

        await driver.quit();

        await require("./test")(browser);
      })
    );
  }

  mochaInstance.run(amountFailures => {
    // Stop local server and BrowserStack Local
    stopLocal();
    stopServer();

    // Exit with exit code when having failers
    process.exitCode = STOP_ON_FAIL ? amountFailures > 0 : false;
  });
})();
