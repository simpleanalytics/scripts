const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("pageview query", function () {
  it("sends query params from manual path", function (done) {
    const dom = createDOM({
      settings: { autoCollect: false, allowParams: "foo" },
    });

    dom.window.sa_pageview("/manual?foo=bar");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmanual/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.get("query")).to.equal("foo=bar");
      done();
    }, 10);
  });
});
