// Mock for cli-table3
class Table {
  constructor(options) {
    this.options = options;
    this.rows = [];
    this.head = options?.head || [];
  }

  push(row) {
    this.rows.push(row);
  }

  toString() {
    const headerRow = this.head.join(' | ');
    const dataRows = this.rows.map((row) => row.join(' | ')).join('\n');
    return `${headerRow}\n${dataRows}`;
  }
}

module.exports = Table;
module.exports.default = Table;
