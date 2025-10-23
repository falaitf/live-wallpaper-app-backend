module.exports = (sequelize, DataTypes) => {
  const BatteryAnimation = sequelize.define(
    "BatteryAnimation",
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
      }
    },
    {
      tableName: "battery_animations",
      timestamps: true
    }
  );

  BatteryAnimation.associate = (models) => {
    BatteryAnimation.belongsToMany(models.BatteryCategory, {
      through: "BatteryAnimationCategories",
      foreignKey: "animationId",
      otherKey: "categoryId",
      as: "categories"
    });
  };

  return BatteryAnimation;
};
