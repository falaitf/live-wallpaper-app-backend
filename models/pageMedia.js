// Media.js
module.exports = (sequelize, DataTypes) => {
  const Media = sequelize.define("Media", {
    type: { type: DataTypes.ENUM("image", "video"), allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    alt: { type: DataTypes.STRING }
  });

  return Media;
};
