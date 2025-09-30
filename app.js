var express = require('express');
var path = require('path');
const crypto = require("crypto");
var cookieParser = require('cookie-parser');
var logger = require('morgan');
require("dotenv").config();
const rateLimit = require("express-rate-limit");
const { connectDB, loadModels } = require("./utils/db");

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
var adminCategoryRouter = require('./routes/Admin/category');
var adminWallpaperRouter = require('./routes/Admin/wallpaper');

// Category
var categoryRouter = require('./routes/category');

// Wallpaper
var wallpaperRouter = require('./routes/wallpaper');

// FileProxy
var fileProxyRouter = require('./routes/fileProxy');


var app = express();
app.set("trust proxy", true);
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to database
connectDB();

// Load models
const db = loadModels();

// Optional: sync models
db.sequelize.sync({ alter: true }).then(() =>
  console.log("📦 Models synchronized")
);


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
app.use('/api/v1/admin/category', adminCategoryRouter);
app.use('/api/v1/admin/wallpaper', adminWallpaperRouter);

// Category
app.use('/api/v1/category', categoryRouter);

// Wallpaper
app.use('/api/v1/wallpaper', wallpaperRouter);

// fileproxy
app.use('/api/v1/files', fileProxyRouter);

module.exports = app;
