// Mock for chalk
const chalk = {
  level: 1,
  bold: jest.fn((text) => text),
  cyan: jest.fn((text) => text),
  green: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  red: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  white: jest.fn((text) => text),
  blue: jest.fn((text) => text),
};

// Support chaining
chalk.bold.cyan = jest.fn((text) => text);
chalk.bold.white = jest.fn((text) => text);
chalk.bold.green = jest.fn((text) => text);
chalk.bold.red = jest.fn((text) => text);
chalk.cyan.bold = jest.fn((text) => text);
chalk.red.bold = jest.fn((text) => text);

module.exports = chalk;
module.exports.default = chalk;
