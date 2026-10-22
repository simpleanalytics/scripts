const { expect } = require("chai");
const { readFileSync } = require("fs");
const { runInNewContext } = require("vm");

describe("without a window", function () {
  for (const file of [
    "dist/latest/latest.js",
    "dist/latest/light.js",
    "dist/latest/auto-events.js",
  ]) {
    it(`loads ${file} without errors`, function () {
      expect(() =>
        runInNewContext(readFileSync(file, "utf8"), { console })
      ).not.to.throw();
    });
  }
});
