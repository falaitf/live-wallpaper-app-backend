var express = require('express');
var path = require('path');
const crypto = require("crypto");
var cookieParser = require('cookie-parser');
var logger = require('morgan');
require("dotenv").config();
const rateLimit = require("express-rate-limit");
const { connectDB, loadModels, sequelize } = require("./utils/db");
const seedAppsAndPermissions = require("./seed/appsAndPermissions");
const cors = require("cors");

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

const publicLimiterWithCaptcha = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 100,
  handler: (req, res, next, options) => {
    // Print/log client IP when limit is exceeded
    console.log("⚠️ Rate limit exceeded by IP:", req.ip);

    res.status(options.statusCode).json({
      error: "Too many requests",
      captcha_required: true, // tell client to solve CAPTCHA
      reset_in_seconds: Math.ceil(options.windowMs / 1000),
    });
  },
});


//Admin
var adminAuthRouter = require('./routes/Admin/Auth/auth');
var adminAppRouter = require('./routes/Admin/App/app');
var adminUserRouter = require('./routes/Admin/User/user');
var adminBlogRouter = require('./routes/Admin/Blogs/blog');
var adminPageRouter = require('./routes/Admin/Page/page');
var adminCategoryRouter = require('./routes/Admin/Live-Wallpaper/category');
var adminWallpaperRouter = require('./routes/Admin/Live-Wallpaper/wallpaper');

// Category
var categoryRouter = require('./routes/category');
// Wallpaper
var wallpaperRouter = require('./routes/wallpaper');
// Blogs
var blogRouter = require('./routes/blog');
// Pages
var pagesRouter = require('./routes/pages');
// FileProxy
var fileProxyRouter = require('./routes/fileProxy');
// VIdeo Downloader
var videoDownloaderRouter = require('./routes/videoDownloader');


var app = express();
app.set("trust proxy", true);
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
  : ["http://localhost:3000"]; // fallback default

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn(`❌ CORS blocked for origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"], // optional if you serve file downloads
    preflightContinue: false,
    optionsSuccessStatus: 204, // avoid legacy browser CORS issues
  })
);


app.options('*', cors());

// Then serve static files
app.use(express.static(path.join(__dirname, 'public')));

(async () => {
  try {
    // Connect DB
    await connectDB();

    // Load models
    const db = loadModels();

    // Sync models
    // await db.sequelize.sync({ alter: true });
    // console.log("📦 Models synchronized");

    // (async () => {
    //   try {
    //     await sequelize.query(`
    //   ALTER TABLE "user_app_permissions"
    //   DROP CONSTRAINT IF EXISTS "user_app_permissions_userId_key";
    // `);
    //     console.log('✅ Constraint removed successfully.');
    //     process.exit(0);
    //   } catch (error) {
    //     console.error('❌ Error removing constraint:', error);
    //     process.exit(1);
    //   }
    // })();

    // Run seeding AFTER sync
    // await seedAppsAndPermissions(db);

    // Start server
    app.listen(process.env.PORT, () => {
      console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
})();

function validateAPIKey(req, res, next) {
  const authkey = req.header("api-key");
  if (
    authkey &&
    crypto.createHash("sha256").update(authkey).digest("hex") ==
    process.env.API_KEY
  ) {
    next();
  } else {
    res.status(401).send(`
      <html>
        <head>
          <title>Unauthorized Access</title>
          <style>
            body {
              background-color: #f8f8f8;
              font-family: Arial, sans-serif;
              color: #333;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              padding: 20px;
              background-color: #fff;
              border: 1px solid #ddd;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              border-radius: 8px;
            }
            .container h1 {
              font-size: 24px;
              margin-bottom: 20px;
            }
            .container p {
              font-size: 16px;
              margin-bottom: 20px;
            }
            .container a {
              text-decoration: none;
              color: #007bff;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Unauthorized Access</h1>
            <p>You do not have permission to access this resource.</p>
            <p>Please contact the administrator if you believe this is an error.</p>
            <p><a href="/">Return to Home</a></p>
          </div>
        </body>
      </html>
    `);
  }
}
const openPaths = [];

app.use((req, res, next) => {
  if (req.path.startsWith("/images")) {
    return next();
  }

  // Allow if request path starts with any openPath
  const isOpen = openPaths.some((path) => req.path.startsWith(path));
  if (isOpen) {
    return next();
  }

  validateAPIKey(req, res, next);
});


app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use("/api/v1", (req, res, next) => {
  if (req.path.startsWith("/files")) {
    return next();
  }
  publicLimiterWithCaptcha(req, res, next);
});

//Admin
app.use('/api/v1/admin/auth', adminAuthRouter);
app.use('/api/v1/admin/app', adminAppRouter);
app.use('/api/v1/admin/user', adminUserRouter);
app.use('/api/v1/admin/blog', adminBlogRouter);
app.use('/api/v1/admin/page', adminPageRouter);
app.use('/api/v1/admin/live-wallpaper/category', adminCategoryRouter);
app.use('/api/v1/admin/live-wallpaper/wallpaper', adminWallpaperRouter);

// Category
app.use('/api/v1/category', categoryRouter);
// Wallpaper
app.use('/api/v1/wallpaper', wallpaperRouter);
// Blog 
app.use('/api/v1/blog', blogRouter);
// Pages
app.use('/api/v1/page', pagesRouter);
// fileproxy
app.use('/api/v1/files', fileProxyRouter);
// VIdeo Downloader
app.use('/api/v1/video', videoDownloaderRouter);

module.exports = app;

