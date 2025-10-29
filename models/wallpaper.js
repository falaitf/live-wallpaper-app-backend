module.exports = (sequelize, DataTypes) => {
  const Wallpaper = sequelize.define(
    "Wallpaper",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false
      },
      thumbnail: {
        type: DataTypes.STRING,
        allowNull: false
      },
      gif: {
        type: DataTypes.STRING,
        allowNull: true
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        defaultValue: "active"
      },
      isPremium: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
      }
    },
    {
      tableName: "wallpapers",
      timestamps: true
    }
  );

  Wallpaper.beforeCreate(async (wallpaper, options) => {
    const maxOrder = await Wallpaper.max("sortOrder");
    wallpaper.sortOrder = (maxOrder || 0) + 1;
  });

  Wallpaper.associate = (models) => {
    Wallpaper.belongsToMany(models.Category, {
      through: "WallpaperCategories",
      foreignKey: "wallpaperId",
      otherKey: "categoryId",
      as: "categories"
    });
  };

  return Wallpaper;
};
