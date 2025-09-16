// Mock for log-update
const logUpdate = jest.fn((_text) => {
  // Silently consume the text
});

logUpdate.clear = jest.fn();
logUpdate.done = jest.fn();

module.exports = logUpdate;
module.exports.default = logUpdate;
