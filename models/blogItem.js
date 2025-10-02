module.exports = (sequelize, DataTypes) => {
  const BlogItem = sequelize.define(
    "BlogItem",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      type: {
        type: DataTypes.ENUM("heading", "description", "image"),
        allowNull: false,
      },
      value: {
        type: DataTypes.TEXT, // for heading text / description text / image URL
        allowNull: false,
      },
      blogId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "blogs", key: "id" },
      },
    },
    { tableName: "blog_items", timestamps: true }
  );

  return BlogItem;
};
