const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("pageview", function () {
  for (const [referrer, unique] of [
    ["https://external.example/?__cf_chl_tk=challenge", false],
    ["https://external.example/?source=mail&__cf_chl_rt_tk=challenge", false],
    ["https://external.example/docs/__cf_workers", true],
    ["https://external.example/?next=?__cf_chl_tk=challenge", true],
    ["https://external.example/#?__cf_chl_tk=challenge", true],
  ]) {
    it(`uses only Cloudflare query parameter names for ${referrer}`, function () {
      const dom = createDOM({
        beforeRun(context) {
          Object.defineProperty(context.document, "referrer", {
            value: referrer,
          });
        },
      });
      const url = new URL(dom.sent[0].url);
      expect(url.searchParams.get("unique")).to.equal(String(unique));
      expect(url.searchParams.get("referrer")).not.to.include("challenge");
      dom.window.close();
    });
  }

  it("uses query markers in an overwritten referrer without sending its query", function () {
    const dom = createDOM({
      settings: { referrer: "https://external.example/?__cf_chl_tk=challenge" },
    });
    const url = new URL(dom.sent[0].url);
    expect(url.searchParams.get("unique")).to.equal("false");
    expect(url.searchParams.get("referrer")).to.equal("external.example/");
    dom.window.close();
  });

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
