const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const vm = require("vm");
const { expect } = require("chai");

/**
 * @typedef {'navigate' | 'reload' | 'back_forward' | 'prerender'} NavigationType
 */

/**
 * @type {Record<NavigationType, {name: NavigationType, code: number}>}
 */
const NAVIGATION_TYPES = {
  navigate: {
    name: "navigate",
    code: 0,
  },
  reload: {
    name: "reload",
    code: 1,
  },
  back_forward: {
    name: "back_forward",
    code: 2,
  },
  prerender: {
    name: "prerender",
    code: 255,
  },
};

describe("default script", function () {
  it("sends pageview, event and beacon requests", function (done) {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });

    /**
     * @type {NavigationType}
     */
    const navigationType = "reload";

    const sent = [];
    dom.window.Image = function () {
      return {
        set src(url) {
          sent.push({ type: "image", url });
        },
      };
    };
    dom.window.navigator.sendBeacon = function (url, data) {
      sent.push({ type: "beacon", url, data });
      return true;
    };

    // Mock the Performance API using Object.defineProperty
    Object.defineProperty(dom.window, "performance", {
      writable: true,
      value: {
        getEntriesByType: function (type) {
          if (type === "navigation") {
            return [
              {
                type: NAVIGATION_TYPES[navigationType].name,
              },
            ];
          }
          return [];
        },
        navigation: {
          type: NAVIGATION_TYPES[navigationType].code,
        },
      },
    });

    const script = readFileSync("dist/latest/latest.dev.js", "utf8");
    vm.runInContext(script, dom.getInternalVMContext());

    dom.window.sa_event("unit_test");

    // The script checks for 'onpagehide' in window to determine if it should send
    // the beacon on visibilitychange. If 'onpagehide' doesn't exist, it sends immediately
    // when the page becomes hidden.
    if (!("onpagehide" in dom.window)) {
      // If pagehide is not supported, the script sends the beacon on visibilitychange
      dom.window.document.hidden = true;
      dom.window.document.dispatchEvent(
        new dom.window.Event("visibilitychange")
      );
    } else {
      // If pagehide is supported, we need to dispatch the pagehide event
      dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    }

    // Give the beacon a moment to be sent
    setTimeout(() => {
      const gif = sent.find(
        (r) => r.type === "image" && /simple\.gif/.test(r.url)
      );
      const eventReq = sent.find(
        (r) => r.type === "image" && /event=unit_test/.test(r.url)
      );
      const beacon = sent.find((r) => r.type === "beacon");

      expect(gif, "pageview gif request").to.exist;
      expect(eventReq, "event gif request").to.exist;
      expect(beacon, "append beacon request").to.exist;
      expect(beacon.url).to.match(/\/append$/);
      expect(beacon.data).to.include('"type":"append"');

      done();
    }, 10);
  });
});
