module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: DataTypes.STRING,
      email: { type: DataTypes.STRING, unique: true },
      passwordHash: DataTypes.STRING,
      userType: {
        type: DataTypes.ENUM("superAdmin", "appAdmin", "appUser"),
        defaultValue: "appUser",
      },
      isActive: { // soft delete flag
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    { tableName: "users", timestamps: true }
  );

  return User;
};
