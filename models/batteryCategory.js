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
      }
    },
    {
      tableName: "battery_categories",
      timestamps: true
    }
  );

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
