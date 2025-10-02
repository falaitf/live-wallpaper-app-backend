module.exports = (sequelize, DataTypes) => {
  const Blog = sequelize.define(
    "Blog",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      slug: { type: DataTypes.STRING, allowNull: false, unique: true },
      title: { type: DataTypes.STRING, allowNull: false },
      appId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "apps", key: "id" },
      },
    },
    { tableName: "blogs", timestamps: true }
  );

  return Blog;
};
