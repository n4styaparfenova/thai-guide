// Настройки личной версии. Меняются здесь, код трогать не нужно.
window.APP_CONFIG = {
  // Ссылка на Mini App вида https://t.me/thai_guide_bot/<короткое_имя>. Заполним после /newapp в BotFather.
  appLink: "",

  authorName: "Настя",
  authorPhoto: "", // например "data/nastya.jpg"; пока пусто — рисуется буква
  intro: [
    "Привет, я Настя. Третий год живу в Таиланде.",
    "Хожу не только туда, куда возят туристов: работаю в кофейнях с видом, гуляю по паркам, как местные, хожу на арт-баттлы. Здесь и классика, которую стоит увидеть, и мои места.",
  ],
  signature: "— Настя, третий год в Таиланде",
  tipTitle: "Совет от автора",
  noteTitle: "Заметка автора",

  // Места — только отобранные Настей, по одному. Справочник со всеми собранными местами лежит в thai-guide/reference/
  placesUrl: "data/places.json",
  citiesUrl: "../data/cities.json",
  usefulUrl: "../data/useful.json",
  extraPlacesUrls: [],
  // Подписи городов
  personalUrls: ["data/personal.json"],
};
