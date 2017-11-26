#!/usr/bin/env node
'use strict';

const readcommand = require('readcommand');
const chalk = require('chalk');
const tinkerhub = require('tinkerhub/endpoint');
const out = require('./log');

const updateNotifier = require('update-notifier');
updateNotifier({ pkg: require('../package.json') }).notify();

process.on('warning', (warning) => {
	out.info(chalk.bgYellow(' WARN '), warning.message);
	out.info(warning.stack);
});

process.on('error', (error) => {
	out.info(chalk.bgRed.white(' ERROR '), error.message);
	out.info(error.stack);
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
    let things = find(args[0]);
    handleInvocations(things, args, next);
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
				if(items.indexOf(tag) === -1) {
					items.push(tag);
				}
			}
		}

        items.sort();
    }

    if(args.length === 1) {
		// The user has typed something, also autocomplete thing ids
		for(const d of all) {
			items.push(d.metadata.id);
		}

        items.push('exit');
        items.push('close');
    }

    if(args.length === 2) {
        // Metadata is always present
        items.push('metadata');

        // Autocomplete actions
		let things = find(args[0]);
		for(const d of things) {
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
		items.push('actions');
	}

    return callback(null, filter(items, args[args.length - 1]));
}

function withThings(things, func) {
    if(typeof things === 'function') {
        func = things;
        things = tinkerhub.all();
    }

    if(things.length > 0) {
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
                    out.info(chalk.bgRed.white(' ERROR '), data.source);
					out.group();
					try {
						out.info(data.reason.message);
					} finally {
						out.groupEnd();
					}
                } else {
                    out.info(chalk.bgGreenBright.black(' SUCCESS '), data.source);
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

function handleInvocations(things, args, next) {
    withThings(things, () => {
        if(things.length === 0) {
            out.error('No things matching', chalk.gray(args[0]));
            return next(false);
        }

        if(args[1] === 'metadata') {
            if(args[2] === 'tag') {
                if(args[3]) {
                    handleCall(things.metadata.addTags(args[3]), next);
                } else {
                    out.error('No tag specified');
                    return next(false);
                }
            } else if(args[2] === 'removeTag') {
                if(args[3]) {
                    handleCall(things.metadata.removeTags(args[3]), next);
                } else {
                    out.error('No tag specified');
                    return next(false);
                }
            } else if(args[2] === 'setName') {
                if(args[3]) {
                    handleCall(things.metadata.setName(args[3]), next);
                } else {
                    out.error('No name specified');
                    return next(false);
				}
			} else if(args[2] === 'actions') {
				for(const thing of things) {
                    out.info(chalk.bgWhite.black(' ACTIONS '), thing);
					out.group();
					try {
						out.info(thing.metadata.actions);
					} finally {
						out.groupEnd();
					}
                }

                return next(true);
            } else {
                for(const thing of things) {
					const md = thing.metadata;
                    out.info(chalk.bgWhite.black(' METADATA '), thing);
					out.group();
					try {
						const def = {
							id: md.id,
							name: md.name,
							tags: Array.from(md.tags)
						};

						out.info(def);
					} finally {
						out.groupEnd();
					}
                }

                return next(true);
            }
        } else if(args[1]) {
            out.info('Invoking', chalk.gray(args[1]), 'on', things.length, things.length === 1 ? 'thing' : 'things');

			const action = things[args[1]];
			try {
				handleCall(action.apply(things, args.slice(2)), next);
			} catch(ex) {
				out.error(ex.message);
				next();
			}
        } else {
            printThingList(things, next);
        }
    });
}


function coloredTagList(id, tags) {
	let result = '';
	for(const tag of tags) {
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

function printThingList(things, next) {
    const table = out.table();
    table.columns('Thing', 'Tags');

    withThings(things, () => {
        const sorted = things.toArray().sort((a, b) => {
            const an = a.metadata.name || a.metadata.id;
            const bn = b.metadata.name || b.metadata.id;

            if(an > bn) return 1;
            if(an < bn) return -1;

            return 0;
        });

        sorted.forEach(thing =>
            table.row(
                thing,
                coloredTagList(thing.id, thing.metadata.tags)
            )
        );

        table.print();

        out.info();
        out.info('Found', things.length, things.length === 1 ? 'thing' : 'things');

        if(next) next();
    });
}
