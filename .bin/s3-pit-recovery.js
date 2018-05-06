#!/usr/bin/env node

const program = require('commander');
const { recoverBucket, ValidationError } = require('../index.js');
const colors = require('colors');
const { version } = require('../package.json');

colors.setTheme({
    error: 'red'
});

program
    .version(version)
    .option('-b, --bucket <value>', '(Required) S3 bucket to restore')
    .option('-d, --destination <value>', '(Required) Destination folder')
    .option('-p, --prefix <value>', 'Filter by S3 object prefix')
    .option('-t, --time <value>', 'Time to restore to. Defaults to current time.')
    .option(
        '-T, --glacierTier <value>',
        'Glacier tier. Must be one of "Standard", "Expedited", "Bulk"'
    )
    .option('-D, --glacierDays <value>', 'Glacier days. Must be a positive integer')
    .parse(process.argv);

recoverBucket(program).catch(e => {
    if (e instanceof ValidationError) {
        console.error(colors.red(e.message));
        process.exit(1);
    } else {
        console.error(colors.red(e));
        process.exit(2);
    }
});
