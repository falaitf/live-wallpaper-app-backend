module.exports = (sequelize, DataTypes) => {
  const BatteryCategory = sequelize.define(
    "BatteryCategory",
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
      tableName: "battery_categories",
      timestamps: true
    }
  );

  BatteryCategory.beforeCreate(async (category, options) => {
    const maxOrder = await BatteryCategory.max("sortOrder");
    category.sortOrder = (maxOrder || 0) + 1;
  });

  BatteryCategory.associate = (models) => {
    BatteryCategory.belongsToMany(models.BatteryAnimation, {
      through: "BatteryAnimationCategories",
      foreignKey: "categoryId",
      otherKey: "animationId",
      as: "animations"
    });
  };

  return BatteryCategory;
};
