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
});
