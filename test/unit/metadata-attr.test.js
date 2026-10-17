const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("metadata via data attribute", function () {
  it("uses data-metadata-collector attribute", function (done) {
    const dom = createDOM({
      settings: { autoCollect: false },
      beforeRun(vmContext) {
        const { runInContext } = require("vm");
        runInContext(
          "window.collector = function(data){ return { fromAttr: true, path: data.path }; };" +
            "Object.defineProperty(document, 'currentScript', {get: function(){ return { getAttribute: function(name){ return name === 'data-metadata-collector' ? 'collector' : null; } }; }});",
          vmContext
        );
      },
    });

    dom.window.sa_pageview("/attr");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fattr/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      const meta = JSON.parse(
        decodeURIComponent(url.searchParams.get("metadata"))
      );
      expect(meta).to.include({ fromAttr: true });
      done();
    }, 10);
  });
});
