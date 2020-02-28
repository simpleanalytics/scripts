const request = require("request");
const { promisify } = require("util");
const requestPromise = promisify(request);

const { makeUnique, version } = require(".");
const {
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY
} = require("../constants/browserstack");

module.exports = async () => {
  const url =
    `https://${BROWSERSTACK_USERNAME}:${BROWSERSTACK_ACCESS_KEY}` +
    `@api.browserstack.com` +
    `/automate/browsers.json`;

  const { body: all } = await requestPromise({
    method: "GET",
    json: true,
    url
  });

  const ie = all.filter(({ browser, browser_version }) => {
    return browser === "ie" && version(browser_version) >= 9;
  });

  const edge = makeUnique(
    all
      .filter(({ browser, browser_version }) => {
        return (
          browser === "edge" &&
          !browser_version.includes("beta") &&
          !browser_version.includes("preview")
        );
      })
      .map(item => ({
        ...item,
        browser_main_version: version(item.browser_version)
      }))
      .sort((left, right) =>
        version(left.browser_version) > version(right.browser_version) ? -1 : 1
      )
      .slice(0, 2),
    ["os", "browser_main_version"]
  );

  const chrome = makeUnique(
    all
      .filter(({ browser, browser_version }) => {
        return (
          browser === "chrome" &&
          !browser_version.includes("beta") &&
          !browser_version.includes("preview")
        );
      })
      .sort((left, right) =>
        version(left.browser_version) > version(right.browser_version) ? -1 : 1
      ),
    ["os", "os_version"]
  );

  const ios = makeUnique(
    all
      .filter(({ browser }) => browser === "iphone")
      .sort((left, right) =>
        version(left.browser_version) > version(right.browser_version) ? -1 : 1
      ),
    ["os", "os_version"]
  );

  const android = makeUnique(
    all
      .filter(({ browser }) => browser === "android")
      .map(item => ({
        ...item,
        os_main_version: parseInt(item.os_version.split(".")[0], 10)
      }))
      .sort((left, right) =>
        version(left.os_version) > version(right.os_version) ? -1 : 1
      ),
    ["os", "os_main_version"]
  );

  const safari = makeUnique(
    all
      .filter(({ browser, os, browser_version }) => {
        return (
          browser === "safari" &&
          os === "OS X" &&
          !browser_version.includes("beta") &&
          !browser_version.includes("preview")
        );
      })
      .map(item => ({
        ...item,
        browser_main_version: version(item.browser_version)
      }))
      .sort((left, right) =>
        left.browser_main_version > right.browser_main_version ? -1 : 1
      )
      .slice(0, 4),
    ["os", "browser_main_version"]
  ).slice(0, 5);

  const firefox = makeUnique(
    all
      .filter(({ browser, browser_version }) => {
        return (
          browser === "firefox" &&
          !browser_version.includes("beta") &&
          !browser_version.includes("preview")
        );
      })
      .sort((left, right) =>
        version(left.browser_version) > version(right.browser_version) ? -1 : 1
      ),
    ["os"]
  );

  const opera = makeUnique(
    all
      .filter(({ browser, browser_version }) => {
        return (
          version(browser_version) > 12.15 &&
          browser === "opera" &&
          !browser_version.includes("beta") &&
          !browser_version.includes("preview")
        );
      })
      .sort((left, right) =>
        version(left.browser_version) > version(right.browser_version) ? -1 : 1
      ),
    ["os"]
  );

  const ipads = makeUnique(
    all
      .filter(({ browser }) => {
        return browser === "ipad";
      })
      .sort((left, right) =>
        version(left.os_version) > version(right.os_version) ? -1 : 1
      ),
    ["os_version"]
  );

  const browsers = [
    ...android,
    ...chrome,
    ...opera,
    ...edge,
    ...firefox,
    ...ie,
    ...ipads,
    ...ios,
    ...safari
  ];

  return browsers;
};
