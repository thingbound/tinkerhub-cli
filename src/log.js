const prettyjson = require('prettyjson');
const chalk = require('chalk');
const th = require('tinkerhub');

let indent = 0;
module.exports = {
    format: function() {
        let result = '';
        for(let i=0; i<arguments.length; i++) {
            if(i > 0) result += ' ';

            const data = arguments[i];
            if(typeof data === 'string') {
                const device = th.devices.get(data);
                if(device) {
                    if(device.metadata.def.name) {
                        result += device.metadata.def.name + ' ' +
                            chalk.gray('(' + device.metadata.id + ')');
                    } else {
                        result += chalk.gray(device.metadata.id);
                    }
                } else {
                    result += data;
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
    }
};
