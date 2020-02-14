const Mocha = require("mocha");

const browserstack = require("browserstack-local");
const { Builder } = require("selenium-webdriver");
const { promisify } = require("util");
const { DEBUG } = require("./constants");
const { version, navigate } = require("./helpers");
const getBrowsers = require("./helpers/get-browsers");

const {
  BS_CAPABILITIES,
  BS_LOCAL_OPTIONS,
  STOP_ON_FAIL,
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY
} = require("./constants/browserstack");

const server = require("./helpers/server");

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

  const stopServer = (await server()).done;
  await startLocal(BS_LOCAL_OPTIONS);
  log("Is running?", BrowserStackLocal.isRunning());
  const browsers = (await getBrowsers()).filter(br => br.browser !== "safari");

  const mochaInstance = new Mocha();
  mochaInstance.timeout(0);

  const suiteInstance = Mocha.Suite.create(
    mochaInstance.suite,
    "Public Script Test Suite"
  );

  for (const browser of browsers) {
    const name = getDeviceName(browser);
    browser.name = name;
    browser.browserName = browser.browser;

    suiteInstance.addTest(
      new Mocha.Test(`Testing ${name}`, async function() {
        const isMobile = ["ios", "android"].indexOf(browser.os) > -1;
        if (!isMobile)
          browser["browserstack.selenium_version"] = "4.0.0-alpha-2";

        browser.supportsSendBeacon =
          (browser.os === "ios" && version(browser.os_version) <= 12) ||
          browser.browser === "ie"
            ? false
            : true;

        browser.useLocalIp = browser.os === "ios";

        const driver = await new Builder()
          .usingServer("http://hub-cloud.browserstack.com/wd/hub")
          .withCapabilities({
            ...BS_CAPABILITIES,
            ...browser
          })
          .build();

        const commands = browser.supportsSendBeacon
          ? [
              { script: "/latest/hello.js" },
              { wait: "/script.js", amount: 1 },
              { sleep: 2000 },
              { visit: `/empty` },
              { wait: "/v2/post", amount: 1 },
              { wait: "/v1/visit", amount: 2 },
              { close: true }
            ]
          : [
              { script: "/latest/hello.js" },
              { wait: "/v2/post", amount: 1 },
              { sleep: 500 },
              { wait: "/v2/post", amount: 2 },
              { wait: "/v1/visit", amount: 2 },
              { close: true }
            ];

        await navigate({
          ...browser,
          commands,
          driver
        });

        await require("./beacon")(browser);

        await driver.quit();

        global.REQUESTS = [];
      })
    );
  }

  mochaInstance.run(amountFailures => {
    stopLocal();
    stopServer();
    process.exitCode = STOP_ON_FAIL ? amountFailures > 0 : false;
  });
})();
