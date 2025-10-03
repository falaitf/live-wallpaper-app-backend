// SectionItem.js
module.exports = (sequelize, DataTypes) => {
  const SectionItem = sequelize.define("SectionItem", {
    title: { type: DataTypes.STRING },
    subtitle: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    buttonText: { type: DataTypes.STRING },
    buttonLink: { type: DataTypes.STRING },
    icon: { type: DataTypes.STRING }, // for "why choose" icons
    question: { type: DataTypes.STRING }, // for FAQ
    answer: { type: DataTypes.TEXT } // for FAQ
  });

  return SectionItem;
};
