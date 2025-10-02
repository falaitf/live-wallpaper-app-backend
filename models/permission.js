module.exports = (sequelize, DataTypes) => {
  const Permission = sequelize.define(
    "Permission",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING, allowNull: false }, // e.g. "blogs.view"
      name: DataTypes.STRING,
      description: DataTypes.TEXT,
      appId: { type: DataTypes.UUID, allowNull: false }, // 🔹 Add FK to App
    },
    { tableName: "permissions", timestamps: true }
  );

  return Permission;
};
