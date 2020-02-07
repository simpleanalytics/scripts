const { PROXY_PORT } = require("./");
const LOCAL_IDENTIFIER = "testing";

module.exports.BS_USERNAME = process.env.BS_USERNAME;
module.exports.BS_KEY = process.env.BS_KEY;
module.exports.BS_BUILD_ID = process.env.BS_BUILD_ID;

module.exports.BS_LOCAL_OPTIONS = {
  key: this.BS_KEY,
  // forceLocal: "true",
  localIdentifier: LOCAL_IDENTIFIER
  // proxyHost: "localhost",
  // proxyPort: "" + PROXY_PORT
  // f: "/Users/adriaan/Developer/simpleanalytics/scripts/dist"
};

module.exports.BS_CAPABILITIES = {
  // name: "iPhone SE",
  // browserName: "iPhone",
  // device: "iPhone SE",
  // realMobile: "true",
  // os_version: "11",

  name: "Chrome 78",
  browserName: "Chrome",
  browser_version: "78.0",
  os: "Windows",
  os_version: "10",

  // name: "Edge",
  // browserName: "Edge",
  // browser_version: "18.0",
  // os: "Windows",
  // os_version: "10",

  // name: "Internet Explorer",
  // os: "Windows",
  // os_version: "10",
  // browserName: "IE",
  // browser_version: "11.0",

  resolution: "1024x768",
  project: "Simple Analytics",
  build: "Tracking Scripts",
  "browserstack.local": "true",
  "browserstack.localIdentifier": LOCAL_IDENTIFIER,
  "browserstack.debug": "true",
  "browserstack.console": "verbose",
  "browserstack.networkLogs": "true",
  "browserstack.timezone": "Europe/Amsterdam",
  "browserstack.selenium_version": "4.0.0-alpha-2",
  "browserstack.ie.noFlash": "true",
  "browserstack.user": this.BS_USERNAME,
  "browserstack.key": this.BS_KEY
};
