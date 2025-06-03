const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("manual pageview utm", function () {
  it("parses utm params from manual path", function (done) {
    const dom = createDOM({ settings: { autoCollect: false } });

    dom.window.sa_pageview("/sa/1/1/1/1?utm_source=test&utm_medium=email");

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fsa%2F1%2F1%2F1%2F1/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      const url = new URL(req.url);
      expect(url.searchParams.get("query")).to.equal(
        "utm_source=test&utm_medium=email"
      );
      done();
    }, 10);
  });
});
