const AWS = require('aws-sdk');
const Promise = require('bluebird');
const S3 = new AWS.S3();
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');

const mkdirAsync = promisify(fs.mkdir);

s3PitRecovery()
    .catch(e => console.error(e.message));

const Bucket = 'notes.vividbytes.io';

async function getObjectsToRecover(timestamp) {
    let isMore = true;
    let nextKey; 
    const objects = {};
    const deleteMarkers = {};

    while(isMore) {
	let data = await S3.listObjectVersions({
	    Bucket: Bucket,
	    Prefix: '',
	    KeyMarker: nextKey,
	    MaxKeys: 6
	}).promise();

	data.DeleteMarkers.forEach(obj => {
	    const currObj = deleteMarkers[obj.Key];
	    const lastModified = new Date(obj.LastModified);

	    if (!currObj && obj.LastModified <= timestamp) {
		deleteMarkers[obj.Key] = obj;
	    } else if (currObj &&
		       lastModified <= timestamp &&
		       lastModified > new Date(currObj.LastModified)
		      ) {
		deleteMarkers[obj.Key] = obj;
	    }
	});

	data.Versions.forEach(obj => {
	    const currObj = objects[obj.Key];
	    const lastModified = new Date(obj.LastModified);

	    if (!currObj && obj.LastModified <= timestamp) {
		objects[obj.Key] = obj;
	    } else if (currObj &&
		       lastModified <= timestamp &&
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

async function requestObjectRecovery(obj) {
    console.log('recovering object', obj.Key);
    console.log('lastModified', obj.LastModified);
}

async function retrieveObject(obj, dir) {
    console.log('retrievingObjectFromS3', obj.Key);
    console.log('lastModified', obj.LastModified);

    return new Promise((resolve, reject) => {
	const pipe = S3.getObject({
	    Bucket: Bucket,
	    Key: obj.Key
	})
	.createReadStream()
	.pipe(fs.createWriteStream(path.resolve(dir, obj.Key)))
	.on('finish', resolve)
	.on('error', reject);
    });
}

async function s3PitRecovery(dir = 'test') {
    await mkdirAsync(dir);
    const objects =  await getObjectsToRecover(new Date('2018-04-30'));

    return Promise.map(Object.keys(objects).map(key => objects[key]), obj => {
    	if (obj.StorageClass === 'GLACIER') {
	    return requestObjectRecovery(obj);
    	} else {
    	    return retrieveObject(obj, dir);
    	}
    }, { concurrency: 10 });
}
