const AWS = require('aws-sdk');
const Promise = require('bluebird');
const S3 = new AWS.S3();
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');

const mkdirAsync = promisify(fs.mkdir);

async function getObjectsToRecover(options) {
    let isMore = true;
    let nextKey; 
    const objects = {};
    const deleteMarkers = {};

    while(isMore) {
	let data = await S3.listObjectVersions({
	    Bucket: options.bucket,
	    Prefix: options.prefix,
	    KeyMarker: nextKey,
	    MaxKeys: 6
	}).promise();

	data.DeleteMarkers.forEach(obj => {
	    const currObj = deleteMarkers[obj.Key];
	    const lastModified = new Date(obj.LastModified);

	    if (!currObj && obj.LastModified <= options.time) {
		deleteMarkers[obj.Key] = obj;
	    } else if (currObj &&
		       lastModified <= options.time &&
		       lastModified > new Date(currObj.LastModified)
		      ) {
		deleteMarkers[obj.Key] = obj;
	    }
	});

	data.Versions.forEach(obj => {
	    const currObj = objects[obj.Key];
	    const lastModified = new Date(obj.LastModified);

	    if (!currObj && obj.LastModified <= options.time) {
		objects[obj.Key] = obj;
	    } else if (currObj &&
		       lastModified <= options.time &&
		       lastModified > new Date(currObj.LastModified)
		      ) {
		objects[obj.Key] = obj;
	    }
	});

	isMore = data.IsTruncated;
	nextKey = data.NextKeyMarker;
    }

    Object.keys(deleteMarkers).forEach(key => {
	const deleteMarker = deleteMarkers[key];
	const object = objects[key];

	if (!object) {
	    return;
	}

	if (new Date(object.LastModified) < new Date(deleteMarker.LastModified)) {
	    delete objects[key];
	}
    });

    return objects;
}

async function requestObjectRecovery(obj, options) {
    console.log('restoring object from Glacier', obj.Key);

    return S3.restoreObject({
	Bucket: options.bucket,
	Key: obj.Key,
	VersionId: obj.VersionId,
	RestoreRequest: {
	    Days: options.glacierDays,
	    GlacierJobParameters: {
		Tier: options.glacierTier
	    }
	}
    }).promise();
}

async function retrieveObject(obj, options) {
    console.log('retrieving object from S3', obj.Key);

    return new Promise((resolve, reject) => {
	const pipe = S3.getObject({
	    Bucket: options.bucket,
	    Key: obj.Key,
	    VersionId: obj.VersionId
	})
	.createReadStream()
	.pipe(fs.createWriteStream(path.resolve(options.destination, obj.Key)))
	.on('finish', resolve)
	.on('error', reject);
    });
}


async function s3PitRecovery(options = {}) {
    validateConfig(options);

    const defaultOptions = {
	time: new Date(),
	prefix: '',
	glacierTier: 'Standard',
	glacierDays: 3
    };

    const config = Object.assign({}, defaultOptions, options);
    config.time = new Date(config.time);


    await mkdirAsync(options.destination);

    const objects =  await getObjectsToRecover(config);

    return Promise.map(Object.keys(objects).map(key => objects[key]), obj => {
    	if (obj.StorageClass === 'GLACIER') {
	    return requestObjectRecovery(obj, config);
    	} else {
    	    return retrieveObject(obj, config);
    	}
    }, { concurrency: 10 });
}

class ValidationError extends Error {}

function validateConfig(config) {

    if (!config.destination) {
	throw new ValidationError('parameter --destination is required');
    }

    if (!config.bucket) {
	throw new ValidationError('parameter --bucket is required');
    }

    if (
	config.clacierTier &&
	!['Standard', 'Expedited', 'Bulk'].includes(config.glacierTier)) {
	throw new ValidationError('parameter --glacierTier must be one of Standard, Expedited, Bulk');
    }

    if (
	    config.glacierDays &&
	    (
		!/^[0-9]+$/.test(config.glacierDays) ||
		/^0+$/.test(config.glacierDays)
	    )
       ) {
	throw new ValidationError('parameter --glacierDays must be a positive integer');
    }

    if (
	config.time &&
	new Date(config.time).toString() === 'Invalid Date'
    ) {
	throw new ValidationError('parameter --time must be a valid JSON string');
    }

}


module.exports = {
    recoverBucket: s3PitRecovery,
    ValidationError: ValidationError
};
