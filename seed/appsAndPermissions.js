const crypto = require("crypto");

// Hash function (sha256)
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const appsConfig = [
  {
    name: "Aspire",
    slug: "aspire",
    permissions: [
      { code: "blogs.read", name: "Read Blogs" },
      { code: "blogs.write", name: "Write Blogs" },
      { code: "blogs.update", name: "Update Blogs" },
      { code: "blogs.delete", name: "Delete Blogs" },
      { code: "pages.save", name: "Save Page" },
      { code: "pages.view", name: "View Page" },
      { code: "pages.delete", name: "Delete Page" },
    ],
  },
  {
    name: "Live Wallpaper",
    slug: "live-wallpaper",
    permissions: [
      { code: "wallpapers.create", name: "Create Wallpaper" },
      { code: "wallpapers.view", name: "View Wallpaper" },
      { code: "wallpapers.update", name: "Update Wallpaper" },
      { code: "wallpapers.delete", name: "Delete Wallpaper" },
      { code: "categories.create", name: "Create Category" },
      { code: "categories.view", name: "View Category" },
      { code: "categories.update", name: "Update Category" },
      { code: "categories.delete", name: "Delete Category" },
      { code: "blogs.read", name: "Read Blogs" },
      { code: "blogs.write", name: "Write Blogs" },
      { code: "blogs.update", name: "Update Blogs" },
      { code: "blogs.delete", name: "Delete Blogs" },
      { code: "pages.save", name: "Save Page" },
      { code: "pages.view", name: "View Page" },
      { code: "pages.delete", name: "Delete Page" },
    ],
  },
  {
    name: "Battery Animation",
    slug: "battery-animation",
    permissions: [
      { code: "animation.create", name: "Create Animation" },
      { code: "animation.view", name: "View Animation" },
      { code: "animation.update", name: "Update Animation" },
      { code: "animation.delete", name: "Delete Animation" },
      { code: "animationcategories.create", name: "Create Category" },
      { code: "animationcategories.view", name: "View Category" },
      { code: "animationcategories.update", name: "Update Category" },
      { code: "animationcategories.delete", name: "Delete Category" },
    ],
  },
  {
    name: "Interior Design",
    slug: "interior-design",
    permissions: [
      { code: "blogs.read", name: "Read Blogs" },
      { code: "blogs.write", name: "Write Blogs" },
      { code: "blogs.update", name: "Update Blogs" },
      { code: "blogs.delete", name: "Delete Blogs" },
      { code: "pages.save", name: "Save Page" },
      { code: "pages.view", name: "View Page" },
      { code: "pages.delete", name: "Delete Page" },
    ],
  },
  {
    name: "Ai Tattoo",
    slug: "ai-tattoo",
    permissions: [
      { code: "blogs.read", name: "Read Blogs" },
      { code: "blogs.write", name: "Write Blogs" },
      { code: "blogs.update", name: "Update Blogs" },
      { code: "blogs.delete", name: "Delete Blogs" },
      { code: "pages.save", name: "Save Page" },
      { code: "pages.view", name: "View Page" },
      { code: "pages.delete", name: "Delete Page" },
    ],
  },
];

async function seedAppsAndPermissions(db) {
  const { App, Permission, User, UserAppPermission, BatteryCategory } = db;

  // ✅ Ensure Apps & Permissions
  for (const appDef of appsConfig) {
    let app = await App.findOne({ where: { slug: appDef.slug } });
    if (!app) {
      app = await App.create({ name: appDef.name, slug: appDef.slug });
      console.log(`📌 Created App: ${appDef.name}`);
    }

    for (const perm of appDef.permissions) {
      const [permission, created] = await Permission.findOrCreate({
        where: { code: perm.code, appId: app.id },
        defaults: {
          name: perm.name,
          description: perm.description || null,
          appId: app.id,
        },
      });

      if (created) {
        console.log(`  ➕ Added Permission: ${perm.code} for ${appDef.name}`);
      }
    }
  }

  // ✅ Ensure SuperAdmin user
  let superAdmin = await User.findOne({ where: { email: "superadmin@terafort.org" } });
  if (!superAdmin) {
    const hash = hashPassword("SuperAdmin@123");
    superAdmin = await User.create({
      name: "Super Admin",
      email: "superadmin@terafort.org",
      passwordHash: hash,   // 🔹 use correct column
      userType: "superAdmin", // 🔹 use correct ENUM
    });
    console.log("👑 SuperAdmin user created (email: superadmin@terafort.org)");
  }

  // ✅ Assign SuperAdmin ALL apps & permissions (via UserAppPermission)
  const allApps = await App.findAll();
  const allPermissions = await Permission.findAll();

  for (const app of allApps) {
    const appPermissions = allPermissions.filter(p => p.appId === app.id);

    for (const perm of appPermissions) {
      const [record, created] = await UserAppPermission.findOrCreate({
        where: {
          userId: superAdmin.id,
          appId: app.id,
          permissionId: perm.id,
        },
        defaults: {
          granted: true,
        },
      });

      if (created) {
        console.log(`🔗 Linked SuperAdmin → ${app.slug} → ${perm.code}`);
      } else {
        // console.log(`✅ Already linked: ${app.slug} → ${perm.code}`);
      }
    }
  }

//   const updateExistingSortOrders = async (req, res) => {
//     try {
//       // Fetch all existing categories, ordered by createdAt (oldest first)
//       const categories = await BatteryCategory.findAll({
//         order: [["createdAt", "ASC"]],
//       });

//       // Assign incremental sortOrder values
//       let order = 1;
//       for (const category of categories) {
//         await BatteryCategory.update(
//           { sortOrder: order },
//           { where: { id: category.id } }
//         );
//         order++;
//       }

//       return res.status(200).json({
//         success: true,
//         message: "All existing categories sortOrder updated incrementally",
//       });
//     } catch (error) {
//       console.error("Error updating sortOrder:", error);
//       return res.status(500).json({
//         success: false,
//         message: "Failed to update sort orders",
//       });
//     }
//   };
// updateExistingSortOrders()

  console.log("✅ SuperAdmin linked to all apps & permissions");
}

module.exports = seedAppsAndPermissions;
