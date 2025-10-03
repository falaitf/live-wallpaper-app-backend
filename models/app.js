// App.js
module.exports = (sequelize, DataTypes) => {
  const App = sequelize.define(
    "App",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    },
    { tableName: "apps", timestamps: true }
  );
  return App;
};
