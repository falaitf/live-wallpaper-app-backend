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
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
      }
    },
    {
      tableName: "categories",
      timestamps: true
    }
  );

  Category.beforeCreate(async (category, options) => {
    const maxOrder = await Category.max("sortOrder");
    category.sortOrder = (maxOrder || 0) + 1;
  });

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
