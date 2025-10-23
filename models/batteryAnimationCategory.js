module.exports = (sequelize, DataTypes) => {
  const BatteryAnimationCategory = sequelize.define(
    "BatteryAnimationCategory",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      animationId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: "BatteryAnimationCategories",
      timestamps: true
    }
  );

  return BatteryAnimationCategory;
};
