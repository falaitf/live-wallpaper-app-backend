// Section.js
module.exports = (sequelize, DataTypes) => {
  const Section = sequelize.define("Section", {
    type: { 
      type: DataTypes.ENUM(
        "hero",             // title, desc, button, media
        "gallery",          // multiple media
        "contentBlock",     // title, subtitle, desc, media
        "multiBlock",       // multiple nested components
        "whyChoose",        // icon, title, desc
        "faq",              // question/answer
        "highlight"         // colored title, desc, button, media
      ), 
      allowNull: false 
    },
    title: { type: DataTypes.STRING },
    subtitle: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    buttonText: { type: DataTypes.STRING },
    buttonLink: { type: DataTypes.STRING },
    coloredTitle: { type: DataTypes.STRING }
  });

  return Section;
};
