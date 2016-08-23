#!/usr/bin/env node
'use strict';

const readcommand = require('readcommand');
const chalk = require('chalk');
const tinkerhub = require('tinkerhub');
const out = require('./log');

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

    const opts = {
        autocomplete: handleAutocomplete
    };

    readcommand.loop(opts, (err, args, str, next) => {
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
    let devices = toDevices(args[0]);
    handleDeviceInvocations(devices, args, next);
}

function toDevices(arg) {
    switch(arg) {
        case 'all':
            return tinkerhub.devices.all();
        default:
            return tinkerhub.devices.tagged.apply(tinkerhub.devices, arg.split(','));
    }
}

function filter(value, term) {
    if(! term) return value;

    if(Array.isArray(value)) {
        return value.filter((v) => filter(v, term));
    } else {
        return value.indexOf(term) === 0;
    }
}

function handleAutocomplete(args, callback) {
    const items = [];

    const all = tinkerhub.devices.all();

    if(args.length === 0 || args.length === 1) {
        items.push('all');

        all.forEach(d => d.metadata.tags.forEach(tag => {
            if(d.metadata.id !== tag && items.indexOf(tag) === -1) {
                items.push(tag);
            }
        }));

        items.sort();
    }

    if(args.length === 1) {
        // The user has typed something, also autocomplete device ids
        all.forEach(d => items.push(d.metadata.id));

        items.push('exit');
        items.push('close');
    }

    if(args.length === 2) {
        // Metadata is always present
        items.push('metadata');

        // Autocomplete device actions
        let devices = toDevices(args[0]);
        devices.forEach(d => {
            Object.keys(d.metadata.actions).forEach(action => {
                if(items.indexOf(action) === -1) {
                    items.push(action);
                }
            });
        });

        items.sort();
    }

    if(args.length === 3 && args[1] === 'metadata') {
        // Metadata completion
        items.push('tag');
        items.push('removeTag');
        items.push('setName');
    }

    return callback(null, filter(items, args[args.length - 1]));
}

function withDevices(devices, func) {
    if(typeof devices === 'function') {
        func = devices;
        devices = tinkerhub.devices.all();
    }

    if(devices.length > 0) {
        func();
    } else {
        setTimeout(func, 500);
    }
}

function handleCall(promise, next) {
    promise.then((result) => {
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
}

function handleDeviceInvocations(devices, args, next) {
    withDevices(devices, () => {
        if(devices.length === 0) {
            out.error('No devices matching', chalk.gray(args[0]));
            return next(false);
        }

        if(args[1] === 'metadata') {
            if(args[2] === 'tag') {
                if(args[3]) {
                    handleCall(devices.metadata.tag(args[3]), next);
                } else {
                    out.error('No tag specified');
                    return next(false);
                }
            } else if(args[2] === 'removeTag') {
                if(args[3]) {
                    handleCall(devices.metadata.removeTag(args[3]), next);
                } else {
                    out.error('No tag specified');
                    return next(false);
                }
            } else if(args[2] === 'setName') {
                if(args[3]) {
                    handleCall(devices.metadata.setName(args[3]), next);
                } else {
                    out.error('No name specified');
                    return next(false);
                }
            } else {
                devices.forEach(device => {
                    out.info(chalk.bgWhite.black(' METADATA '), device.metadata.id);
                    out.group();
                    out.info(device.metadata.def);
                    out.groupEnd();
                });

                return next(true);
            }
        } else if(args[1]) {
            out.info('Invoking', chalk.gray(args[1]), 'on', devices.length, devices.length === 1 ? 'device' : 'devices');

            const action = devices[args[1]];
            handleCall(action.apply(devices, args.slice(2)), next);
        } else {
            printDeviceList(devices, next);
        }
    });
}


function coloredTagList(tags) {
    return tags.map(tag => {
        const idx = tag.indexOf(':');
        if(idx === -1) return tag;

        const ns = tag.substring(0, idx);
        switch(ns) {
            case 'type':
                return chalk.blue(tag);
            case 'cap':
                return chalk.magenta(tag);
        }

        return chalk.gray(tag);
    }).join(' ');
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
                coloredTagList(device.metadata.tags.filter(function(tag) {
                    return tag !== device.metadata.id;
                }))
            )
        );

        table.print();

        out.info();
        out.info('Found', devices.length, devices.length === 1 ? 'device' : 'devices');

        if(next) next();
    });
}
