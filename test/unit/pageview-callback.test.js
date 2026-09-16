const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("pageview callback", function () {
  it("executes callback after sending a pageview", function (done) {
    const dom = createDOM({ settings: { autoCollect: false } });

    const sent = dom.sent;
    dom.window.Image = function () {
      return {
        onload: null,
        onerror: null,
        set src(value) {
          sent.push({ type: "image", url: value });
          if (this.onload) this.onload();
        },
      };
    };

    let called = false;
    dom.window.sa_pageview("/callback", function () {
      called = true;
    });

    setTimeout(() => {
      const req = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fcallback/.test(r.url)
      );
      expect(req, "pageview request").to.exist;
      expect(called, "callback called").to.be.true;
      done();
    }, 10);
  });
});
