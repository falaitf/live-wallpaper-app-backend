// Page.js
module.exports = (sequelize, DataTypes) => {
  const Page = sequelize.define("Page", {
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, unique: true, allowNull: false },
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    appId: {
      type: DataTypes.UUID,
      allowNull: false,   
    },
  });

  return Page;
};
