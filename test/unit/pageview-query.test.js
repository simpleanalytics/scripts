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

  it("matches allowed params case insensitively", function (done) {
    const dom = createDOM({
      settings: { autoCollect: false, allowParams: "foo" },
    });

    dom.window.sa_pageview("/manual?FOO=bar");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmanual/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.get("query")).to.equal("FOO=bar");
      done();
    }, 10);
  });

  it("sends non-empty parameter names without their values", function (done) {
    const dom = createDOM({
      settings: { autoCollect: false },
    });

    dom.window.sa_pageview("/manual?gclid=secret&foo=another&empty=&flag");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmanual/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.get("p")).to.equal("gclid,foo");
      expect(req.url).not.to.include("secret");
      expect(req.url).not.to.include("another");
      done();
    }, 10);
  });

  it("allows parameter name collection to be ignored", function (done) {
    const dom = createDOM({
      settings: { autoCollect: false, ignoreMetrics: "params" },
    });

    dom.window.sa_pageview("/manual?gclid=secret");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmanual/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.has("p")).to.equal(false);
      done();
    }, 10);
  });
});
