const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("pageview query", function () {
  it("keeps accepting numeric manual paths and path-overwriter results", function () {
    const dom = createDOM({ settings: { autoCollect: false } });
    dom.window.sa_pageview(123);
    expect(new URL(dom.sent[0].url).searchParams.get("path")).to.equal("123");
    dom.window.close();

    const rewritten = createDOM({
      settings: { autoCollect: false, pathOverwriter: "rewrite" },
      beforeRun(context) {
        context.rewrite = () => 456;
      },
    });
    rewritten.window.sa_pageview("/product?product-id=1");
    expect(new URL(rewritten.sent[0].url).searchParams.get("path")).to.equal(
      "456"
    );
    rewritten.window.close();
  });

  it("keeps ignore-pages active for manual query paths", function () {
    const dom = createDOM({
      settings: { autoCollect: false, ignorePages: "/product" },
    });
    dom.window.sa_pageview("/product?product-id=1");
    expect(dom.sent).to.deep.equal([]);
    dom.window.close();
  });

  it("keeps the hash route when stripping a manual query", function () {
    const dom = createDOM({
      url: "https://example.com/#/deep",
      settings: { autoCollect: false, mode: "hash" },
    });
    dom.window.sa_pageview("/product?product-id=1");
    const url = new URL(dom.sent[0].url);
    expect(url.searchParams.get("path")).to.equal("/product#/deep");
    dom.window.close();
  });

  it("keeps manual pageviews that differ only in their query", function () {
    const dom = createDOM({ settings: { autoCollect: false } });
    dom.window.sa_pageview("/product?product-id=1");
    dom.window.sa_pageview("/product?product-id=2");
    const paths = dom.sent
      .filter((request) => request.type === "image")
      .map((request) => new URL(request.url).searchParams.get("path"));
    expect(paths).to.deep.equal(["/product", "/product"]);
    dom.window.close();
  });

  it("passes the complete manual path to the path overwriter", function () {
    const dom = createDOM({
      settings: { autoCollect: false, pathOverwriter: "rewrite" },
      beforeRun(context) {
        context.rewrite = (data) => data.path.replace("?product-id=", "/");
      },
    });
    dom.window.sa_pageview("/product?product-id=1");
    const url = new URL(dom.sent[0].url);
    expect(url.searchParams.get("path")).to.equal("/product/1");
    dom.window.close();
  });

  it("keeps browser query attribution for manual pageviews and events", function (done) {
    const dom = createDOM({
      url: "https://example.com/?utm_source=paid&foo=original",
      settings: { autoCollect: false, allowParams: "foo" },
    });

    dom.window.sa_pageview("/manual?foo=bar");
    dom.window.sa_event("buy");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmanual/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.get("query")).to.equal(
        "utm_source=paid&foo=original"
      );
      const event = dom.sent.find((request) => /event=buy/.test(request.url));
      expect(new URL(event.url).searchParams.get("query")).to.equal(
        url.searchParams.get("query")
      );
      done();
    }, 10);
  });

  it("matches allowed params case insensitively", function (done) {
    const dom = createDOM({
      url: "https://example.com/?FOO=bar",
      settings: { autoCollect: false, allowParams: "foo" },
    });

    dom.window.sa_pageview("/manual");

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
      url: "https://example.com/?gclid=secret&foo=another&empty=&flag",
      settings: { autoCollect: false },
    });

    dom.window.sa_pageview("/manual");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmanual/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.get("k")).to.equal("gclid,foo");
      expect(req.url).not.to.include("secret");
      expect(req.url).not.to.include("another");
      done();
    }, 10);
  });

  it("allows parameter name collection to be ignored", function (done) {
    const dom = createDOM({
      url: "https://example.com/?gclid=secret",
      settings: { autoCollect: false, ignoreMetrics: "querykeys" },
    });

    dom.window.sa_pageview("/manual");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fmanual/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.has("k")).to.equal(false);
      done();
    }, 10);
  });
});
