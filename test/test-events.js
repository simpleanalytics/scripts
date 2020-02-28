const { expect } = require("chai");
const UUIDvalidate = require("uuid-validate");
const { getRequests } = require("./helpers");

module.exports = async () => {
  const requests = getRequests(global.REQUESTS, {
    body: { type: "event" }
  });

  expect(requests, "There should be two event requests").to.have.lengthOf(2);

  expect(requests[0].body.event, "Event should be 'event_123'").to.equal(
    "event_123"
  );

  expect(requests[1].body.event, "Event should be 'functionoutput'").to.equal(
    "functionoutput"
  );

  requests.map(request => {
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
      "session_id",
      "type"
    ]);

    expect(
      UUIDvalidate(request.body.session_id, 4),
      "session_id should be a valid UUIDv4"
    ).to.be.true;

    expect(request.body.hostname, "Hostname should be localhost").to.equal(
      "localhost"
    );

    expect(
      parseInt(request.body.version, 10),
      "Version should be a valid number"
    ).to.be.a("number");
  });
};
