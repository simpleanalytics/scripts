const { expect } = require("chai");
const UUIDvalidate = require("uuid-validate");
const { getRequests } = require("./helpers");

module.exports = async ({ os, browser }) => {
  const requests = getRequests(global.REQUESTS, {
    body: { type: "event" },
  });

  expect(requests, "There should be two event requests").to.have.lengthOf(3);

  expect(requests[0].body.event, "Event should be 'event_123'").to.equal(
    "event_123"
  );

  expect(requests[1].body.event, "Event should be 'functionoutput'").to.equal(
    "functionoutput"
  );

  expect(requests[2].body.metadata, "Event should have metadata").to.contain(
    '","bool":false,"int":20301,"string":"hi\'/301%20uas@#*0"}'
  );

  expect(
    new Date(JSON.parse(requests[2].body.metadata).date),
    "Event should have a date in the last 60 seconds"
  ).to.greaterThan(new Date(Date.now() - 60000));

  requests.map((request) => {
    expect(
      request,
      "There are no event requests with body found"
    ).to.have.property("body");

    expect(
      request.body,
      "All required keys should be present"
    ).to.include.all.keys([
      "version",
      "hostname",
      "event",
      "page_id",
      "session_id",
      "type",
    ]);

    expect(
      UUIDvalidate(request.body.session_id, 4),
      "session_id should be a valid UUIDv4"
    ).to.be.true;

    expect(
      UUIDvalidate(request.body.page_id, 4),
      "page_id should be a valid UUIDv4"
    ).to.be.true;

    if (os === "ios") {
      expect(
        /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/.test(request.body.hostname),
        "Hostname should be an IP on iOS"
      ).to.be.true;
    } else if (os === "OS X" && browser === "safari") {
      expect(
        request.body.hostname,
        "Hostname should be bs-local.com on OS X Safari"
      ).to.equal("bs-local.com");
    } else {
      expect(
        request.body.hostname,
        "Hostname should be localhost on non iOS"
      ).to.equal("localhost");
    }

    expect(
      parseInt(request.body.version, 10),
      "Version should be a valid number"
    ).to.be.a("number");
  });
};
