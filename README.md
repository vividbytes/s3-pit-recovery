# S3-pit-recovery

This package implements point in time recovery of versioned S3 objects. The program takes a source bucket, optional prefix, and a time value. It finds objects from the source bucket at the given time and copies them to a new non-versioned bucket.

If some of the objects are stored in Glacier the program gives you the option to restore those files.

**Important**

S3 doesn't offer batch operations for copying objects. Each object is copied individually using using the copy-object API.

Furthemore, to determine whether a Glacier object has been restored the program has to call head-object on each object whose storage class is Glacier. This can potentially result to lots of additional API calls.

In summary, the API calls made by this package are
  - list-object-versions for all objects in batches of 1000
  - copy-object for all objects
  - head-object for all objects whose storage class is Glacier
  
If you want to recover a large number of object, please see [S3 pricing](https://aws.amazon.com/s3/pricing/) before using this package to avoid nasty surprises in your aws bill.

```
  Usage: s3-pit-recovery [options]

  Options:

    -V, --version                          output the version number
    -b, --bucket <value>                   (Required) S3 bucket to restore
    -d, --destinationBucket <value>        (Required) Name for the bucket the restored files will be copied to
    -r, --destinationBucketRegion <value>  Destination bucket region. Default: us-east-1
    -p, --prefix <value>                   Filter by S3 object prefix
    -t, --time <value>                     Time to restore to. Default: current time. Must be a valid JSON timestamp.
    -T, --glacierTier <value>              Glacier tier. Must be one of "Standard", "Expedited", "Bulk"
    -D, --glacierDays <value>              Lifetime of the active copy in days. Must be a positive integer. Default: 7
    -h, --help                             output usage information
```
