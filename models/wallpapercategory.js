module.exports = (sequelize, DataTypes) => {
  const WallpaperCategory = sequelize.define(
    "WallpaperCategory",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      wallpaperId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: "WallpaperCategories",
      timestamps: true
    }
  );

  return WallpaperCategory;
};
