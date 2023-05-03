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
  BROWSERSTACK_ACCESS_KEY,
} = require("./constants/browserstack");

const {
  DEV_NAME,
  DEV_BROWSER,
  DEV_BROWSER_VERSION,
  DEV_OS,
  DEV_DEVICE,
  DEV_OS_VERSION,
  DEV_DEVICE_LIMIT,
} = process.env;

const testLimit = DEV_DEVICE_LIMIT
  ? Math.max(parseInt(DEV_DEVICE_LIMIT, 10), 1)
  : 1;

const matches = (param, search) => {
  if (search?.endsWith(".0")) search = search.slice(0, -2);
  if (param?.endsWith(".0")) param = param.slice(0, -2);
  return search && search.toLowerCase() !== param?.toLowerCase();
};

const localBrowserFilter = (options) => {
  const { device, os, os_version, browser, browser_version } = options;
  const name = getDeviceName(options);
  if (matches(name, DEV_NAME)) return false;
  if (matches(device, DEV_DEVICE)) return false;
  if (matches(os, DEV_OS)) return false;
  if (matches(os_version, DEV_OS_VERSION)) return false;
  if (matches(browser, DEV_BROWSER)) return false;
  if (matches(browser_version, DEV_BROWSER_VERSION)) return false;

  return true;
};

const getMajorVersion = (version) => {
  const major = `${version}`.split(".")[0];
  return parseInt(major, 10);
};

const getSeleniumVersion = ({ browser, os, browser_version }) => {
  if (["ios", "android"].includes(os)) return false;
  if (browser === "chrome" && version(browser_version) < 50) return false;

  if (os === "OS X" && browser === "chrome") return "3.14.0";
  if (os === "Windows" && browser === "ie") return "3.5.2";
  if (browser === "firefox" && version(browser_version) >= 94) return "4.0.0";

  return "4.0.0-alpha-2";
};

const getAppiumVersion = ({ device, os, os_version }) => {
  const osMajorVersion = getMajorVersion(os_version);
  if (os === "android" && device.includes("Samsung") && osMajorVersion >= 12)
    return "1.22.0";
  return false;
};

const setTimezoneSupport = ({ device, os, os_version }) => {
  const osMajorVersion = getMajorVersion(os_version);
  if (os === "android" && device.includes("Samsung") && osMajorVersion >= 12)
    return false;
  if (os === "ios" && osMajorVersion < 13) return false;
  return true;
};

const getSupportsSendBeacon = ({ browser, os }) => {
  return os === "ios" || browser === "ie" || browser === "safari"
    ? false
    : true;
};
const getSupportsPushState = ({ browser, browser_version }) => {
  return !(browser === "ie" && version(browser_version) < 10);
};
const getSupportsClientHints = ({ browser, browser_version }) => {
  return (
    ["edge", "chrome", "opera"].includes(browser) &&
    version(browser_version) >= 88
  );
};

const getDriverOptions = (browser) => {
  const driverOptions = { ...BS_CAPABILITIES, ...browser };

  const timezoneSupport = setTimezoneSupport(browser);
  if (timezoneSupport) {
    driverOptions["browserstack.timezone"] = "Amsterdam";
  }

  return driverOptions;
};

// 180000 ms = 3 minutes
const getDriverWithTimeout = (capabilitiesRaw, { timeout = 180000 } = {}) =>
  new Promise((resolve) => {
    // Clean up capabilities
    const capabilities = getDriverOptions(capabilitiesRaw);
    delete capabilities.supportsSendBeacon;
    delete capabilities.supportsPushState;
    delete capabilities.supportsClientHints;
    delete capabilities.useLocalIp;

    const start = Date.now();
    let responded = false;

    const response = (message) => {
      if (message instanceof Error) {
        log(message);
        return resolve(message);
      }
      if (responded) return;
      responded = true;
      return Date.now() - start < timeout ? resolve(message) : resolve();
    };

    new Builder()
      .usingServer("http://hub-cloud.browserstack.com/wd/hub")
      .withCapabilities(capabilities)
      .build()
      .then(response)
      .catch(response);

    setTimeout(response, timeout);
  });

