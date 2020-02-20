const crypto = require("crypto");
const { networkInterfaces: getNetworkInterfaces } = require("os");
const { DEBUG } = require("../constants");
const { promisify } = require("util");

const log = (...messages) =>
  DEBUG && console.log("    => Helpers:", ...messages);

module.exports.sleep = promisify(setTimeout);

module.exports.getIPv4 = () =>
  new Promise((resolve, reject) => {
    const networkInterfaces = getNetworkInterfaces();
    const publicIPv4s = Object.keys(networkInterfaces)
      .reduce((interfaces, name) => {
        interfaces.push(...networkInterfaces[name]);
        return interfaces;
      }, [])
      .filter(({ family, internal }) => {
        return family === "IPv4" && !internal;
      });
    if (publicIPv4s.length) return resolve(publicIPv4s[0].address);
    return reject(Error("No local IPv4 address found"));
  });

module.exports.getLocalhost = async ({ useLocalIp = false } = {}) =>
  `${useLocalIp ? await this.getIPv4() : "localhost"}`;

module.exports.generateRandomString = (length = 30) =>
  crypto.randomBytes(Math.ceil(length / 2)).toString("hex");

module.exports.version = string => {
  if (!string) return 0;
  return parseInt(
    string
      .split(".")
      .slice(0, 2)
      .join("."),
    10
  );
};

module.exports.makeUnique = (array = [], keys = []) => {
  if (!keys.length || !array.length) return [];

  return array.reduce((list, item) => {
    const has = list.find(listItem =>
      keys.every(key => listItem[key] === item[key])
    );
    if (!has) list.push(item);
    return list;
  }, []);
};

module.exports.navigate = async ({ name, useLocalIp, driver, commands }) => {
  const localhost = `http://` + (await this.getLocalhost({ useLocalIp }));

  for (const {
    sleep: sleepMs = 0,
    wait,
    visit,
    timeout,
    amount,
    close = false,
    script
  } of commands) {
    if (sleepMs) {
      log(`sleep (${name})`, sleepMs);
      await this.sleep(sleepMs);
    } else if (close) {
      log(`close (${name})`, close);
      await driver.close();
    } else if (wait) {
      const exceeded = await this.waitForRequest({
        pathname: wait,
        amount,
        timeout
      });
      log(
        `waited (${name})`,
        wait,
        typeof exceeded === "number"
          ? `(found request in ${exceeded}ms)`
          : `(exceeded timeout)`
      );
    } else if (script) {
      log(
        `script (${name})`,
        `${localhost}/?script=${encodeURIComponent(script)}`
      );
      await driver.get(`${localhost}/?script=${encodeURIComponent(script)}`);
    } else if (visit) {
      log(`visit (${name})`, `${localhost}${visit}`);
      await driver.get(`${localhost}${visit}`);
    }
  }
};

module.exports.waitForRequest = async ({
  pathname,
  amount = 1,
  timeout = 5000
} = {}) => {
  if (!pathname) {
    log("waitForRequest: No pathname defined");
    return false;
  }

  let searching = true;
  let start = Date.now();

  while (searching) {
    const foundRequests = global.REQUESTS.filter(
      ({ pathname: requestPathname }) => {
        return pathname === requestPathname;
      }
    );

    if (foundRequests.length === amount) {
      searching = false;
      return Date.now() - start;
    }

    if (Date.now() - start > timeout) {
      searching = false;
      return false;
    }

    await this.sleep(100);
  }
};

module.exports.getRequests = (allRequests, params) => {
  params = { method: "POST", ...params };
  const keys = Object.keys(params);
  return allRequests.filter(request => {
    const foundKeys = keys.filter(key => {
      return params[key] === request[key];
    });
    return foundKeys.length === keys.length;
  });
};
