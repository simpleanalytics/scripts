const { expect } = require("chai");
const getExitCode = require("../helpers/get-exit-code");

describe("get exit code", function () {
  it("returns a numeric exit code for passing and failing runs", function () {
    expect(getExitCode({ stopOnFail: true, amountFailures: 0 })).to.equal(0);
    expect(getExitCode({ stopOnFail: true, amountFailures: 1 })).to.equal(1);
  });

  it("returns zero when stopping on failures is disabled", function () {
    expect(getExitCode({ stopOnFail: false, amountFailures: 1 })).to.equal(0);
  });
});
