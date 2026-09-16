const { expect } = require("chai");
const { createDOM } = require("./helpers/dom-auto-events");

function setupDOM() {
  const events = [];
  const dom = createDOM({
    beforeRun(vm) {
      vm.sa_event = function (name, metadata, cb) {
        events.push({ name, metadata });
        if (typeof cb === "function") cb();
      };
      vm.sa_event_loaded = true;
    },
  });
  dom.events = events;
  return dom;
}

describe("auto-events", function () {
  it("tracks outbound link clicks", function (done) {
    const dom = setupDOM();
    const link = dom.window.document.createElement("a");
    link.href = "https://example.org/path";
    link.target = "_blank";
    dom.window.document.body.appendChild(link);

    dom.window.saAutomatedLink(link, "outbound");

    setTimeout(() => {
      expect(dom.events[0]).to.deep.include({ name: "outbound_example_org" });
      expect(dom.events[0].metadata).to.include({ url: link.href });
      done();
    }, 0);
  });

  it("tracks download link clicks", function (done) {
    const dom = setupDOM();
    const link = dom.window.document.createElement("a");
    link.href = "https://example.com/file.pdf";
    link.target = "_blank";
    dom.window.document.body.appendChild(link);

    dom.window.saAutomatedLink(link, "download");

    setTimeout(() => {
      expect(dom.events[0]).to.deep.include({ name: "download_file_pdf" });
      expect(dom.events[0].metadata).to.include({ url: link.href });
      done();
    }, 0);
  });

  it("tracks email link clicks", function (done) {
    const dom = setupDOM();
    const link = dom.window.document.createElement("a");
    link.href = "mailto:test@example.com";
    link.target = "_blank";
    dom.window.document.body.appendChild(link);

    dom.window.saAutomatedLink(link, "email");

    setTimeout(() => {
      expect(dom.events[0]).to.deep.include({ name: "email_test_example_com" });
      expect(dom.events[0].metadata).to.include({ email: "test@example.com" });
      done();
    }, 0);
  });
});
