// Mock for ora
const ora = jest.fn(() => {
  const spinner = {
    start: jest.fn(function () {
      return this;
    }),
    stop: jest.fn(function () {
      return this;
    }),
    succeed: jest.fn(function () {
      return this;
    }),
    fail: jest.fn(function () {
      return this;
    }),
    warn: jest.fn(function () {
      return this;
    }),
    info: jest.fn(function () {
      return this;
    }),
    text: '',
    color: 'cyan',
    spinner: 'dots',
  };
  return spinner;
});

module.exports = ora;
module.exports.default = ora;
