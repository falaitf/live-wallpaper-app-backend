module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    "Category",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      }
    },
    {
      tableName: "categories",
      timestamps: true
    }
  );

  Category.associate = (models) => {
    Category.belongsToMany(models.Wallpaper, {
      through: "WallpaperCategories",
      foreignKey: "categoryId",
      otherKey: "wallpaperId",
      as: "wallpapers"
    });
  };

  return Category;
};
