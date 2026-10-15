const { expect } = require("chai");
const { readFileSync } = require("fs");
const { runInContext } = require("vm");
const { createDOM, SCRIPT_PATH } = require("./helpers/dom");

describe("pageview", function () {
  it("exposes the pageview function under its configured namespace", function () {
    const dom = createDOM({
      settings: { namespace: "ba", autoCollect: false },
    });
    expect(dom.window.ba_pageview).to.be.a("function");
    expect(dom.window.sa_pageview).to.be.undefined;
    dom.window.ba_pageview("/namespaced");
    expect(new URL(dom.sent[0].url).searchParams.get("path")).to.equal(
      "/namespaced"
    );
    dom.window.close();
  });

  it("keeps a default manual tracker separate from an automatic namespaced tracker", function () {
    const dom = createDOM({
      beforeRun(context) {
        const script = context.document.createElement("script");
        script.setAttribute("data-auto-collect", "false");
        script.setAttribute("data-hostname", "primary.example.com");
        Object.defineProperty(context.document, "currentScript", {
          value: script,
        });
      },
    });
    const manualPageview = dom.window.sa_pageview;
    const script = dom.window.document.currentScript;
    script.setAttribute("data-auto-collect", "true");
    script.setAttribute("data-hostname", "secondary.example.com");
    script.setAttribute("data-namespace", "ba");
    runInContext(readFileSync(SCRIPT_PATH, "utf8"), dom.getInternalVMContext());
    expect(dom.window.sa_pageview).to.equal(manualPageview);
    dom.window.sa_pageview("/manual");
    dom.window.ba_pageview("/other");
    const hostnames = dom.sent
      .filter((request) => request.type === "image")
      .map((request) => new URL(request.url).searchParams.get("hostname"));
    expect(hostnames).to.deep.equal([
      "secondary.example.com",
      "primary.example.com",
      "secondary.example.com",
    ]);
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
