// utils/db.js
const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

// Create Sequelize instance using RDS credentials
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    port: process.env.DB_PORT || 5432,
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // use true if you upload Amazon RDS CA cert
      },
    },
  }
);

// const sequelize = new Sequelize(process.env.DB_URL, {
//   dialect: "postgres", 
//   logging: false,
// });

// Function to connect DB
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully.");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }
};

// Load models and setup associations
const loadModels = () => {
  const Category = require("../models/category")(sequelize, DataTypes);
  const Wallpaper = require("../models/wallpaper")(sequelize, DataTypes);
  const WallpaperCategory = require("../models/wallpapercategory")(sequelize, DataTypes);

  // Setup many-to-many associations
  Category.belongsToMany(Wallpaper, {
    through: WallpaperCategory,
    foreignKey: "categoryId",
    otherKey: "wallpaperId",
    as: "wallpapers",
  });

  Wallpaper.belongsToMany(Category, {
    through: WallpaperCategory,
    foreignKey: "wallpaperId",
    otherKey: "categoryId",
    as: "categories",
  });

  return {
    sequelize,
    Sequelize,
    Category,
    Wallpaper,
    WallpaperCategory,
  };
};

module.exports = { connectDB, loadModels, sequelize, Sequelize };