const log = (...messages) => DEBUG && console.log("    => Test:", ...messages);

if (!BROWSERSTACK_USERNAME || !BROWSERSTACK_ACCESS_KEY) {
  console.error(
    "BROWSERSTACK_USERNAME nor BROWSERSTACK_ACCESS_KEY are not defined."
  );
  process.exit(1);
}

const getDeviceName = ({
  browser,
  browser_version,
  os,
  device,
  os_version,
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
  let stopServer;

  if (CI) {
    await server();
  } else {
    stopServer = (await server()).done;
    await startLocal(BS_LOCAL_OPTIONS);
    log("Is BrowserStack Local running?", BrowserStackLocal.isRunning());
  }

  // Do not filter browsers when running as CI
  const retrievedBrowsers = await getBrowsers();
  const browsers = CI
    ? retrievedBrowsers
    : retrievedBrowsers
        .sort(() => Math.random() - 0.5) // Shuffle array
        .filter(localBrowserFilter)
        .slice(0, testLimit);

  log("Testing", browsers.length, "browsers:");

  browsers.map((browser) => {
    const name = getDeviceName(browser);
    const seleniumVersion = getSeleniumVersion(browser);
    const appiumVersion = getAppiumVersion(browser);

    browser.name = name;
    browser.browserName = browser.browser;

    const words = [" - ", name];
    if (seleniumVersion || appiumVersion) words.push(" (");
    if (seleniumVersion) words.push(`selenium: ${seleniumVersion}`);
    if (seleniumVersion && appiumVersion) words.push(", ");
    if (appiumVersion) words.push(`appium: ${appiumVersion}`);
    if (seleniumVersion || appiumVersion) words.push(")");
    log(words.join(""));

    return browser;
  });

  const mochaInstance = new Mocha({ retries: CI ? 2 : 0 });
  mochaInstance.timeout(2 * 60 * 60 * 1000); // 2 hours

  const suiteInstance = Mocha.Suite.create(
    mochaInstance.suite,
    "Public Script Test Suite"
  );

  if (CI)
    suiteInstance.addTest(
      new Mocha.Test(
        `Having more than 20 browsers to test: ${browsers.length}`,
        async function () {
          expect(
            browsers,
            "Should have more than 20 browsers"
          ).to.have.lengthOf.at.least(20);
        }
      )
    );

  suiteInstance.addTest(
    new Mocha.Test(`Test Node.js environment`, async function () {
      expect(process.version, "Should use Node.js 16.16").to.match(/^v16\.16/);
    })
  );

  const appendBrowserData = (browser) => {
    const selenium = getSeleniumVersion(browser);
    if (selenium) browser["browserstack.selenium_version"] = selenium;

    const appium = getAppiumVersion(browser);
    if (appium) browser["browserstack.appium_version"] = appium;

    browser.supportsSendBeacon = getSupportsSendBeacon(browser);
    browser.supportsPushState = getSupportsPushState(browser);
    browser.supportsClientHints = getSupportsClientHints(browser);
    browser.useLocalIp = browser.os === "ios";
    browser["browserstack.consoleLogs"] = "verbose";

    return browser;
  };

  let nextDriver = null;

  const test = async function (browser, nextBrowser) {
    browser = appendBrowserData(browser);

    let driver, backgroundDriver;

    if (nextBrowser) {
      log(`Getting in background: ${nextBrowser.name}...`);
      nextBrowser = appendBrowserData(nextBrowser);
      backgroundDriver = getDriverWithTimeout(nextBrowser);
    }

    if (nextDriver) {
      log(`Reusing next driver...`);
      driver = await nextDriver;
      nextDriver = null;
    } else {
      log(`Waiting to get ${browser.name}...`);
      driver = await getDriverWithTimeout(browser);
    }

    nextDriver = backgroundDriver;

    // Try again with new device when driver is not available
    if (typeof driver?.get !== "function") {
      log(`Trying again`);
      driver = await getDriverWithTimeout(browser, { timeout: 300000 });

      // Device seems unavailable so this test will fail
      if (typeof driver?.get !== "function") {
        expect(true, `Getting driver for ${browser.name}`).to.be.false;
        return;
      }
    }

    let commands = [];

    if (browser.supportsSendBeacon) {
      commands = [
        {
          script: "/latest/latest.js",
          push: browser.supportsPushState,
          beacon: browser.supportsSendBeacon,
          allowparams: "project",
        },
        { wait: "/script.js", amount: 1 },
        { visit: "/empty" }, // Trigger sendBeacon
        { wait: "/simple.gif", amount: 3 },
        { wait: "/append" },
      ];
    } else if (browser.supportsPushState) {
      commands = [
        {
          script: "/latest/latest.js",
          push: browser.supportsPushState,
          allowparams: "project",
        },
        { wait: "/script.js", amount: 1 },
        { wait: "/simple.gif", amount: 3 },
      ];
    } else {
      commands = [
        { script: "/latest/latest.js", allowparams: "project" },
        { wait: "/script.js", amount: 2 },
        {
          wait: "/simple.gif",
          amount: 2,
          params: { body: { type: "pageview" } },
          timeout: browser.browser === "ie" ? 10000 : null,
        },
      ];
    }

    // Empty global REQUESTS
    global.REQUESTS = [];

    let errorMessage = null;

    try {
      await navigate({
        ...browser,
        commands,
        driver,
      });

      // console.log(JSON.stringify(global.REQUESTS, null, 2));

      if (browser.supportsSendBeacon) {
        log("Testing beacon");
        await require("./test-beacon")(browser);
      } else if (browser.supportsPushState) {
        log("Testing one beacon");
        await require("./test-one-beacon")(browser);
      }

      if (browser.supportsPushState) {
        log("Testing push state");
        await require("./test-pushstate")(browser);
      } else {
        log("Testing no push state");
        await require("./test-no-pushstate")(browser);
      }

      if (browser.supportsClientHints) {
        log("We can't test client hints because they only work on https");
      }

      log("Testing events");

      // Empty global REQUESTS
      global.REQUESTS = [];

      commands = [
        { script: "/latest/hello.js", event: "-- event 123 &&" },
        { wait: "/simple.gif", params: { body: { type: "event" } } },
        { script: "/latest/hello.js", event: "function" },
        { script: "/latest/hello.js", event: "metadata" },
        {
          wait: "/simple.gif",
          params: { body: { type: "event" } },
          amount: 3,
        },
      ];

      await navigate({
        ...browser,
        commands,
        driver,
      });

      await require("./test-events")(browser);
    } catch (error) {
      errorMessage = error.message;
      throw error;
    } finally {
      // if (!driver) return;
      // try {
      //   const reason = errorMessage?.replace(/"/g, "'") || "";
      //   driver.executeScript(
      //     `browserstack_executor: {"action": "setSessionStatus", "arguments": {"status":"${
      //       errorMessage ? "failed" : "passed"
      //     }","reason": "${reason}"}}`
      //   );
      //   const sessionId = await driver.getSession();
      //   console.log({ sessionId: sessionId?.id_ });
      //   if (sessionId?.id_) await driver.quit();
      // } catch (error) {
      //   // Don't log when driver.quit() fails
      // }
    }
  };

  for (const [index, browser] of browsers.entries()) {
    const total = browsers.length;
    const testName = `Testing ${browser.name} (${index + 1}/${total})`;
    const nextBrowser = browsers[index + 1];
    suiteInstance.addTest(
      new Mocha.Test(testName, () => test(browser, nextBrowser))
    );
  }

  mochaInstance.run(async (amountFailures) => {
    // Stop local server and BrowserStack Local
    if (!CI) {
      await stopLocal();
      await stopServer();
    }

    // Exit with exit code when having failures
    process.exit(STOP_ON_FAIL ? amountFailures > 0 : false);
  });
})();
