```
  Usage: s3-pit-recovery [options]

  Options:

    -V, --version                          output the version number
    -b, --bucket <value>                   (Required) S3 bucket to restore
    -d, --destinationBucket <value>        (Required) Destination bucket
    -r, --destinationBucketRegion <value>  Destination bucket region. Default: us-east-1
    -p, --prefix <value>                   Filter by S3 object prefix
    -t, --time <value>                     Time to restore to. Default: current time.
    -T, --glacierTier <value>              Glacier tier. Must be one of "Standard", "Expedited", "Bulk"
    -D, --glacierDays <value>              Lifetime of the active copy in days. Must be a positive integer. Default: 7
    -h, --help                             output usage information
```
