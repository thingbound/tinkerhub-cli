#!/usr/bin/env node
const readcommand = require('readcommand');
const chalk = require('chalk');
const tinkerhub = require('tinkerhub');

const allDevices = tinkerhub.devices.collection(function() {
    return true;
});

if(process.argv.length > 2) {
    setTimeout(function() {
        handleCommand(process.argv.slice(2), res => {
            if(res) {
                process.exit(0);
            } else {
                process.exit(1);
            }
        });
    }, 500);
} else {
    let sigints = 0;

    readcommand.loop((err, args, str, next) => {
        if (err && err.code !== 'SIGINT') {
            throw err;
        } else if (err) {
            if (sigints === 1) {
                process.exit(0);
            } else {
                sigints++;
                console.log('Press ^C again to exit.');
                return next();
            }
        } else {
            sigints = 0;
        }

        if(args[0] === 'exit' || args[1] === 'quit') {
            process.exit(0);
        } else if(args.length) {
            return handleCommand(args, next);
        } else {
            next();
        }
    });
}

function handleCommand(args, next) {
    switch(args[0]) {
        case 'devices':
            handleDevices(args, next);
            break;
        default:
            handleDevice(args, next);
            break;
    }
}

function pad(value, length) {
    value = String(value);
    return value + (length > value.length ? Array(length - value.length+1).join(' ') : '');
}

function handleDevices(args, next) {
    console.log(chalk.bold(pad('Id', 20)) + '  ' + chalk.bold(pad('Name', 30)) + '  ' + chalk.bold(pad('Tags', 50)));
    console.log(pad('--', 20) + '  ' + pad('----', 30) + '  ' + pad('----', 50));
    allDevices.forEach((device) =>
        console.log(
            pad(device.metadata.id, 20) + '  ' +
            pad(device.metadata.def.name, 30) + '  ' +
            pad(device.metadata.tags.filter(function(tag) {
                return tag !== device.metadata.id;
            }).join(','), 50)
        )
    );

    next();
}

function handleDevice(args, next) {
    const device = tinkerhub.devices.tagged.apply(tinkerhub.devices, args[0].split(','));
    if(! device) {
        console.log('Unknown device ' + args[0]);
        return next(false);
    }

    if(args[1] === 'metadata') {
        if(args[2] === 'tag') {
            if(args[3]) {
                device.metadata.tag(args[3])
                    .then(() => next(true))
                    .fail(() => next(false))
                    .done();
            } else {
                console.log(chalk.red.bold('No tag specified'));
                return next(false);
            }
        } else {
            console.log(chalk.red.bold('Don\'t know what to do with metadata'));
            return next(false);
        }
    } else if(args[1]) {
        const action = device[args[1]];
        action.apply(device, args.slice(2))
            .then((result) => {
                console.log(chalk.bold('Result:'), JSON.stringify(result, null, 2));
                next(true);
            })
            .fail(() => next(false))
            .progress((data) =>
                console.log(chalk.bold('Progress:'), JSON.stringify(data, null, 2))
            )
            .done();
    } else {
        console.log('No action to run specified');
        return next(false);
    }
}
