const { expect } = require("chai");
const { getRequests } = require("./helpers");

module.exports = async () => {
  const beaconRequests = getRequests(global.REQUESTS, {
    body: { type: "append" }
  });

  expect(
    beaconRequests,
    "There are not enough beacon requests found"
  ).to.have.lengthOf(2);

  expect(
    beaconRequests[0].pathname,
    "First beacon request should be send via GIF"
  ).to.equal("/simple.gif");

  expect(
    beaconRequests[1].pathname,
    "Second beacon request should be send via /append"
  ).to.equal("/append");

  beaconRequests.map(request => {
    expect(
      request,
      "There are no page view requests with body found"
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
      "type"
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
  });
};
