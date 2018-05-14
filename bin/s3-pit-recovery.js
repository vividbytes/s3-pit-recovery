#!/usr/bin/env node

const program = require('commander');
const colors = require('colors');
const inquirer = require('inquirer');
const { version } = require('../package.json');
const { getObjects, restoreObjects, ValidationError } = require('../index.js');

colors.setTheme({
    error: 'red'
});

program
    .version(version)
    .option('-b, --bucket <value>', '(Required) S3 bucket to restore')
    .option('-d, --destinationBucket <value>', '(Required) Destination bucket')
    .option(
        '-r, --destinationBucketRegion <value>',
        'Destination bucket region. Default: us-east-1'
    )
    .option('-p, --prefix <value>', 'Filter by S3 object prefix')
    .option('-t, --time <value>', 'Time to restore to. Default: current time.')
    .option(
        '-T, --glacierTier <value>',
        'Glacier tier. Must be one of "Standard", "Expedited", "Bulk"'
    )
    .option(
        '-D, --glacierDays <value>',
        'Lifetime of the active copy in days. Must be a positive integer. Default: 7'
    )
    .parse(process.argv);

async function inquireRecovery({ s3Objects, glacierObjects }) {
    return inquirer.prompt([
        {
            when: glacierObjects.length > 0,
            type: 'list',
            name: 'glacierRecovery',
            message: `Found ${
                glacierObjects.length
            } objects in glacier. Objects stored in Glacier cannot be recovered until they've been restored. Do you want to send restore requests for these objects?`,
            choices: ['Yes', 'No']
        },
        {
            when: s3Objects.length > 0,
            type: 'list',
            name: 's3Recovery',
            message: `Found ${s3Objects.length} objects in s3. Do you want to restore them?`,
            choices: ['Yes', 'No']
        }
    ]);
}

async function inquireS3(s3Objects, glacierObjects) {
    return inquirer.prompt([]);
}

async function run(options) {
    let objects, recoveryMethod;

    try {
        objects = await getObjects(options);
    } catch (e) {
        handleErrors(e);
    }

    const { s3Recovery, glacierRecovery } = await inquireRecovery(objects);

    if (s3Recovery === 'Yes' || glacierRecovery === 'Yes') {
        try {
            await restoreObjects(
                objects,
                Object.assign(options, {
                    recoverS3: s3Recovery === 'Yes',
                    recoverGlacier: glacierRecovery === 'Yes'
                })
            );
        } catch (e) {
            handleErrors(e);
        }
    }

    process.exit(0);
}

function handleErrors(e) {
    if (e instanceof ValidationError) {
        console.error(colors.red(e.message));
        process.exit(1);
    } else {
        console.error(colors.red(e));
        process.exit(2);
    }
}

run(program);
