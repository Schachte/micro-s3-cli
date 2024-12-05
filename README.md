# Micro R2 CLI Tool


## Install

- `yarn && yarn build` will output an executable in `dist/`

## Setup Environment

Environment variables are sources from `~/.r2-cli.cfg`.

```
cat ~/.r2-cli.cfg

ENDPOINT_URL=https://<S3-ENDPOINT>
AWS_ACCESS_KEY_ID=<REDACTED>
AWS_SECRET_ACCESS_KEY=<REDACTED>
```

Optionally, you can add this to your `PATH`:

```
export PATH="$PATH:~/path/to/r2-cli/dist"
```

## Usage

HTTP headers can be dynamically appended to requests by prefixing the environment variable with `S3_CLI_HTTP`.

### Create Bucket
```
r2-cli create-bucket -b test6
```

### Put Object w/ custom HTTP headers
```
DEBUG=true \
S3_CLI_HTTP_foo="bar" \
r2-cli put-object -b test6 -k my-object.txt -f ~/Desktop/test.txt

[DEBUG] Adding header: foo = bar
```

_Output_
```
Object uploaded successfully
ETag: "b1946ac92492d2347c6235b4d2611184"
```

## Supported Operations

* create-multipart-upload
* upload-part 
* complete-multipart-upload
* put-object
* delete-object
* create-bucket
* list-objects
* count-objects