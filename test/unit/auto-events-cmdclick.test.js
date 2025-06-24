const { expect } = require("chai");
const { JSDOM } = require("jsdom");
const { readFileSync } = require("fs");
const vm = require("vm");

describe("auto-events cmd-click", function () {
  it("allows meta click without preventing default", function () {
    const html =
      '<!doctype html><html><body><a id="doc" href="https://docs.example.com/">Doc</a></body></html>';
    const dom = new JSDOM(html, {
      url: "https://simpleanalytics.com/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const context = dom.getInternalVMContext();
    vm.runInContext(
      "window.sa_event = function(){}; window.sa_event_loaded = true;",
      context
    );
    const script = readFileSync("dist/latest/auto-events.js", "utf8");
    vm.runInContext(script, context);
    const link = dom.window.document.getElementById("doc");
    const normalEvent = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    const metaEvent = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });

    const normalReturn = dom.window.saAutomatedLink(
      link,
      "outbound",
      normalEvent
    );
    const metaReturn = dom.window.saAutomatedLink(link, "outbound", metaEvent);

    expect(normalEvent.defaultPrevented).to.equal(true);
    expect(metaEvent.defaultPrevented).to.equal(false);
    expect(normalReturn).to.equal(false);
    expect(metaReturn).to.equal(true);
  });
});
