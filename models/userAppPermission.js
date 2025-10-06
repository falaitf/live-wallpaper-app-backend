module.exports = (sequelize, DataTypes) => {
  const UserAppPermission = sequelize.define(
    "UserAppPermission",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      appId: { type: DataTypes.UUID, allowNull: false },
      permissionId: { type: DataTypes.UUID, allowNull: false },
      granted: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "user_app_permissions",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["userId", "appId", "permissionId"], 
        },
      ],
    }
  );

  return UserAppPermission;
};
