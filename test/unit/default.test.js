const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { expect } = require("chai");

describe("default script", function () {
  it("sends pageview and event", function () {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
    });

    const requests = [];

    dom.window.Image = function () {
      return {
        set src(value) {
          requests.push({ type: "image", url: value });
        },
      };
    };

    dom.window.navigator.sendBeacon = function (url, data) {
      requests.push({ type: "beacon", url, data });
      return true;
    };

    const context = vm.createContext({
      window: dom.window,
      document: dom.window.document,
      navigator: dom.window.navigator,
      console: dom.window.console,
      Image: dom.window.Image,
    });

    const scriptPath = path.resolve(
      __dirname,
      "../../dist/latest/latest.dev.js",
    );
    const scriptContent = fs.readFileSync(scriptPath, "utf8");
    vm.runInContext(scriptContent, context);

    expect(requests.length).to.be.greaterThan(0);
    const pvUrl = new URL(requests[0].url);
    expect(pvUrl.pathname).to.equal("/simple.gif");
    expect(pvUrl.searchParams.get("type")).to.equal("pageview");

    dom.window.sa_event("unit_test");

    expect(requests.length).to.be.greaterThan(1);
    const evUrl = new URL(requests[requests.length - 1].url);
    expect(evUrl.searchParams.get("type")).to.equal("event");
    expect(evUrl.searchParams.get("event")).to.equal("unit_test");
  });
});
