const { generateRandomString } = require("../helpers");
const { SERVER_PORT, LOCATION } = require("./");

const localIdentifier = `testing-${generateRandomString()}`;

global.REQUESTS = [];

const {
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY,
  BROWSERSTACK_BUILD_NAME = `Test from ${LOCATION}`,
  BROWSERSTACK_PROJECT_NAME = `Simple Analytics`,
  BROWSERSTACK_LOCAL_IDENTIFIER = localIdentifier,
} = process.env;

module.exports.BROWSERSTACK_USERNAME = process.env.BROWSERSTACK_USERNAME;
module.exports.BROWSERSTACK_ACCESS_KEY = process.env.BROWSERSTACK_ACCESS_KEY;
module.exports.STOP_ON_FAIL = process.env.STOP_ON_FAIL !== "false";

module.exports.BS_LOCAL_OPTIONS = {
  key: BROWSERSTACK_ACCESS_KEY,
  localIdentifier,
  forceLocal: "true",
  forceProxy: "true",
  "local-proxy-host": "localhost",
  "local-proxy-port": SERVER_PORT,
};

module.exports.BS_CAPABILITIES = {
  build: BROWSERSTACK_BUILD_NAME,
  project: BROWSERSTACK_PROJECT_NAME,
  "browserstack.local": "true",
  "browserstack.debug": "false",
  "browserstack.console": "disable",
  "browserstack.networkLogs": "true",
  "browserstack.ie.noFlash": "true",
  "browserstack.localIdentifier": BROWSERSTACK_LOCAL_IDENTIFIER,
  "browserstack.user": BROWSERSTACK_USERNAME,
  "browserstack.key": BROWSERSTACK_ACCESS_KEY,
};
