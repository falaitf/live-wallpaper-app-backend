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
  const User = require("../models/user")(sequelize, DataTypes);
  const App = require("../models/app")(sequelize, DataTypes);
  const Permission = require("../models/permission")(sequelize, DataTypes);
  const UserAppPermission = require("../models/userAppPermission")(sequelize, DataTypes);
  const Blog = require("../models/blog")(sequelize, DataTypes);
  const BlogItem = require("../models/blogItem")(sequelize, DataTypes);
  const Page = require("../models/page")(sequelize, DataTypes);
  const Media = require("../models/pageMedia")(sequelize, DataTypes);
  const Section = require("../models/pageSection")(sequelize, DataTypes);
  const SectionItem = require("../models/pageSectionItems")(sequelize, DataTypes);

  // =============================
  // Wallpaper ↔ Category (M:M)
  // =============================
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

  // =============================
  // User ↔ App (M:M via UserAppPermission)
  // =============================
  User.belongsToMany(App, {
    through: UserAppPermission,
    foreignKey: "userId",
    otherKey: "appId",
    as: "apps",
  });

  App.belongsToMany(User, {
    through: UserAppPermission,
    foreignKey: "appId",
    otherKey: "userId",
    as: "users",
  });

  // =============================
  // User ↔ Permission (M:M via UserAppPermission)
  // =============================
  User.belongsToMany(Permission, {
    through: UserAppPermission,
    foreignKey: "userId",
    otherKey: "permissionId",
    as: "permissions",
  });

  Permission.belongsToMany(User, {
    through: UserAppPermission,
    foreignKey: "permissionId",
    otherKey: "userId",
    as: "users",
  });

  // =============================
  // App ↔ Permission (M:M via UserAppPermission)
  // =============================
  App.belongsToMany(Permission, {
    through: UserAppPermission,
    foreignKey: "appId",
    otherKey: "permissionId",
    as: "permissions",
  });

  Permission.belongsToMany(App, {
    through: UserAppPermission,
    foreignKey: "permissionId",
    otherKey: "appId",
    as: "apps",
  });

  // =============================
  // 🔹 Direct belongsTo for eager loading
  // =============================
  UserAppPermission.belongsTo(User, { foreignKey: "userId" });
  UserAppPermission.belongsTo(App, { foreignKey: "appId" });
  UserAppPermission.belongsTo(Permission, { foreignKey: "permissionId" });

  User.hasMany(UserAppPermission, { foreignKey: "userId" });
  App.hasMany(UserAppPermission, { foreignKey: "appId" });
  Permission.hasMany(UserAppPermission, { foreignKey: "permissionId" });

  // =============================
  // Blogs ↔ App (1:M)
  // =============================
  Blog.belongsTo(App, { foreignKey: "appId" });
  App.hasMany(Blog, { foreignKey: "appId" });

  // =============================
  // Blogs ↔ BlogItems (1:M)
  // =============================
  Blog.hasMany(BlogItem, { foreignKey: "blogId" });
  BlogItem.belongsTo(Blog, { foreignKey: "blogId" });

  Page.hasMany(Section, { foreignKey: "pageId", as: "sections" });

  Media.belongsTo(Section, { foreignKey: "sectionId" });
  Media.belongsTo(SectionItem, { foreignKey: "itemId" });

  Section.belongsTo(Page, { foreignKey: "pageId" });
  Section.hasMany(SectionItem, { foreignKey: "sectionId", as: "items" });
  Section.hasMany(Media, { foreignKey: "sectionId", as: "media" });

  SectionItem.belongsTo(Section, { foreignKey: "sectionId" });
  SectionItem.hasMany(Media, { foreignKey: "itemId", as: "media" });

  Page.belongsTo(App, { foreignKey: "appId", as: "app" });

  App.hasMany(Page, { foreignKey: "appId", as: "pages" });


  return {
    sequelize,
    Sequelize,
    Category,
    Wallpaper,
    WallpaperCategory,
    User,
    App,
    Permission,
    UserAppPermission,
    Blog,
    BlogItem,
    Page,
    Section,
    SectionItem,
    Media
  };
};


module.exports = { connectDB, loadModels, sequelize, Sequelize };
