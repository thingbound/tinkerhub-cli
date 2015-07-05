#!/usr/bin/env node
const readcommand = require('readcommand');
const chalk = require('chalk');
const tinkerhub = require('tinkerhub');
const out = require('./log');

const allDevices = tinkerhub.devices.collection(function() {
    return true;
});

if(process.argv.length > 2) {
    handleCommand(process.argv.slice(2), res => {
        if(res) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    });
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
                out.info('Press ^C again to exit.');
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

function withDevices(devices, func) {
    if(typeof devices === 'function') {
        func = devices;
        devices = allDevices;
    }

    if(devices.length > 0) {
        func();
    } else {
        setTimeout(func, 500);
    }
}


function handleDevices(args, next) {
    printDeviceList(allDevices, next);
}

function printDeviceList(devices, next) {
    const table = out.table();
    table.columns('Device', 'Tags');

    withDevices(devices, () => {
        const sorted = devices.listDevices().sort((a, b) => {
            const an = a.metadata.name || a.metadata.id;
            const bn = b.metadata.name || b.metadata.id;

            if(an > bn) return 1;
            if(an < bn) return -1;

            return 0;
        });

        sorted.forEach((device) =>
            table.row(
                device.metadata.id,
                device.metadata.tags.filter(function(tag) {
                    return tag !== device.metadata.id;
                }).join(',')
            )
        );

        table.print();

        out.info();
        out.info('Found', devices.length, devices.length === 1 ? 'device' : 'devices');

        if(next) next();
    });
}

function handleDevice(args, next) {
    const device = tinkerhub.devices.tagged.apply(tinkerhub.devices, args[0].split(','));
    withDevices(device, () => {
        if(device.length === 0) {
            out.error('No devices matching', chalk.gray(args[0]));
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
                    out.error('No tag specified');
                    return next(false);
                }
            } else {
                out.error('Don\'t know what to do with metadata');
                return next(false);
            }
        } else if(args[1]) {
            out.info('Invoking', chalk.gray(args[1]), 'on', device.length, device.length === 1 ? 'device' : 'devices');

            const action = device[args[1]];
            action.apply(device, args.slice(2))
                .then((result) => {
                    Object.keys(result).forEach((key) => {
                        const data = result[key];
                        if(data.error) {
                            out.info(chalk.bgRed.white(' ERROR '), key);
                            out.group();
                            out.info(data.error.message);
                            out.groupEnd();
                        } else {
                            out.info(chalk.bgGreen.white(' SUCCESS '), key);
                            if(typeof data.value !== 'undefined') {
                                out.group();
                                out.info(data.value);
                                out.groupEnd();
                            }
                        }
                    });

                    next(true);
                })
                .fail(() => next(false))
                .progress(data => {
                    out.info(chalk.bgWhite.black(' PROGRESS '), data.device);
                    out.group();
                    out.info(data.progress);
                    out.groupEnd();
                })
                .done();
        } else {
            printDeviceList(device, next);
        }
    });
}
