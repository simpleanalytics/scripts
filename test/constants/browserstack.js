const { PROXY_PORT } = require("./");
const LOCAL_IDENTIFIER = "testing";

module.exports.BS_USERNAME = process.env.BS_USERNAME;
module.exports.BS_KEY = process.env.BS_KEY;
module.exports.BS_BUILD_ID = process.env.BS_BUILD_ID;

module.exports.BS_LOCAL_OPTIONS = {
  key: this.BS_KEY
  // forceLocal: "true",
  // localIdentifier: LOCAL_IDENTIFIER,
  // proxyHost: "localhost",
  // proxyPort: "" + PROXY_PORT
  // f: "/Users/adriaan/Developer/simpleanalytics/scripts/dist"
};

module.exports.BS_CAPABILITIES = {
  os: "Windows",
  os_version: "10",
  browserName: "IE",
  browser_version: "11.0",
  project: "Simple Analytics",
  build: "Tracking Scripts",
  name: "Internet Explorer",
  "browserstack.local": "true",
  // "browserstack.localIdentifier": LOCAL_IDENTIFIER,
  "browserstack.debug": "true",
  "browserstack.console": "verbose",
  "browserstack.networkLogs": "true",
  "browserstack.timezone": "Europe/Amsterdam",
  "browserstack.selenium_version": "4.0.0-alpha-2",
  "browserstack.ie.noFlash": "true",
  "browserstack.user": this.BS_USERNAME,
  "browserstack.key": this.BS_KEY
};
