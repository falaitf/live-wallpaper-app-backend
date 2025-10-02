const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Upload file to S3
const uploadToS3 = async (file, folder = "") => {
  if (!file) throw new Error("File is required");

  const key = `${folder}${uuidv4()}${path.extname(file.originalname)}`;

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    },
  });

  const result = await upload.done();
  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

// Delete file from S3
const deleteFromS3 = async (keyOrUrl) => {
  if (!keyOrUrl) return;

  // Convert URL → key if needed
  let key = keyOrUrl;
  if (keyOrUrl.includes(".amazonaws.com/")) {
    key = keyOrUrl.split(".amazonaws.com/")[1];
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });

    await s3.send(command);

    console.log(`🗑️ Deleted from S3: ${key}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to delete from S3: ${key}`, err);
    return false;
  }
};

module.exports = { uploadToS3, deleteFromS3 };
