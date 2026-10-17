const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("metadata", function () {
  it("collects metadata from global object and collector", function (done) {
    const dom = createDOM({
      settings: { autoCollect: false, metadataCollector: "collector" },
      beforeRun(vmContext) {
        const { runInContext } = require("vm");
        runInContext(
          "window.sa_metadata = { fromGlobal: true };" +
            "window.collector = function(data){ return { fromCollector: true, path: data.path }; };",
          vmContext
        );
      },
    });

    const { runInContext } = require("vm");
    runInContext(
      "window.manualMeta = { manual: true };",
      dom.getInternalVMContext()
    );
    dom.window.sa_pageview("/meta", dom.window.manualMeta);

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmeta/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      const meta = JSON.parse(
        decodeURIComponent(url.searchParams.get("metadata"))
      );
      expect(meta).to.include({
        manual: true,
        fromGlobal: true,
        fromCollector: true,
      });
      done();
    }, 10);
  });

  it("reloads global metadata on each call", function (done) {
    const dom = createDOM({ settings: { autoCollect: false } });
    const { runInContext } = require("vm");

    runInContext(
      "window.sa_metadata = { first: true };",
      dom.getInternalVMContext()
    );

    dom.window.sa_pageview("/first");

    setTimeout(() => {
      let req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Ffirst/.test(r.url)
      );
      expect(req, "first pageview request").to.exist;
      let url = new URL(req.url);
      let meta = JSON.parse(
        decodeURIComponent(url.searchParams.get("metadata"))
      );
      expect(meta).to.include({ first: true });

      runInContext(
        "window.sa_metadata = { second: true };",
        dom.getInternalVMContext()
      );

      dom.window.sa_pageview("/second");

      setTimeout(() => {
        req = dom.sent.find(
          (r) => r.type === "image" && /path=%2Fsecond/.test(r.url)
        );
        expect(req, "second pageview request").to.exist;
        url = new URL(req.url);
        meta = JSON.parse(decodeURIComponent(url.searchParams.get("metadata")));
        expect(meta).to.include({ second: true });
        expect(meta).to.not.have.property("first");
        done();
      }, 10);
    }, 10);
  });
});
