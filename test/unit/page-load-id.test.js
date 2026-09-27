const { expect } = require("chai");
const { runInContext } = require("vm");
const { createDOM } = require("./helpers/dom");

const pageLoadId = "2c304ecc-1e0a-4fa6-86a8-1ba4684db774";
const attributeId = "e35432dd-4af3-40c3-90ad-5a95d8e4fb1f";
const requests = (dom) =>
  dom.sent
    .filter(({ type }) => type === "image")
    .map(({ url }) => new URL(url).searchParams);
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("server page-load ID", function () {
  it("links events emitted before a manual first pageview to the server record", async function () {
    const dom = createDOM({ settings: { pageLoadId, autoCollect: false } });
    dom.window.sa_event("early_event");
    await wait();
    const event = requests(dom).find(
      (params) => params.get("type") === "event"
    );
    expect(event.get("page_id")).to.equal(pageLoadId);
    expect(event.get("session_id")).to.equal(pageLoadId);
    dom.window.close();
  });

  it("enriches the initial record and creates new records for later pageviews", async function () {
    const dom = createDOM({ settings: { pageLoadId, autoCollect: false } });
    dom.window.sa_pageview("/first");
    await wait();
    dom.window.sa_event("signup");
    dom.window.sa_pageview("/second");
    await wait();

    const initial = requests(dom).find(
      (params) =>
        params.get("path") === "/first" && params.get("type") === "append"
    );
    expect(initial.get("original_id")).to.equal(pageLoadId);
    expect(initial.get("session_id")).to.equal(pageLoadId);
    expect(initial.get("collected_client_side")).to.equal("true");
    const event = requests(dom).find(
      (params) => params.get("type") === "event"
    );
    expect(event.get("page_id")).to.equal(pageLoadId);
    expect(event.get("id")).not.to.equal(pageLoadId);
    const second = requests(dom).find(
      (params) => params.get("type") === "pageview"
    );
    expect(second.get("path")).to.equal("/second");
    expect(second.get("id")).not.to.equal(pageLoadId);
    expect(second.get("session_id")).to.equal(pageLoadId);
    expect(second.has("original_id")).to.equal(false);
    dom.window.close();
  });

  for (const settings of [{}, { pageLoadId }]) {
    it(`reads the attribute with ${settings.pageLoadId ? "JavaScript precedence" : "no JavaScript setting"}`, async function () {
      const dom = createDOM({
        settings,
        beforeRun(context) {
          runInContext(
            `Object.defineProperty(document, "currentScript", { value: { getAttribute: function(name) { return name === "data-page-load-id" ? "${attributeId}" : null; } } });`,
            context
          );
        },
      });
      await wait();
      expect(requests(dom)[0].get("original_id")).to.equal(
        settings.pageLoadId || attributeId
      );
      dom.window.close();
    });
  }

  for (const invalidId of [
    undefined,
    "not-a-uuid",
    "e35432dd-4af3-70c3-90ad-5a95d8e4fb1f",
  ]) {
    it(`keeps normal collection for ${invalidId || "an absent ID"}`, async function () {
      const dom = createDOM({ settings: { pageLoadId: invalidId } });
      await wait();
      const initial = requests(dom)[0];
      expect(initial.get("type")).to.equal("pageview");
      expect(initial.has("original_id")).to.equal(false);
      dom.window.close();
    });
  }

  it("merges when duration and scroll are disabled, without reusing the record on navigation", async function () {
    const dom = createDOM({
      settings: {
        pageLoadId,
        autoCollect: false,
        ignoreMetrics: "timeonpage,scrolled,sessions",
      },
    });
    dom.window.sa_pageview("/first");
    await wait();
    dom.window.sa_pageview("/next");
    await wait();
    const [initial, next] = requests(dom);
    expect(initial.get("original_id")).to.equal(pageLoadId);
    expect(initial.has("session_id")).to.equal(false);
    expect(next.get("type")).to.equal("pageview");
    expect(next.get("id")).not.to.equal(pageLoadId);
    dom.window.close();
  });
});
