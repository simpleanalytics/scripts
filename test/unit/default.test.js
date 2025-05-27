const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const vm = require("vm");
const { expect } = require("chai");

describe("default script", function () {
  it("sends pageview, event and beacon requests", function () {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
      runScripts: "outside-only",
    });

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

    const script = readFileSync("dist/latest/latest.dev.js", "utf8");
    vm.runInContext(script, dom.getInternalVMContext());

    dom.window.sa_event("unit_test");

    dom.window.document.hidden = true;
    dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));

    const gif = sent.find(
      (r) => r.type === "image" && /simple\.gif/.test(r.url)
    );
    const eventReq = sent.find(
      (r) => r.type === "image" && /event_unit_test/.test(r.url)
    );
    const beacon = sent.find((r) => r.type === "beacon");

    expect(gif, "pageview gif request").to.exist;
    expect(eventReq, "event gif request").to.exist;
    expect(beacon, "append beacon request").to.exist;
    expect(beacon.url).to.match(/\/append$/);
    expect(beacon.data).to.include('"type":"append"');
  });
});
