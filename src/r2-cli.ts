#!/usr/bin/env node

import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  PutObjectCommand,
  ListObjectsV2CommandInput,
  CreateBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { program } from "commander";
import * as fs from "fs";
import * as dotenv from "dotenv";
import * as path from "path";
import * as os from "os";
import * as log4js from "log4js";


const envPath = path.resolve(os.homedir(), ".r2-cli.cfg");
dotenv.config({ path: envPath });

const endpoint = process.env.ENDPOINT_URL;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const debug = process.env.DEBUG === 'true';
const replace_underscores_with_dashes = process.env.REPLACE_UNDERSCORES_WITH_DASHES === 'true' || true;

log4js.configure({
  appenders: { out: { type: "stdout" } },
  categories: { default: { appenders: ["out"], level: "debug" } },
});
const logger = log4js.getLogger();

if (!endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error(
    "Missing required environment variables: ENDPOINT_URL, AWS_ACCESS_KEY_ID, or AWS_SECRET_ACCESS_KEY"
  );
}

const s3Client = new S3Client({
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  // logger: logger,
  region: "auto",
  forcePathStyle: true,
});

if (debug) {
  console.log('ENDPOINT_URL', endpoint);
  console.log('AWS_ACCESS_KEY_ID', accessKeyId);
  console.log('AWS_SECRET_ACCESS_KEY', secretAccessKey);
  console.log('DEBUG', debug);
  console.log('REPLACE_UNDERSCORES_WITH_DASHES', replace_underscores_with_dashes);
}

const addCustomHeaderMiddleware = (next: any) => async (args: any) => {
  // Add any environment variables prefixed with S3_CLI_HTTP as headers
  Object.entries(process.env).forEach(([key, value]) => {
    if (key.startsWith('S3_CLI_HTTP')) {
      let headerKey = key.replace('S3_CLI_HTTP_', '').toLowerCase();
      if (replace_underscores_with_dashes) {
        headerKey = headerKey.replace(/_/g, '-');
      }
      if (debug) {
        console.debug(`[DEBUG] Adding header: ${headerKey} = ${value}`);
      }
      if (value !== undefined) {
        args.request.headers[headerKey] = value;
      }
    }
  });
  return next(args);
};

// Add the middleware to the client
s3Client.middlewareStack.add(addCustomHeaderMiddleware, {
  step: 'build', // Ensure this runs in the build step
});


program
  .command("create-multipart-upload")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .requiredOption("-k, --key <key>", "Object key")
  .option("-p, --profile <profile>", "AWS profile", process.env.PROFILE)
  .action(async (options) => {
    const { bucket, key } = options;
    const params = { Bucket: bucket, Key: key };
    const command = new CreateMultipartUploadCommand(params);
    const data = await s3Client.send(command);
    console.log("Multipart upload created:", data.UploadId);
  });

program
  .command("upload-part")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .requiredOption("-k, --key <key>", "Object key")
  .requiredOption("-n, --part-number <partNumber>", "Part number")
  .requiredOption("-f, --file <file>", "File to upload")
  .requiredOption("-u, --upload-id <uploadId>", "Multipart upload ID")
  .option("-p, --profile <profile>", "AWS profile", process.env.PROFILE)
  .action(async (options) => {
    const { bucket, key, partNumber, file, uploadId } = options;
    const params = {
      Bucket: bucket,
      Key: key,
      PartNumber: parseInt(partNumber, 10),
      UploadId: uploadId,
      Body: fs.createReadStream(file),
    };
    const command = new UploadPartCommand(params);
    const data = await s3Client.send(command);
    console.log("Part uploaded:", data.ETag);
  });

program
  .command("complete-multipart-upload")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .requiredOption("-k, --key <key>", "Object key")
  .requiredOption("-u, --upload-id <uploadId>", "Multipart upload ID")
  .requiredOption("-f, --file <file>", "File containing part information")
  .option("-p, --profile <profile>", "AWS profile", process.env.PROFILE)
  .action(async (options) => {
    const { bucket, key, uploadId, file } = options;
    const parts = JSON.parse(fs.readFileSync(file, "utf-8")).Parts;
    const params = {
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    };
    const command = new CompleteMultipartUploadCommand(params);
    await s3Client.send(command);
    console.log("Multipart upload completed");
  });

program
  .command("put-object")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .requiredOption("-k, --key <key>", "Object key")
  .requiredOption("-f, --file <file>", "File to upload")
  .option("-p, --profile <profile>", "AWS profile", process.env.PROFILE)
  .action(async (options) => {
    const { bucket, key, file } = options;
    try {
      if (!fs.existsSync(file)) {
        throw new Error(`File not found: ${file}`);
      }

      const fileStream = fs.createReadStream(file);
      const fileStats = fs.statSync(file);

      const params = {
        Bucket: bucket,
        Key: key,
        Body: fileStream,
        ContentLength: fileStats.size,
      };

      const command = new PutObjectCommand(params);
      const response = await s3Client.send(command);

      console.log("Object uploaded successfully");
      console.log("ETag:", response.ETag);
    } catch (error) {
      if (error instanceof Error) {
        console.error("Full error:", error.toString());
      } else {
        console.error("An unknown error occurred:", error);
      }
    }
  });

program
  .command("delete-object")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .requiredOption("-k, --key <key>", "Object key")
  .option("-p, --profile <profile>", "AWS profile", process.env.PROFILE)
  .action(async (options) => {
    const { bucket, key } = options;
    const params = { Bucket: bucket, Key: key };
    const command = new DeleteObjectCommand(params);
    await s3Client.send(command);
    console.log("Object deleted");
  });

program
  .command("create-bucket")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .option("-p, --profile <profile>", "AWS profile", process.env.PROFILE)
  .action(async (options) => {
    const { bucket } = options;
    const params = { Bucket: bucket };
    const command = new CreateBucketCommand(params);
    await s3Client.send(command);
    console.log(`Bucket "${bucket}" created`);
  });

program
  .command("list-objects")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .option("-f, --prefix <prefix>", "Object prefix for filtering")
  .option("-p, --profile <profile>", "AWS profile", process.env.PROFILE)
  .action(async (options) => {
    const { bucket, prefix } = options;
    let input: ListObjectsV2CommandInput = {
      Bucket: bucket,
      Prefix: prefix,
    };

    const command = new ListObjectsV2Command(input);
    const result = await s3Client.send(command);
    result.Contents?.forEach((obj) => console.log(obj));
  });

  program
  .command("count-objects")
  .requiredOption("-b, --bucket <bucket>", "S3 bucket name")
  .option("-f, --prefix <prefix>", "Object prefix for filtering")
  .action(async (options) => {
    const { bucket, prefix } = options;

    let totalObjects = 0;
    let continuationToken: string | undefined = undefined;

    do {
      const input: ListObjectsV2CommandInput = {
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      };

      const command = new ListObjectsV2Command(input);
      const response = await s3Client.send(command);

      totalObjects += response.Contents?.length || 0;
      continuationToken = response.NextContinuationToken;
      process.stdout.write(`\rCurrent count: ${totalObjects}`);
    } while (continuationToken);

    console.log("\nFinal count:");
    console.log(`Total objects in bucket: ${totalObjects}`);
  });


program.parse(process.argv);
