const crypto = require("crypto");
const { networkInterfaces: getNetworkInterfaces } = require("os");
const { DEBUG, SERVER_PORT } = require("../constants");
const { promisify } = require("util");
const { By, Key } = require("selenium-webdriver");

const log = (...messages) =>
  DEBUG && console.log("    => Helpers:", ...messages);

module.exports.sleep = promisify(setTimeout);

module.exports.getLocalhost = async ({ browser, os } = {}) => {
  if (os === "ios" || browser === "safari") return "bs-local.com";
  return "localhost";
};

module.exports.generateRandomString = (length = 30) =>
  crypto.randomBytes(Math.ceil(length / 2)).toString("hex");

module.exports.version = (string) => {
  if (!string) return 0;
  return parseInt(string.split(".").slice(0, 2).join("."), 10);
};

module.exports.makeUnique = (array = [], keys = []) => {
  if (!keys.length || !array.length) return [];

  return array.reduce((list, item) => {
    const has = list.find((listItem) =>
      keys.every((key) => listItem[key] === item[key]),
    );
    if (!has) list.push(item);
    return list;
  }, []);
};

module.exports.navigate = async ({ browser, os, name, driver, commands }) => {
  const localhost =
    `http://` + (await this.getLocalhost({ os, browser })) + ":" + SERVER_PORT;

  for (const {
    sleep: sleepMs = 0,
    wait,
    params,
    visit,
    timeout,
    amount,
    close = false,
    script,
    beacon,
    push,
    event,
    tab,
    allowparams,
  } of commands) {
    const searchParams = new URLSearchParams({
      script: script || "",
      beacon: beacon || "",
      event: event || "",
      push: push || "",
      allowparams: allowparams || "",
      project: "project_x",
      utm_source: "utm_source",
      medium: "medium",
      ref: "ref",
      browser,
      os,
    }).toString();

    if (sleepMs) {
      log(`sleep (${name})`, sleepMs);
      await this.sleep(sleepMs);
    } else if (tab) {
      log(`open new tab (${name})`);
      await driver.findElement(By.css("body")).sendKeys(Key.CONTROL + "t");
    } else if (close) {
      log(`close (${name})`, close);
      await driver.close();
    } else if (wait) {
      const exceeded = await this.waitForRequest({
        params: {
          ...params,
          pathname: wait,
        },
        amount,
        timeout,
      });
      log(
        `waited (${name})`,
        wait,
        params ? `with params '${JSON.stringify(params)}'` : "",
        `${amount || 1}x`,
        typeof exceeded === "number"
          ? `(found request in ${exceeded}ms)`
          : `(exceeded timeout)`,
      );
    } else if (script) {
      log(`script (${name})`, `${localhost}/?${searchParams}`);
      await driver.get(`${localhost}/?${searchParams}`);
    } else if (visit) {
      log(`visit (${name})`, `${localhost}${visit}?${searchParams}`);
      await driver.get(`${localhost}${visit}?${searchParams}`);
    }
  }
};

module.exports.waitForRequest = async ({
  params,
  amount = 1,
  timeout = 5000,
} = {}) => {
  let searching = true;
  let start = Date.now();

  while (searching) {
    const foundRequests = this.getRequests(global.REQUESTS, params);

    if (foundRequests.length === amount) {
      searching = false;
      return Date.now() - start;
    }

    if (Date.now() - start > timeout) {
      searching = false;
      return false;
    }

    await this.sleep(50);
  }
};

const isObject = (obj) => typeof obj === "object" && !!obj;

// Allow search in two levels deep object
module.exports.getRequests = (allRequests, params) => {
  const keys = Object.keys(params);
  return allRequests.filter((request) => {
    let requiredKeys = keys.length;
    let foundDeepKeys = 0;

    const foundMainKeys = keys.filter((key) => {
      if (!isObject(params[key]) || !isObject(request[key]))
        return params[key] === request[key];

      return Object.keys(params[key]).every((deepKey) => {
        requiredKeys++;
        if (request[key][deepKey] === params[key][deepKey]) {
          foundDeepKeys++;
          return true;
        }
      });
    });

    return foundMainKeys.length + foundDeepKeys === requiredKeys;
  });
};
