const { generateRandomString } = require("../helpers");

const localIdentifier = `testing-${generateRandomString()}`;

global.REQUESTS = [];

module.exports.BROWSERSTACK_USERNAME = process.env.BROWSERSTACK_USERNAME;
module.exports.BROWSERSTACK_ACCESS_KEY = process.env.BROWSERSTACK_ACCESS_KEY;

module.exports.BS_LOCAL_OPTIONS = {
  key: this.BROWSERSTACK_ACCESS_KEY,
  localIdentifier,
  forceLocal: "true"
};

module.exports.BS_CAPABILITIES = {
  project: "Simple Analytics",
  build: "Tracking Scripts",
  "browserstack.local": "true",
  "browserstack.localIdentifier": localIdentifier,
  "browserstack.debug": "true",
  "browserstack.console": "errors",
  "browserstack.networkLogs": "true",
  "browserstack.timezone": "Europe/Amsterdam",
  "browserstack.ie.noFlash": "true",
  "browserstack.user": this.BROWSERSTACK_USERNAME,
  "browserstack.key": this.BROWSERSTACK_ACCESS_KEY
};
