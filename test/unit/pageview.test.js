const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("pageview", function () {
  it("sends pageview, event and beacon requests", function (done) {
    const dom = createDOM({ navigationType: "reload" });

    dom.window.sa_event("unit_test");

    if (!("onpagehide" in dom.window)) {
      dom.window.document.hidden = true;
      dom.window.document.dispatchEvent(
        new dom.window.Event("visibilitychange")
      );
    } else {
      dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    }

    setTimeout(() => {
      const gif = dom.sent.find(
        (r) => r.type === "image" && /simple\.gif/.test(r.url)
      );
      const eventReq = dom.sent.find(
        (r) => r.type === "image" && /event=unit_test/.test(r.url)
      );
      const beacon = dom.sent.find((r) => r.type === "beacon");

      expect(gif, "pageview gif request").to.exist;
      expect(eventReq, "event gif request").to.exist;
      expect(beacon, "append beacon request").to.exist;
      expect(beacon.url).to.match(/\/append$/);
      expect(beacon.data).to.include('"type":"append"');

      done();
    }, 10);
  });

  it("falls back to pixel when sendBeacon fails", function (done) {
    const dom = createDOM({ navigationType: "reload" });

    dom.window.navigator.sendBeacon = function () {
      throw new TypeError("Illegal invocation");
    };

    dom.window.sa_event("unit_test");

    if (!("onpagehide" in dom.window)) {
      dom.window.document.hidden = true;
      dom.window.document.dispatchEvent(
        new dom.window.Event("visibilitychange")
      );
    } else {
      dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    }

    setTimeout(() => {
      const beacon = dom.sent.find((r) => r.type === "beacon");
      const appendGif = dom.sent.find(
        (r) => r.type === "image" && /type=append/.test(r.url)
      );

      expect(beacon, "append beacon request").to.not.exist;
      expect(appendGif, "append gif request").to.exist;
      done();
    }, 10);
  });
});
