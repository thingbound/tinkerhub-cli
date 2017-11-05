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
    let devices = find(args[0]);
    handleDeviceInvocations(devices, args, next);
}

function find(arg) {
    switch(arg) {
        case 'all':
            return tinkerhub.all();
        default:
            return tinkerhub.get(...arg.split(','));
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

    const all = tinkerhub.all();

    if(args.length === 0 || args.length === 1) {
        items.push('all');

		for(const d of all) {
			for(const tag of d.metadata.tags) {
				if(tag.indexOf('id:') !== 0 && items.indexOf(tag) === -1) {
					items.push(tag);
				}
			}
		}

        items.sort();
    }

    if(args.length === 1) {
		// The user has typed something, also autocomplete device ids
		for(const d of all) {
			items.push('id:' + d.metadata.id);
		}

        items.push('exit');
        items.push('close');
    }

    if(args.length === 2) {
        // Metadata is always present
        items.push('metadata');

        // Autocomplete device actions
		let devices = find(args[0]);
		for(const d of devices) {
			console.log(d.metadata.actions);
            Object.keys(d.metadata.actions).forEach(action => {
                if(items.indexOf(action) === -1) {
                    items.push(action);
                }
            });
        }

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
    promise
        .then((result) => {
            result.forEach(data => {
                if(data.isRejected) {
                    out.info(chalk.bgRed.white(' ERROR '), data.source.id);
					out.group();
					try {
						out.info(data.reason.message);
					} finally {
						out.groupEnd();
					}
                } else {
                    out.info(chalk.bgGreen.white(' SUCCESS '), data.source.id);
                    if(typeof data.value !== 'undefined') {
                        out.group();
                        try {
                            out.info(data.value);
                        } finally {
                            out.groupEnd();
                        }
                    }
                }
            });

            next(true);
        })
        .catch(err => {
			out.error(err);
			next(false);
		});
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
					try {
						out.info(device.metadata.def);
					} finally {
						out.groupEnd();
					}
                });

                return next(true);
            }
        } else if(args[1]) {
            out.info('Invoking', chalk.gray(args[1]), 'on', devices.length, devices.length === 1 ? 'device' : 'devices');

			const action = devices[args[1]];
			try {
				handleCall(action.apply(devices, args.slice(2)), next);
			} catch(ex) {
				out.error(ex.message);
				next();
			}
        } else {
            printDeviceList(devices, next);
        }
    });
}


function coloredTagList(id, tags) {
	let result = '';
	for(const tag of tags) {
		if(tag.indexOf('id:') === 0) continue;

		const idx = tag.indexOf(':');
		if(idx === -1) {
			result += tag;
		} else {
			const ns = tag.substring(0, idx);
			switch(ns) {
				case 'type':
					result += chalk.blue(tag);
					break;
				case 'cap':
					result += chalk.magenta(tag);
					break;
				default:
				result += tag;
			}
		}
		result += ' ';
	}
	return result;
}

function printDeviceList(devices, next) {
    const table = out.table();
    table.columns('Device', 'Tags');

    withDevices(devices, () => {
        const sorted = devices.toArray().sort((a, b) => {
            const an = a.metadata.name || a.metadata.id;
            const bn = b.metadata.name || b.metadata.id;

            if(an > bn) return 1;
            if(an < bn) return -1;

            return 0;
        });

        sorted.forEach((device) =>
            table.row(
                device.id,
                coloredTagList(device.id, device.metadata.tags)
            )
        );

        table.print();

        out.info();
        out.info('Found', devices.length, devices.length === 1 ? 'device' : 'devices');

        if(next) next();
    });
}
