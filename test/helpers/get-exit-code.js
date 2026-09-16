module.exports = ({ stopOnFail, amountFailures }) =>
  stopOnFail && amountFailures > 0 ? 1 : 0;
