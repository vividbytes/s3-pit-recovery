const AWS = require('aws-sdk');
const Promise = require('bluebird');
const S3 = new AWS.S3();
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const mkdirAsync = promisify(fs.mkdir);

const defaultOptions = {
    time: new Date(),
    prefix: '',
    glacierTier: 'Standard',
    glacierDays: 7,
    concurrency: 50
};

async function getObjects(options) {
    validateConfig(options);
    const config = Object.assign({}, defaultOptions, options);
    config.time = new Date(config.time);

    let isMore = true;
    let nextKey;
    const objects = {};
    const deleteMarkers = {};

    while (isMore) {
        let data = await S3.listObjectVersions({
            Bucket: config.bucket,
            Prefix: config.prefix,
            KeyMarker: nextKey,
            MaxKeys: 1000
        }).promise();

        data.DeleteMarkers.forEach(obj => {
            const currObj = deleteMarkers[obj.Key];
            const lastModified = new Date(obj.LastModified);

            if (!currObj && obj.LastModified <= config.time) {
                deleteMarkers[obj.Key] = obj;
            } else if (
                currObj &&
                lastModified <= config.time &&
                lastModified > new Date(currObj.LastModified)
            ) {
                deleteMarkers[obj.Key] = obj;
            }
        });

        data.Versions.forEach(obj => {
            const currObj = objects[obj.Key];
            const lastModified = new Date(obj.LastModified);

            if (!currObj && obj.LastModified <= config.time) {
                objects[obj.Key] = obj;
            } else if (
                currObj &&
                lastModified <= config.time &&
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

    return Promise.map(
        Object.keys(objects),
        key => {
            const obj = objects[key];

            if (obj.StorageClass === 'GLACIER') {
                return S3.headObject({
                    Bucket: config.bucket,
                    Key: obj.Key,
                    VersionId: obj.VersionId
                })
                    .promise()
                    .then(data => {
                        if (data.Restore) {
                            return obj;
                        } else {
                            obj.glacier = true;
                            return obj;
                        }
                    });
            } else {
                return obj;
            }
        },
        { concurrency: config.concurrency }
    ).then(objects =>
        objects.reduce(
            (acc, obj) => {
                if (obj.glacier) {
                    acc.glacierObjects.push(obj);
                } else {
                    acc.s3Objects.push(obj);
                }
                return acc;
            },
            { s3Objects: [], glacierObjects: [] }
        )
    );
}

async function recoverGlacierObject(obj, options) {
    console.log('restoring object from Glacier', obj.Key);

    return S3.restoreObject({
        Bucket: options.bucket,
        Key: obj.Key,
        VersionId: obj.VersionId,
        RestoreRequest: {
            GlacierJobParameters: {
                Tier: options.glacierTier
            },
            Days: options.glacierDays
        }
    });
}

async function recoverS3Object(obj, options) {
    console.log('restoring object from S3', obj.Key);

    const copySource = `/${options.bucket}/${obj.Key}?versionId=${obj.VersionId}`;

    return S3.copyObject({
        Bucket: options.destinationBucket,
        Key: obj.Key,
        CopySource: copySource
    }).promise();
}

async function restoreObjects({ s3Objects, glacierObjects }, options = {}) {
    validateConfig(options);
    const config = Object.assign({}, defaultOptions, options);

    const concurrency = config.concurrency;

    console.log('creating bucket: ', config.destinationBucket);

    await S3.createBucket(
        Object.assign(
            {
                Bucket: config.destinationBucket
            },
            config.destinationBucketRegion
                ? {
                      CreateBucketConfiguration: {
                          LocationConstraint: config.destinationBucketRegion
                      }
                  }
                : {}
        )
    ).promise();

    if (options.recoverGlacier) {
        await Promise.map(glacierObjects, obj => recoverGlacierObject(obj, config), {
            concurrency
        });
    }

    if (options.recoverS3) {
        await Promise.map(s3Objects, obj => recoverS3Object(obj, config), {
            concurrency
        });
    }

    return;
}

class ValidationError extends Error {}

function validateConfig(config) {
    if (!config.destinationBucket) {
        throw new ValidationError('parameter --destinationBucket is required');
    }

    if (!config.bucket) {
        throw new ValidationError('parameter --bucket is required');
    }

    if (config.clacierTier && !['Standard', 'Expedited', 'Bulk'].includes(config.glacierTier)) {
        throw new ValidationError(
            'parameter --glacierTier must be one of Standard, Expedited, Bulk'
        );
    }

    if (
        config.glacierDays &&
        (!/^[0-9]+$/.test(config.glacierDays) || /^0+$/.test(config.glacierDays))
    ) {
        throw new ValidationError('parameter --glacierDays must be a positive integer');
    }

    if (config.time && new Date(config.time).toString() === 'Invalid Date') {
        throw new ValidationError('parameter --time must be a valid JSON string');
    }
}

module.exports = {
    getObjects,
    restoreObjects,
    ValidationError
};
