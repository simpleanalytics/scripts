const LOCAL_IDENTIFIER = "testing";

module.exports.BS_USERNAME = process.env.BS_USERNAME;
module.exports.BS_KEY = process.env.BS_KEY;
module.exports.BS_BUILD_ID = process.env.BS_BUILD_ID;

module.exports.BS_LOCAL_OPTIONS = {
  key: this.BS_KEY,
  // forceLocal: "true",
  localIdentifier: LOCAL_IDENTIFIER
};

module.exports.BS_CAPABILITIES = {
  // name: "Samsung Galaxy S10 Android 9",
  // browser: "Samsung",
  // browserName: "Samsung",
  // os_version: "9.0",
  // os: "Android",
  // device: "Samsung Galaxy S10",
  // real_mobile: "true",
  // // "browserstack.appium_version": "1.15.0",

  // name: "OS X Catalina Safari 13",
  // os: "OS X",
  // os_version: "Catalina",
  // browserName: "Safari",
  // browser_version: "13.0",
  // "browserstack.selenium_version": "4.0.0-alpha-2",

  // name: "iPhone 6S iOS 12",
  // os_version: "12",
  // browserName: "iPhone",
  // device: "iPhone 6S",
  // real_mobile: "true",
  // // "browserstack.appium_version": "1.16.0",

  // name: "iPhone XS iOS 13",
  // os_version: "13",
  // device: "iPhone XS",
  // real_mobile: "true",
  // browserName: "iPhone",
  // "browserstack.appium_version": "1.14.0",

  // name: "iPhone SE iOS 12",
  // browserName: "iPhone",
  // device: "iPhone XS",
  // realMobile: "true",
  // os_version: "12",
  // "browserstack.appium_version": "1.15.0",

  // name: "iPhone SE iOS 11",
  // browserName: "iPhone",
  // device: "iPhone SE",
  // realMobile: "true",
  // os_version: "11",
  // "browserstack.appium_version": "1.15.0",

  name: "Chrome 78",
  browserName: "Chrome",
  browser_version: "78.0",
  os: "Windows",
  os_version: "10",
  "browserstack.selenium_version": "4.0.0-alpha-2",

  // name: "Edge",
  // browserName: "Edge",
  // browser_version: "18.0",
  // os: "Windows",
  // os_version: "10",
  // "browserstack.selenium_version": "4.0.0-alpha-2",

  // name: "Internet Explorer",
  // os: "Windows",
  // os_version: "10",
  // browserName: "IE",
  // browser_version: "11.0",
  // "browserstack.selenium_version": "4.0.0-alpha-2",

  // resolution: "1024x768",
  project: "Simple Analytics",
  build: "Tracking Scripts",
  "browserstack.local": "true",
  "browserstack.localIdentifier": LOCAL_IDENTIFIER,
  "browserstack.debug": "true",
  "browserstack.console": "errors",
  "browserstack.networkLogs": "true",
  "browserstack.timezone": "Europe/Amsterdam",
  "browserstack.ie.noFlash": "true",
  "browserstack.user": this.BS_USERNAME,
  "browserstack.key": this.BS_KEY,
  acceptSslCerts: "true"
};
