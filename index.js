const all = require("./test/constants/browsers.json");

const ie = all.filter(({ browser, browser_version }) => {
  return browser === "ie" && /^1[0-9]\./.test(browser_version);
});

console.log([...ie]);

module.exports = [...ie];
