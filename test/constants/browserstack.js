const { generateRandomString } = require("../helpers");
const { SERVER_PORT, LOCATION } = require("./");

const localIdentifier = `testing-${generateRandomString()}`;

global.REQUESTS = [];

module.exports.BROWSERSTACK_USERNAME = process.env.BROWSERSTACK_USERNAME;
module.exports.BROWSERSTACK_ACCESS_KEY = process.env.BROWSERSTACK_ACCESS_KEY;

module.exports.STOP_ON_FAIL = process.env.STOP_ON_FAIL !== "false";

module.exports.BS_LOCAL_OPTIONS = {
  key: this.BROWSERSTACK_ACCESS_KEY,
  localIdentifier,
  forceLocal: "true",
  forceProxy: "true",
  "local-proxy-host": "localhost",
  "local-proxy-port": SERVER_PORT,
};

module.exports.BS_CAPABILITIES = {
  project: `Simple Analytics`,
  build: `Test from ${LOCATION}`,

  "browserstack.local": "true",
  "browserstack.localIdentifier": localIdentifier,
  "browserstack.debug": "false",
  "browserstack.console": "disable",
  "browserstack.networkLogs": "false",
  "browserstack.ie.noFlash": "true",
  "browserstack.user": this.BROWSERSTACK_USERNAME,
  "browserstack.key": this.BROWSERSTACK_ACCESS_KEY,
};
