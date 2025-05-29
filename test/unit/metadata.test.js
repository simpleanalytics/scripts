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
});
