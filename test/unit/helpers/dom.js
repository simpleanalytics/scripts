const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const vm = require("vm");

const SCRIPT_PATH = "dist/latest/latest.dev.js";

/**
 * @typedef {"navigate" | "reload" | "back_forward" | "prerender"} NavigationType
 */

/** @type {Record<NavigationType, {name: NavigationType, code: number}>} */
const NAVIGATION_TYPES = {
  navigate: { name: "navigate", code: 0 },
  reload: { name: "reload", code: 1 },
  back_forward: { name: "back_forward", code: 2 },
  prerender: { name: "prerender", code: 255 },
};

function createDOM(options = {}) {
  const {
    url = "https://example.com/",
    navigationType = "navigate",
    settings,
    beforeRun,
  } = options;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  if (settings) {
    vm.runInContext(
      `window.sa_settings = ${JSON.stringify(settings)}`,
      dom.getInternalVMContext()
    );
  }

  if (typeof beforeRun === "function") beforeRun(dom.getInternalVMContext());

  const sent = [];
  dom.window.Image = function () {
    return {
      set src(value) {
        sent.push({ type: "image", url: value });
      },
    };
  };
  dom.window.navigator.sendBeacon = function (url, data) {
    sent.push({ type: "beacon", url, data });
    return true;
  };

  Object.defineProperty(dom.window, "performance", {
    writable: true,
    value: {
      getEntriesByType: function (type) {
        if (type === "navigation") {
          return [{ type: NAVIGATION_TYPES[navigationType].name }];
        }
        return [];
      },
      navigation: { type: NAVIGATION_TYPES[navigationType].code },
    },
  });

  const script = readFileSync(SCRIPT_PATH, "utf8");
  vm.runInContext(script, dom.getInternalVMContext());

  dom.sent = sent;
  return dom;
}

module.exports = {
  createDOM,
  SCRIPT_PATH,
  NAVIGATION_TYPES,
};
