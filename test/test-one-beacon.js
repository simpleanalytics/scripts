const { expect } = require("chai");
const { getRequests } = require("./helpers");

module.exports = async () => {
  const beaconRequests = getRequests(global.REQUESTS, {
    body: { type: "append" }
  });

  expect(
    beaconRequests,
    "There should be 1 beacon type request"
  ).to.have.lengthOf(1);

  const request = beaconRequests[0];

  expect(
    request.pathname,
    "First beacon request should be send via GIF"
  ).to.equal("/simple.gif");

  expect(
    request,
    "There are no beacon requests with body found"
  ).to.have.property("body");

  expect(
    request.body,
    "All required keys should be present"
  ).to.include.all.keys([
    "version",
    "hostname",
    "duration",
    "scrolled",
    "original_id",
    "type",
    "time"
  ]);

  expect(
    parseInt(request.body.scrolled, 10),
    "Scrolled should be close to 35 percent"
  ).to.be.closeTo(35, 5);

  expect(
    parseInt(request.body.duration, 10),
    "Duration should be a valid number"
  ).to.be.a("number");

  expect(
    parseInt(request.body.version, 10),
    "Version should be a valid number"
  ).to.be.a("number");

  expect(parseInt(request.body.time, 10), "Time should be a number").to.be.a(
    "number"
  );
};
