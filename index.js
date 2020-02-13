const all = require("./test/constants/browsers.json");

const ie = all.filter(({ browser, browser_version }) => {
  return browser === "ie" && /^1[0-9]\./.test(browser_version);
});

const edge = all.filter(({ browser, browser_version }) => {
  return (
    browser === "edge" &&
    !browser_version.includes("beta") &&
    !browser_version.includes("preview")
  );
});

const chromeAll = all.filter(({ browser, browser_version }) => {
  return (
    browser === "chrome" &&
    !browser_version.includes("beta") &&
    !browser_version.includes("preview")
  );
});

const makeUnique = (array = [], keys = []) => {
  if (!keys.length || !array.length) return [];

  return array.reduce((list, item) => {
    const has = list.find(listItem =>
      keys.every(key => listItem[key] === item[key])
    );
    if (!has) list.push(item);
    return list;
  }, []);
};

const chrome = makeUnique(
  chromeAll.sort((left, right) =>
    left.browser_version > right.browser_version ? -1 : 1
  ),
  ["os", "os_version"]
);

console.log([...ie, ...edge, ...chrome].length, "browsers");

module.exports = [...ie, ...edge, ...chrome];
