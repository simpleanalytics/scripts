const { expect } = require("chai");
const { createDOM } = require("./helpers/dom");

function createLoadingDOM(settings) {
  const dom = createDOM({ settings: { autoCollect: false, ...settings } });

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

  return dom;
}

function sentPaths(dom) {
  return dom.sent.map((r) => new URL(r.url).searchParams.get("path"));
}

describe("pageview callback", function () {
  it("executes callback once after sending a pageview", function (done) {
    const dom = createLoadingDOM();

    let calls = 0;
    dom.window.sa_pageview("/callback", function () {
      calls++;
    });

    setTimeout(() => {
      expect(sentPaths(dom), "pageview requests").to.deep.equal(["/callback"]);
      expect(calls, "callback calls").to.equal(1);
      done();
    }, 10);
  });

  it("executes callback when a repeated path is skipped", function (done) {
    const dom = createLoadingDOM();

    const calls = [0, 0];
    dom.window.sa_pageview("/same", function () {
      calls[0]++;
    });
    dom.window.sa_pageview("/same", function () {
      calls[1]++;
    });

    setTimeout(() => {
      expect(sentPaths(dom), "pageview requests").to.deep.equal(["/same"]);
      expect(calls, "callback calls").to.deep.equal([1, 1]);
      done();
    }, 10);
  });

  it("executes callback when an ignored path is skipped", function (done) {
    const dom = createLoadingDOM({ ignorePages: "/ignore" });

    let calls = 0;
    dom.window.sa_pageview("/ignore", { plan: "free" }, function () {
      calls++;
    });

    setTimeout(() => {
      expect(sentPaths(dom), "pageview requests").to.deep.equal([]);
      expect(calls, "callback calls").to.equal(1);
      done();
    }, 10);
  });

  it("executes callback when a namespaced pageview is skipped", function (done) {
    const dom = createLoadingDOM({ namespace: "ba", ignorePages: "/ignore" });

    const calls = [0, 0, 0];
    dom.window.ba_pageview("/same", function () {
      calls[0]++;
    });
    dom.window.ba_pageview("/same", { plan: "free" }, function () {
      calls[1]++;
    });
    dom.window.ba_pageview("/ignore", function () {
      calls[2]++;
    });

    setTimeout(() => {
      expect(sentPaths(dom), "pageview requests").to.deep.equal(["/same"]);
      expect(calls, "callback calls").to.deep.equal([1, 1, 1]);
      done();
    }, 10);
  });
});
