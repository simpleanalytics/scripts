const crypto = require("crypto");
const { networkInterfaces: getNetworkInterfaces } = require("os");
const { promisify } = require("util");
const sleep = promisify(setTimeout);
const { SERVER_PORT, DEBUG } = require("../constants");

const log = (...messages) =>
  DEBUG && console.log("    => Helpers:", ...messages);

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
  `${useLocalIp ? await this.getIPv4() : "localhost"}:${SERVER_PORT}`;

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
      await sleep(sleepMs);
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

module.exports.waitForRequest = ({
  pathname,
  amount = 1,
  timeout = 5000
} = {}) =>
  new Promise(async resolve => {
    if (!pathname) {
      log("waitForRequest: No pathname defined");
      return resolve(false);
    }

    let searching = true;
    let start = Date.now();

    while (searching) {
      const foundRequests = global.REQUESTS.filter(
        ({ pathname: requestPathname }) => {
          return pathname === requestPathname;
        }
      );

      // log(
      //   "waitForRequest",
      //   pathname,
      //   timeout,
      //   !!foundRequest,
      //   JSON.stringify(global.REQUESTS.map(lala => lala.pathname))
      // );

      if (foundRequests.length === amount) {
        searching = false;
        return resolve(Date.now() - start);
      }
      if (Date.now() - start > timeout) {
        searching = false;
        return resolve(false);
      }
      await sleep(100);
    }
  });
