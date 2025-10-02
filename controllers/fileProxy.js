const AWS = require("aws-sdk");
const { Wallpaper, BlogItem } = require("../utils/db").loadModels();

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

exports.getFile = async (req, res) => {
  try {
    const { id, type } = req.params;

    const wallpaper = await Wallpaper.findByPk(id);
    if (!wallpaper) return res.status(404).json({ error: "Not found" });

    let key;
    switch (type) {
      case "video":
        key = wallpaper.url;
        break;
      case "thumbnail":
        key = wallpaper.thumbnail;
        break;
      case "gif":
        key = wallpaper.gif;
        break;
      default:
        return res.status(400).json({ error: "Invalid type" });
    }

    if (!key) return res.status(404).json({ error: "File not found" });

    const params = { Bucket: process.env.AWS_BUCKET_NAME, Key: key };
    const s3Stream = s3.getObject(params).createReadStream();

    // Guess content type
    const contentType =
      type === "video"
        ? wallpaper.type
        : type === "thumbnail"
        ? "image/jpeg"
        : "image/gif";
    res.setHeader("Content-Type", contentType);

    s3Stream.pipe(res);
  } catch (err) {
    console.error("❌ Proxy error:", err);
    res.status(500).json({ error: "Failed to fetch file" });
  }
};

exports.getBlogFile = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await BlogItem.findByPk(id);
    if (!item || item.type !== "image") {
      return res.status(404).json({ error: "Image not found" });
    }

    const params = { Bucket: process.env.AWS_BUCKET_NAME, Key: item.value };
    const s3Stream = s3.getObject(params).createReadStream();

    res.setHeader("Content-Type", "image/jpeg"); // you can detect type dynamically if needed
    s3Stream.pipe(res);
  } catch (err) {
    console.error("❌ Proxy error (blog image):", err);
    res.status(500).json({ error: "Failed to fetch image" });
  }
};

