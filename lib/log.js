'use strict';

const prettyjson = require('prettyjson');
const chalk = require('chalk');

let indent = 0;
module.exports = {
    format: function() {
        let result = '';
        for(let i=0; i<arguments.length; i++) {
            if(i > 0) result += ' ';

			const data = arguments[i];
			if(typeof data === 'string') {
				result += data;
			} else if(typeof data === 'undefined' || data === null) {
				result += chalk.grey('N/A');
			} else if(data.id && data.metadata.matches) {
				// Assume this is a service or appliance
				const name = data.metadata.name;
				const id = data.id;

				if(name) {
					result += name + ' ' + chalk.grey(id);
				} else {
					result += chalk.grey(id);
				}
            } else {
                result += prettyjson.render(data);
            }
        }

        return result;
    },

    info: function() {
        this.format.apply(this, arguments).split('\n').forEach(msg => {
            for(let i=0; i<indent; i++) {
                process.stdout.write('  ');
            }

            process.stdout.write(msg);
            process.stdout.write('\n');
        });
    },

    error: function() {
        this.format.apply(this, arguments).split('\n').forEach(msg => {
            process.stderr.write(chalk.bgRed.white(' ERROR ') + ' ');
            for(let i=0; i<indent; i++) {
                process.stderr.write('  ');
            }

            process.stderr.write(msg);
            process.stderr.write('\n');
        });
    },

    group: function() {
        indent++;
    },

    groupEnd: function() {
        if(indent === 0) return;
        indent--;
    },

    table: function() {
        return new Table(this);
    }
};

function padValue(value, length, c) {
    c = c || ' ';
    let vLength = chalk.stripColor(value).length;
    return value + (length > vLength ? Array(length - vLength+1).join(c) : '');
}

class Table {
    constructor(parent) {
        this._parent = parent;
        this._rows = [];
    }

    columns() {
        this._columns = Array.prototype.slice.call(arguments);
        return this;
    }

    row() {
        if(! this._columns) {
            throw 'You need to set the columns before adding rows';
        }

        const row = Array.prototype.slice.call(arguments);
        if(row.length !== this._columns.length) {
            throw 'Number of entries in row does not match number of columns';
        }

        this._rows.push(row);

        return this;
    }

    print() {
        const widths = [];
        for(let i=0; i<this._columns.length; i++) {
            this._columns[i] = chalk.bold(this._parent.format(this._columns[i]));
            widths[i] = chalk.stripColor(this._columns[i]).length;
        }

        this._rows.forEach(row => {
            for(let i=0; i<row.length; i++) {
                row[i] = this._parent.format(row[i]);
                widths[i] = Math.max(widths[i], chalk.stripColor(row[i]).length);
            }
        });

        let pad = (value, i) => padValue(value, widths[i]);

        this._parent.info.apply(this._parent, this._columns.map(pad));
        this._parent.info.apply(this._parent, this._columns.map((c, i) =>
            padValue(padValue('', c.length, '='), widths[i]))
        );
        this._rows.forEach(row => this._parent.info.apply(this._parent, row.map(pad)));
    }
}
