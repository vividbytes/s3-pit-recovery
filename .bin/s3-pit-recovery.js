#!/usr/bin/env node
 
const program = require('commander');
const { recoverBucket, ValidationError } = require('../index.js');
const colors = require('colors');

colors.setTheme({
  error: 'red'
});
 

program
  .version('0.0.1')
  .option('-b, --bucket [string]', 'S3 bucket to restore')
  .option('-p, --prefix [string]', 'Object prefix')
  .option('-d, --destination [string]', 'Destination folder')
  .option('-t, --time [json date-string]', 'Time to restore to')
  .option('-T, --glacierTier [Standard|Expedited|Bulk]', 'Glacier tier')
  .option('-D, --glacierDays [integer]', 'Glacier days')
  .parse(process.argv);

recoverBucket(program)
    .catch(e => {
	if (e instanceof ValidationError) {
	    console.error(colors.red(e.message));
	    process.exit(1);
	} else {
	    console.error(colors.red(e));
	    process.exit(2);
	}
    });
