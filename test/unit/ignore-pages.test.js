const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

describe("ignore pages", function () {
  it("does not send a request for ignored paths", function (done) {
    const dom = createDOM({
      settings: { autoCollect: false, ignorePages: "/ignore" },
    });

    dom.window.sa_pageview("/ignore");
    dom.window.sa_pageview("/allowed");

    setTimeout(() => {
      const ignoreReq = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fignore/.test(r.url)
      );
      const allowedReq = dom.sent.find(
        (r) => r.type === "image" && /path=%2Fallowed/.test(r.url)
      );

      expect(ignoreReq, "request for ignored path").to.not.exist;
      expect(allowedReq, "request for allowed path").to.exist;
      done();
    }, 10);
  });
});
