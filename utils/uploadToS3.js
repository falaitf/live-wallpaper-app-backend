const { Upload } = require("@aws-sdk/lib-storage");
const s3 = require("./s3");

const uploadToS3 = async (file, folder) => {
  const Key = `${folder}/${Date.now()}_${file.originalname}`;

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key,
      Body: file.buffer,
      ContentType: file.mimetype,
    },
  });

  await upload.done();

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${Key}`;
};

module.exports = uploadToS3;
