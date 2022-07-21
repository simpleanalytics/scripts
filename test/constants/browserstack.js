const { generateRandomString } = require("../helpers");
const { SERVER_PORT, LOCATION } = require("./");

const localIdentifier = `testing-${generateRandomString()}`;

global.REQUESTS = [];

const {
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY,
  BROWSERSTACK_BUILD_NAME,
  BROWSERSTACK_PROJECT_NAME,
  BROWSERSTACK_LOCAL_IDENTIFIER = localIdentifier,
} = process.env;

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
  project: `Simple Analytics`,
  build: `Test from ${LOCATION}`,

  "browserstack.local": "true",
  "browserstack.localIdentifier": localIdentifier,
  "browserstack.debug": "false",
  "browserstack.console": "disable",
  "browserstack.networkLogs": "false",
  "browserstack.ie.noFlash": "true",
  build: BROWSERSTACK_BUILD_NAME,
  project: BROWSERSTACK_PROJECT_NAME,
  "browserstack.localIdentifier": BROWSERSTACK_LOCAL_IDENTIFIER,
  "browserstack.user": BROWSERSTACK_USERNAME,
  "browserstack.key": BROWSERSTACK_ACCESS_KEY,
};
