/* Местоположение клиента: страна → магазины страны, магазины одежды рядом.
 * Координаты берутся только с разрешения человека и хранятся на этом устройстве.
 * Страна и город — BigDataCloud (без ключа), магазины рядом — OpenStreetMap (Overpass).
 * Подключается после app.js и shop.js. */
(function () {
'use strict';
const KEY = 'pr-geo', T = t => (window.I18N ? I18N.tr(t) : t);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
const save = g => { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) {} };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const listeners = [];
let geo = load();

/* ---------- где человек ---------- */
const position = () => new Promise((ok, no) => {
  if (!navigator.geolocation) return no(new Error(T('Это устройство не сообщает местоположение')));
  navigator.geolocation.getCurrentPosition(p => ok(p.coords), e => no(new Error(e.code === 1 ? T('Доступ к местоположению запрещён') : T('Не удалось определить местоположение'))),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 30*60*1000 });
});
async function locate() {
  const c = await position(), lang = window.I18N ? I18N.lang : 'ru';
  let country = '', countryName = '', city = '';
  try {
    const j = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${c.latitude}&longitude=${c.longitude}&localityLanguage=${lang}`).then(r => r.json());
    country = (j.countryCode || '').toUpperCase(); countryName = j.countryName || ''; city = j.city || j.locality || '';
  } catch (e) {}
  geo = { lat: +c.latitude.toFixed(3), lon: +c.longitude.toFixed(3), country, countryName, city, at: Date.now() }; // до ~100 м — точнее не нужно
  save(geo); listeners.forEach(f => f(geo));
  return geo;
}

/* ---------- магазины одежды в стране (сайты; поиск по ним — в списке ниже) ---------- */
const S = (name, url) => ({ name, url });
const COUNTRY_SHOPS = { // магазины одежды по странам (ноябрь 2026), по группам
  BE: { market: [S("Zalando", "https://www.zalando.be/"), S("bol.com", "https://www.bol.com/be/nl/"), S("Amazon", "https://www.amazon.com.be/"), S("About You", "https://www.aboutyou.be/"), S("ASOS", "https://www.asos.com/"), S("Vinted", "https://www.vinted.be/"), S("Inno", "https://www.inno.be/")],
      mass: [S("H&M", "https://www2.hm.com/nl_be/index.html"), S("Zara", "https://www.zara.com/be/"), S("C&A", "https://www.c-and-a.com/be/"), S("JBC", "https://www.jbc.be/"), S("Primark", "https://www.primark.com/nl-be"), S("Mango", "https://shop.mango.com/be"), S("Bershka", "https://www.bershka.com/be/"), S("Pull&Bear", "https://www.pullandbear.com/be/"), S("Stradivarius", "https://www.stradivarius.com/be/"), S("Uniqlo", "https://www.uniqlo.com/eu-nl/"), S("ZEB", "https://www.zeb.be/"), S("Bel&Bo", "https://www.belandbo.com/"), S("WE Fashion", "https://www.wefashion.be/"), S("Kiabi", "https://www.kiabi.be/"), S("Zeeman", "https://www.zeeman.com/be-nl/"), S("Only", "https://www.only.com/"), S("Jack & Jones", "https://www.jackjones.com/")],
      brand: [S("Massimo Dutti", "https://www.massimodutti.com/be/"), S("Lola Liza", "https://www.lolaliza.com/"), S("Terre Bleue", "https://www.terrebleue.be/"), S("Xandres", "https://www.xandres.com/"), S("Caroline Biss", "https://www.carolinebiss.com/"), S("Mayerline", "https://www.mayerline.com/"), S("Levi's", "https://www.levi.com/BE/"), S("Tommy Hilfiger", "https://nl.tommy.com/"), S("Lacoste", "https://www.lacoste.com/be/"), S("Superdry", "https://www.superdry.com/")],
      sport: [S("Decathlon", "https://www.decathlon.be/"), S("A.S.Adventure", "https://www.asadventure.com/"), S("JD Sports", "https://www.jdsports.be/"), S("Snipes", "https://www.snipes.com/"), S("Nike", "https://www.nike.com/be/"), S("adidas", "https://www.adidas.be/")],
      shoes: [S("Torfs", "https://www.torfs.be/"), S("Van Haren", "https://www.vanharen.be/")],
      under: [S("Hunkemöller", "https://www.hunkemoller.be/"), S("Intimissimi", "https://www.intimissimi.com/")],
      kids: [S("Okaïdi", "https://www.okaidi.be/"), S("Petit Bateau", "https://www.petit-bateau.be/"), S("Name It", "https://www.nameit.com/"), S("Orchestra", "https://www.shop-orchestra.com/")] },
  NL: { market: [S("Zalando", "https://www.zalando.nl/"), S("bol.com", "https://www.bol.com/nl/nl/"), S("Wehkamp", "https://www.wehkamp.nl/"), S("About You", "https://www.aboutyou.nl/"), S("Amazon", "https://www.amazon.nl/"), S("ASOS", "https://www.asos.com/"), S("Vinted", "https://www.vinted.nl/"), S("de Bijenkorf", "https://www.debijenkorf.nl/")],
      mass: [S("H&M", "https://www2.hm.com/nl_nl/index.html"), S("Zara", "https://www.zara.com/nl/"), S("C&A", "https://www.c-and-a.com/nl/"), S("Primark", "https://www.primark.com/nl-nl"), S("Mango", "https://shop.mango.com/nl"), S("Bershka", "https://www.bershka.com/nl/"), S("Pull&Bear", "https://www.pullandbear.com/nl/"), S("Uniqlo", "https://www.uniqlo.com/eu-nl/"), S("WE Fashion", "https://www.wefashion.nl/"), S("America Today", "https://www.americatoday.com/"), S("Score", "https://www.score.nl/"), S("Zeeman", "https://www.zeeman.com/nl/"), S("HEMA", "https://www.hema.nl/")],
      brand: [S("Scotch & Soda", "https://www.scotch-soda.com/"), S("G-Star RAW", "https://www.g-star.com/"), S("Suitsupply", "https://suitsupply.com/"), S("Levi's", "https://www.levi.com/NL/"), S("Tommy Hilfiger", "https://nl.tommy.com/")],
      sport: [S("Decathlon", "https://www.decathlon.nl/"), S("Intersport", "https://www.intersport.nl/"), S("JD Sports", "https://www.jdsports.nl/"), S("Nike", "https://www.nike.com/nl/"), S("adidas", "https://www.adidas.nl/")],
      shoes: [S("Van Haren", "https://www.vanharen.nl/"), S("Omoda", "https://www.omoda.nl/"), S("Ziengs", "https://www.ziengs.nl/")],
      under: [S("Hunkemöller", "https://www.hunkemoller.nl/")],
      kids: [S("Name It", "https://www.nameit.com/"), S("Prénatal", "https://www.prenatal.nl/"), S("Vingino", "https://www.vingino.com/"), S("Noppies", "https://www.noppies.com/")] },
  DE: { market: [S("Zalando", "https://www.zalando.de/"), S("About You", "https://www.aboutyou.de/"), S("Otto", "https://www.otto.de/"), S("Amazon", "https://www.amazon.de/"), S("ASOS", "https://www.asos.com/de/"), S("Vinted", "https://www.vinted.de/"), S("Breuninger", "https://www.breuninger.com/de/"), S("Galeria", "https://www.galeria.de/")],
      mass: [S("H&M", "https://www2.hm.com/de_de/index.html"), S("Zara", "https://www.zara.com/de/"), S("C&A", "https://www.c-and-a.com/de/"), S("Primark", "https://www.primark.com/de-de"), S("Mango", "https://shop.mango.com/de"), S("Bershka", "https://www.bershka.com/de/"), S("Uniqlo", "https://www.uniqlo.com/de/"), S("New Yorker", "https://www.newyorker.de/"), S("Takko", "https://www.takko.com/de-de/"), S("KiK", "https://www.kik.de/"), S("Tom Tailor", "https://www.tom-tailor.de/"), S("s.Oliver", "https://www.soliver.de/")],
      brand: [S("Peek & Cloppenburg", "https://www.peek-cloppenburg.de/"), S("Hugo Boss", "https://www.hugoboss.com/de/"), S("Levi's", "https://www.levi.com/DE/"), S("Marc O'Polo", "https://www.marc-o-polo.com/")],
      sport: [S("Decathlon", "https://www.decathlon.de/"), S("Intersport", "https://www.intersport.de/"), S("SportScheck", "https://www.sportscheck.com/"), S("Nike", "https://www.nike.com/de/"), S("adidas", "https://www.adidas.de/"), S("Puma", "https://eu.puma.com/de/")],
      shoes: [S("Deichmann", "https://www.deichmann.com/de-de/")],
      under: [S("Hunkemöller", "https://www.hunkemoeller.de/"), S("Triumph", "https://de.triumph.com/")],
      kids: [S("Name It", "https://www.nameit.com/"), S("Ernsting's family", "https://www.ernstings-family.de/"), S("JAKO-O", "https://www.jako-o.com/"), S("myToys", "https://www.mytoys.de/")] },
  FR: { market: [S("Zalando", "https://www.zalando.fr/"), S("Amazon", "https://www.amazon.fr/"), S("Galeries Lafayette", "https://www.galerieslafayette.com/"), S("La Redoute", "https://www.laredoute.fr/"), S("ASOS", "https://www.asos.com/fr/"), S("Vinted", "https://www.vinted.fr/"), S("Printemps", "https://www.printemps.com/")],
      mass: [S("H&M", "https://www2.hm.com/fr_fr/index.html"), S("Zara", "https://www.zara.com/fr/"), S("Kiabi", "https://www.kiabi.com/"), S("Primark", "https://www.primark.com/fr-fr"), S("Mango", "https://shop.mango.com/fr"), S("Bershka", "https://www.bershka.com/fr/"), S("Uniqlo", "https://www.uniqlo.com/fr/"), S("Jules", "https://www.jules.com/"), S("Promod", "https://www.promod.fr/"), S("Pimkie", "https://www.pimkie.fr/"), S("Celio", "https://www.celio.com/")],
      brand: [S("Sézane", "https://www.sezane.com/"), S("Maje", "https://fr.maje.com/"), S("Sandro", "https://fr.sandro-paris.com/"), S("Lacoste", "https://www.lacoste.com/fr/"), S("Petit Bateau", "https://www.petit-bateau.fr/")],
      sport: [S("Decathlon", "https://www.decathlon.fr/"), S("Intersport", "https://www.intersport.fr/"), S("Go Sport", "https://www.go-sport.com/"), S("Nike", "https://www.nike.com/fr/"), S("adidas", "https://www.adidas.fr/")],
      shoes: [S("André", "https://www.andre.fr/"), S("Eram", "https://www.eram.fr/"), S("Sarenza", "https://www.sarenza.com/")],
      under: [S("Etam", "https://www.etam.com/"), S("Darjeeling", "https://www.darjeeling.fr/")],
      kids: [S("Okaïdi", "https://www.okaidi.fr/"), S("Vertbaudet", "https://www.vertbaudet.fr/"), S("DPAM", "https://www.dpam.com/"), S("Jacadi", "https://www.jacadi.fr/"), S("Cyrillus", "https://www.cyrillus.fr/")] },
  PL: { market: [S("Zalando", "https://www.zalando.pl/"), S("Allegro", "https://allegro.pl/"), S("Modivo", "https://modivo.pl/"), S("Answear", "https://answear.com/pl/"), S("Amazon", "https://www.amazon.pl/"), S("Vinted", "https://www.vinted.pl/")],
      mass: [S("H&M", "https://www2.hm.com/pl_pl/index.html"), S("Zara", "https://www.zara.com/pl/"), S("Reserved", "https://www.reserved.com/pl/pl/"), S("Sinsay", "https://www.sinsay.com/pl/pl/"), S("House", "https://www.housebrand.com/pl/pl/"), S("Cropp", "https://www.cropp.com/pl/pl/"), S("Mohito", "https://www.mohito.com/pl/pl/"), S("Medicine", "https://www.medicine.pl/"), S("Diverse", "https://diverse.pl/"), S("Pepco", "https://pepco.pl/"), S("Primark", "https://www.primark.com/pl-pl"), S("Bershka", "https://www.bershka.com/pl/")],
      brand: [S("Vistula", "https://vistula.pl/"), S("Bytom", "https://bytom.com.pl/"), S("Wólczanka", "https://wolczanka.pl/"), S("Big Star", "https://bigstar.pl/")],
      sport: [S("Decathlon", "https://www.decathlon.pl/"), S("4F", "https://4f.com.pl/"), S("Martes Sport", "https://www.martes-sport.pl/"), S("Nike", "https://www.nike.com/pl/"), S("adidas", "https://www.adidas.pl/")],
      shoes: [S("CCC", "https://ccc.eu/pl"), S("Deichmann", "https://www.deichmann.com/pl-pl/"), S("eobuwie", "https://www.eobuwie.com.pl/")],
      under: [S("Atlantic", "https://www.atlantic.pl/"), S("Hunkemöller", "https://www.hunkemoller.pl/")],
      kids: [S("Smyk", "https://www.smyk.com/"), S("Coccodrillo", "https://coccodrillo.eu/"), S("5.10.15", "https://51015kids.eu/")] },
  UK: { market: [S("ASOS", "https://www.asos.com/"), S("Amazon", "https://www.amazon.co.uk/"), S("Zalando Lounge", "https://www.zalando-lounge.co.uk/"), S("John Lewis", "https://www.johnlewis.com/"), S("Selfridges", "https://www.selfridges.com/GB/en/"), S("Vinted", "https://www.vinted.co.uk/"), S("Very", "https://www.very.co.uk/")],
      mass: [S("H&M", "https://www2.hm.com/en_gb/index.html"), S("Zara", "https://www.zara.com/uk/"), S("Next", "https://www.next.co.uk/"), S("M&S", "https://www.marksandspencer.com/"), S("Primark", "https://www.primark.com/en-gb"), S("River Island", "https://www.riverisland.com/"), S("New Look", "https://www.newlook.com/uk"), S("Uniqlo", "https://www.uniqlo.com/uk/en/"), S("George at Asda", "https://direct.asda.com/george/clothing/"), S("TU at Sainsbury's", "https://www.tuclothing.sainsburys.co.uk/"), S("Matalan", "https://www.matalan.co.uk/")],
      brand: [S("Ted Baker", "https://www.tedbaker.com/uk"), S("Reiss", "https://www.reiss.com/"), S("Jigsaw", "https://www.jigsaw-online.com/"), S("Superdry", "https://www.superdry.com/")],
      sport: [S("JD Sports", "https://www.jdsports.co.uk/"), S("Sports Direct", "https://www.sportsdirect.com/"), S("Decathlon", "https://www.decathlon.co.uk/"), S("Nike", "https://www.nike.com/gb/"), S("adidas", "https://www.adidas.co.uk/")],
      shoes: [S("Clarks", "https://www.clarks.com/en-gb"), S("Office", "https://www.office.co.uk/"), S("Schuh", "https://www.schuh.co.uk/")],
      under: [S("Boux Avenue", "https://www.bouxavenue.com/"), S("Bravissimo", "https://www.bravissimo.com/")],
      kids: [S("Mothercare", "https://www.mothercare.com/"), S("JoJo Maman Bébé", "https://www.jojomamanbebe.co.uk/"), S("Boden", "https://www.boden.co.uk/"), S("Frugi", "https://www.welovefrugi.com/")] },
  RU: { market: [S("Wildberries", "https://www.wildberries.ru/"), S("Ozon", "https://www.ozon.ru/"), S("Lamoda", "https://www.lamoda.ru/"), S("Яндекс Маркет", "https://market.yandex.ru/"), S("Авито", "https://www.avito.ru/")],
      mass: [S("Gloria Jeans", "https://www.gloria-jeans.ru/"), S("O′STIN", "https://ostin.com/"), S("Befree", "https://befree.ru/"), S("Love Republic", "https://loverepublic.ru/"), S("Zarina", "https://zarina.ru/"), S("Lime", "https://lime-shop.com/"), S("Твое", "https://tvoe.ru/"), S("Sela", "https://www.sela.ru/")],
      brand: [S("Ushatava", "https://ushatava.ru/"), S("12 STOREEZ", "https://12storeez.com/"), S("Henderson", "https://henderson.ru/")],
      sport: [S("Спортмастер", "https://www.sportmaster.ru/")],
      shoes: [S("Ralf Ringer", "https://ralf.ru/"), S("ЭКОНИКА", "https://econika.ru/"), S("Zenden", "https://zenden.ru/")],
      under: [S("Incity", "https://www.incity.ru/")],
      kids: [S("Детский мир", "https://www.detmir.ru/"), S("Gulliver", "https://gulliver.ru/")] },
  ES: { market: [S("Zalando", "https://www.zalando.es/"), S("Amazon", "https://www.amazon.es/"), S("El Corte Inglés", "https://www.elcorteingles.es/"), S("ASOS", "https://www.asos.com/es/"), S("Vinted", "https://www.vinted.es/")],
      mass: [S("Zara", "https://www.zara.com/es/"), S("Mango", "https://shop.mango.com/es"), S("H&M", "https://www2.hm.com/es_es/index.html"), S("Primark", "https://www.primark.com/es-es"), S("Pull&Bear", "https://www.pullandbear.com/es/"), S("Bershka", "https://www.bershka.com/es/"), S("Stradivarius", "https://www.stradivarius.com/es/"), S("Lefties", "https://www.lefties.com/"), S("Springfield", "https://myspringfield.com/"), S("Cortefiel", "https://cortefiel.com/"), S("Desigual", "https://www.desigual.com/")],
      brand: [S("Massimo Dutti", "https://www.massimodutti.com/es/"), S("Oysho", "https://www.oysho.com/es/")],
      sport: [S("Decathlon", "https://www.decathlon.es/"), S("Sprinter", "https://www.sprinter.es/"), S("Nike", "https://www.nike.com/es/"), S("adidas", "https://www.adidas.es/")],
      shoes: [S("Camper", "https://www.camper.com/")],
      under: [S("Women'secret", "https://womensecret.com/")],
      kids: [S("Mayoral", "https://www.mayoral.com/"), S("Kiabi", "https://www.kiabi.es/")] },
  IT: { market: [S("Zalando", "https://www.zalando.it/"), S("Amazon", "https://www.amazon.it/"), S("YOOX", "https://www.yoox.com/"), S("Rinascente", "https://www.rinascente.it/"), S("Vinted", "https://www.vinted.it/")],
      mass: [S("OVS", "https://www.ovs.it/"), S("Benetton", "https://it.benetton.com/"), S("Terranova", "https://www.terranovastyle.com/"), S("Piazza Italia", "https://www.piazzaitalia.it/"), S("Zara", "https://www.zara.com/it/"), S("H&M", "https://www2.hm.com/it_it/index.html"), S("Primark", "https://www.primark.com/it-it"), S("Mango", "https://shop.mango.com/it"), S("Bershka", "https://www.bershka.com/it/")],
      brand: [S("Massimo Dutti", "https://www.massimodutti.com/it/"), S("Diesel", "https://www.diesel.com/"), S("Max Mara", "https://www.maxmara.com/")],
      sport: [S("Decathlon", "https://www.decathlon.it/"), S("Cisalfa", "https://www.cisalfasport.it/"), S("Nike", "https://www.nike.com/it/"), S("adidas", "https://www.adidas.it/")],
      shoes: [S("Pittarello", "https://www.pittarello.com/"), S("Geox", "https://www.geox.com/")],
      under: [S("Intimissimi", "https://www.intimissimi.com/"), S("Tezenis", "https://www.tezenis.com/"), S("Calzedonia", "https://www.calzedonia.com/")],
      kids: [S("Prénatal", "https://www.prenatal.com/"), S("Chicco", "https://www.chicco.it/")] },
  PT: { market: [S("El Corte Inglés", "https://www.elcorteingles.pt/"), S("Amazon", "https://www.amazon.es/"), S("Vinted", "https://www.vinted.pt/"), S("ASOS", "https://www.asos.com/")],
      mass: [S("Zara", "https://www.zara.com/pt/"), S("H&M", "https://www2.hm.com/pt_pt/index.html"), S("Primark", "https://www.primark.com/pt-pt"), S("Mango", "https://shop.mango.com/pt"), S("Pull&Bear", "https://www.pullandbear.com/pt/"), S("Bershka", "https://www.bershka.com/pt/"), S("Salsa", "https://www.salsajeans.com/")],
      sport: [S("Decathlon", "https://www.decathlon.pt/"), S("Sport Zone", "https://www.sportzone.pt/")],
      shoes: [S("Seaside", "https://www.seaside.pt/")],
      under: [S("Women'secret", "https://womensecret.com/")],
      kids: [S("Zippy", "https://www.zippy.pt/"), S("Mayoral", "https://www.mayoral.com/")] },
  AT: { market: [S("Zalando", "https://www.zalando.at/"), S("About You", "https://www.aboutyou.at/"), S("Amazon", "https://www.amazon.de/"), S("Vinted", "https://www.vinted.at/")],
      mass: [S("H&M", "https://www2.hm.com/de_at/index.html"), S("Zara", "https://www.zara.com/at/"), S("C&A", "https://www.c-and-a.com/at/"), S("Primark", "https://www.primark.com/de-at"), S("Peek & Cloppenburg", "https://www.peek-cloppenburg.at/")],
      sport: [S("Intersport", "https://www.intersport.at/"), S("Hervis", "https://www.hervis.at/"), S("Decathlon", "https://www.decathlon.at/")],
      shoes: [S("Humanic", "https://www.humanic.net/at/"), S("Deichmann", "https://www.deichmann.com/de-at/")],
      kids: [S("Name It", "https://www.nameit.com/")] },
  CH: { market: [S("Zalando", "https://www.zalando.ch/"), S("Galaxus", "https://www.galaxus.ch/"), S("Manor", "https://www.manor.ch/"), S("Globus", "https://www.globus.ch/")],
      mass: [S("H&M", "https://www2.hm.com/de_ch/index.html"), S("Zara", "https://www.zara.com/ch/"), S("C&A", "https://www.c-and-a.com/ch/"), S("Tally Weijl", "https://www.tally-weijl.com/")],
      sport: [S("Ochsner Sport", "https://www.ochsnersport.ch/"), S("Decathlon", "https://www.decathlon.ch/")],
      shoes: [S("Dosenbach", "https://www.dosenbach.ch/")],
      kids: [S("Name It", "https://www.nameit.com/")] },
  IE: { market: [S("ASOS", "https://www.asos.com/"), S("Zalando", "https://www.zalando.ie/"), S("Arnotts", "https://www.arnotts.ie/"), S("Brown Thomas", "https://www.brownthomas.com/"), S("Vinted", "https://www.vinted.ie/")],
      mass: [S("Penneys", "https://www.primark.com/en-ie"), S("H&M", "https://www2.hm.com/en_ie/index.html"), S("Zara", "https://www.zara.com/ie/"), S("Dunnes Stores", "https://www.dunnesstores.com/"), S("M&S", "https://www.marksandspencer.com/ie/")],
      sport: [S("Elverys", "https://www.elverys.ie/"), S("JD Sports", "https://www.jdsports.ie/")],
      kids: [S("Name It", "https://www.nameit.com/")] },
  SE: { market: [S("Zalando", "https://www.zalando.se/"), S("Boozt", "https://www.boozt.com/se/sv"), S("Ellos", "https://www.ellos.se/"), S("Åhléns", "https://www.ahlens.se/"), S("Amazon", "https://www.amazon.se/"), S("Vinted", "https://www.vinted.se/")],
      mass: [S("H&M", "https://www2.hm.com/sv_se/index.html"), S("Lindex", "https://www.lindex.com/se/"), S("KappAhl", "https://www.kappahl.com/sv-se/"), S("Gina Tricot", "https://www.ginatricot.com/se"), S("Cubus", "https://cubus.com/sv-se/"), S("Zara", "https://www.zara.com/se/")],
      brand: [S("COS", "https://www.cos.com/"), S("Acne Studios", "https://www.acnestudios.com/"), S("Filippa K", "https://www.filippa-k.com/")],
      sport: [S("Stadium", "https://www.stadium.se/"), S("XXL", "https://www.xxl.se/")],
      shoes: [S("Scorett", "https://www.scorett.se/")],
      kids: [S("Polarn O. Pyret", "https://www.polarnopyret.se/")] },
  DK: { market: [S("Zalando", "https://www.zalando.dk/"), S("Boozt", "https://www.boozt.com/dk/da"), S("Magasin", "https://www.magasin.dk/"), S("Vinted", "https://www.vinted.dk/")],
      mass: [S("H&M", "https://www2.hm.com/da_dk/index.html"), S("Zara", "https://www.zara.com/dk/"), S("Only", "https://www.only.com/"), S("Vero Moda", "https://www.veromoda.com/"), S("Jack & Jones", "https://www.jackjones.com/")],
      brand: [S("Ganni", "https://www.ganni.com/")],
      sport: [S("Sport 24", "https://www.sport24.dk/"), S("Intersport", "https://www.intersport.dk/")],
      shoes: [S("Skoringen", "https://www.skoringen.dk/"), S("ECCO", "https://www.ecco.com/")],
      kids: [S("Name It", "https://www.nameit.com/")] },
  CZ: { market: [S("Zalando", "https://www.zalando.cz/"), S("Answear", "https://answear.cz/"), S("About You", "https://www.aboutyou.cz/"), S("Vinted", "https://www.vinted.cz/")],
      mass: [S("H&M", "https://www2.hm.com/cs_cz/index.html"), S("Zara", "https://www.zara.com/cz/"), S("Reserved", "https://www.reserved.com/cz/cs/"), S("Sinsay", "https://www.sinsay.com/cz/cs/"), S("C&A", "https://www.c-and-a.com/cz/")],
      sport: [S("Sportisimo", "https://www.sportisimo.cz/"), S("Decathlon", "https://www.decathlon.cz/")],
      shoes: [S("Baťa", "https://www.bata.com/cz/"), S("CCC", "https://ccc.eu/cz")],
      kids: [S("Name It", "https://www.nameit.com/")] },
  LT: { market: [S("Zalando", "https://www.zalando.lt/"), S("Vinted", "https://www.vinted.lt/"), S("Pigu", "https://pigu.lt/")],
      mass: [S("Zara", "https://www.zara.com/lt/"), S("Reserved", "https://www.reserved.com/lt/lt/"), S("Sinsay", "https://www.sinsay.com/lt/lt/"), S("Mohito", "https://www.mohito.com/lt/lt/"), S("Lindex", "https://www.lindex.com/lt/")],
      sport: [S("Sportland", "https://www.sportland.lt/")],
      kids: [S("Name It", "https://www.nameit.com/")] },
  LV: { market: [S("Zalando", "https://www.zalando.lv/"), S("Vinted", "https://www.vinted.lv/")],
      mass: [S("Zara", "https://www.zara.com/lv/"), S("Reserved", "https://www.reserved.com/lv/lv/"), S("Sinsay", "https://www.sinsay.com/lv/lv/"), S("Lindex", "https://www.lindex.com/lv/")],
      sport: [S("Sportland", "https://www.sportland.lv/")],
      kids: [S("Name It", "https://www.nameit.com/")] },
  EE: { market: [S("Zalando", "https://www.zalando.ee/"), S("Vinted", "https://www.vinted.ee/")],
      mass: [S("Zara", "https://www.zara.com/ee/"), S("Reserved", "https://www.reserved.com/ee/et/"), S("Sinsay", "https://www.sinsay.com/ee/et/"), S("Lindex", "https://www.lindex.com/ee/")],
      sport: [S("Sportland", "https://www.sportland.ee/")],
      kids: [S("Name It", "https://www.nameit.com/")] }
};
const regionOf = cc => (cc === 'GB' ? 'UK' : cc);
const GROUPS = [['market', 'Маркетплейсы и универмаги'], ['mass', 'Одежда на каждый день'], ['brand', 'Бренды'], ['sport', 'Спорт'], ['shoes', 'Обувь'], ['under', 'Бельё'], ['kids', 'Детская одежда']];
const groupsOf = cc => COUNTRY_SHOPS[regionOf(cc)] || null;
const shopsOf = cc => { const g = groupsOf(cc); return g ? GROUPS.flatMap(([k]) => g[k] || []) : null; }; // все магазины страны одним списком

/* ---------- магазины одежды рядом: через сервер программы (Google Maps или OpenStreetMap), иначе прямо из браузера ---------- */
const CFG = window.PROEKCIYA_CONFIG || {};
const SERVER = (CFG.chatUrl || (/^https?:$/.test(location.protocol) ? 'api' : '')).replace(/\/$/, '');
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const dist = (a, b, c, d) => { const R = 6371, r = x => x*Math.PI/180, dl = r(c - a), dg = r(d - b);
  return 2*R*Math.asin(Math.sqrt(Math.sin(dl/2)**2 + Math.cos(r(a))*Math.cos(r(c))*Math.sin(dg/2)**2)); };
const NEAR_KEY = 'pr-near-v2';
async function fromServer(radius) {
  const r = await fetch(SERVER + '/places', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lat: geo.lat, lon: geo.lon, radius, lang: window.I18N ? I18N.lang : 'ru' }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function fromBrowser(radius) {
  const q = `[out:json][timeout:20];nwr(around:${radius},${geo.lat},${geo.lon})[shop~"^(clothes|shoes|boutique|fashion|department_store|sports|fashion_accessories|second_hand|baby_goods|mall)$"];out center tags 300;`;
  const one = u => Promise.race([fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 25000))]);
  const j = await Promise.any(OVERPASS.map(one));
  return { source: 'osm', places: j.elements.map(e => { const t = e.tags || {};
    return { name: t.name || t.brand || '', address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, kind: /child|baby|kid/.test(t.clothes || '') ? 'kids' : t.shop, map: '' }; }) };
}
async function nearby(radius = 3000) {
  if (!geo) return { places: [] };
  const c = (() => { try { return JSON.parse(localStorage.getItem(NEAR_KEY)); } catch (e) { return null; } })();
  if (c && c.lat === geo.lat && c.lon === geo.lon && c.radius === radius && Date.now() - c.at < 24*3600e3) return c; // раз в сутки — сведения о магазинах меняются редко
  let res = null;
  if (SERVER) { try { res = await fromServer(radius); } catch (e) {} }
  if (!res) res = await fromBrowser(radius);
  const seen = new Set();
  const places = (res.places || []).filter(p => p.name && isFinite(p.lat))
    .map(p => ({ ...p, km: dist(geo.lat, geo.lon, p.lat, p.lon) }))
    .filter(p => { const k = p.name.toLowerCase() + '|' + Math.round(p.lat*2000) + '|' + Math.round(p.lon*2000); return !seen.has(k) && seen.add(k); })
    .sort((a, b) => a.km - b.km);
  const out = { source: res.source, places, lat: geo.lat, lon: geo.lon, radius, at: Date.now() };
  try { localStorage.setItem(NEAR_KEY, JSON.stringify(out)); } catch (e) {}
  return out;
}
// вид магазина → группа
// детские магазины в картах часто записаны просто как «магазин одежды» — узнаём их и по названию
const KIDS_NAME = /\b(kid|kids|junior|baby|babies|bebe|bébé|enfant|kinder|kind|mini|petit|bambin|bambino|niño|nino|dziec|детск|малыш)\b|kids|baby|kinder|okaïdi|okaidi|name it|orchestra|jacadi|vertbaudet|pr[eé]natal|mayoral|zippy|smyk|mothercare|noppies|vingino|polarn|детский/i;
const KIND = (k, p = {}) => /shoe/.test(k) ? 'shoes' : /baby|child|kid|toy/.test(k) || (p.types || []).some(t => /toy_store|child/.test(t)) || KIDS_NAME.test(p.name || '') ? 'kids'
  : /department|mall/.test(k) ? 'mall' : /sport/.test(k) ? 'sport' : /second/.test(k) ? 'second' : 'clothes';
const NEAR_GROUPS = [['clothes', 'Одежда'], ['shoes', 'Обувь'], ['mall', 'Универмаги и торговые центры'], ['sport', 'Спорт'], ['kids', 'Детская одежда'], ['second', 'Секонд-хенд']];
const mapsDir = s => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
const mapsSearch = () => geo ? `https://www.google.com/maps/search/${encodeURIComponent(T('магазин одежды'))}/@${geo.lat},${geo.lon},15z` : 'https://www.google.com/maps';

/* ---------- блок во вкладке «Магазины» ---------- */
const panel = document.getElementById('p-shop');
const box = document.createElement('section');
box.className = 'geo-box'; box.setAttribute('aria-labelledby', 'geoH');
box.innerHTML = `
  <div class="geo-head"><h2 class="sec-title" id="geoH">Магазины по вашему местоположению</h2></div>
  <p class="geo-where" id="geoWhere" role="status"></p>
  <div class="geo-btns"><button type="button" class="primary" id="geoBtn">Определить местоположение</button><a class="geo-map" id="geoMap" target="_blank" rel="noopener noreferrer" hidden>Магазины одежды на карте</a></div>
  <div id="geoShops" hidden><h3 class="geo-sub">Магазины одежды в стране</h3><div class="geo-groups" id="geoShopList"></div></div>
  <div id="geoNear" hidden><div class="geo-nearhead"><h3 class="geo-sub" id="geoNearH">Рядом с вами</h3>
    <label class="geo-rad"><span class="sr">Радиус</span><select id="geoRad"><option value="1000">1 км</option><option value="3000" selected>3 км</option><option value="5000">5 км</option><option value="10000">10 км</option><option value="20000">20 км</option></select></label></div>
    <div class="geo-groups" id="geoNearList"></div><p class="note" id="geoNearMsg"></p></div>
  <p class="note">Местоположение нужно только для выбора страны, погоды и магазинов рядом. Хранится на этом устройстве.</p>`;
if (panel) panel.insertBefore(box, panel.firstChild);
const $g = id => document.getElementById(id);

function render() {
  const has = !!geo;
  $g('geoWhere').textContent = has ? `${T('Вы здесь')}: ${[geo.city, geo.countryName].filter(Boolean).join(', ') || `${geo.lat}, ${geo.lon}`}` : T('Разрешите доступ к местоположению — программа покажет магазины вашей страны и рядом с вами.');
  $g('geoBtn').textContent = T(has ? 'Обновить местоположение' : 'Определить местоположение');
  $g('geoMap').hidden = !has; if (has) $g('geoMap').href = mapsSearch();
  const groups = has && groupsOf(geo.country);
  $g('geoShops').hidden = !groups;
  if (groups) $g('geoShopList').innerHTML = GROUPS.filter(([k]) => (groups[k] || []).length).map(([k, title]) => `<div class="geo-grp"><span class="geo-gt">${esc(T(title))} · ${groups[k].length}</span>
    <div class="geo-chips">${groups[k].map(s => `<a class="shop-btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-noi18n>${esc(s.name)}</a>`).join('')}</div></div>`).join('');
  // страна → страна поиска в магазинах
  const sel = document.getElementById('shopRegion'), rg = has && regionOf(geo.country);
  if (sel && rg && [...sel.options].some(o => o.value === rg) && sel.value !== rg) { sel.value = rg; sel.dispatchEvent(new Event('change')); }
}
async function showNearby(force) {
  if (!geo) return;
  const radius = +$g('geoRad').value || 3000;
  if (force) try { localStorage.removeItem(NEAR_KEY); } catch (e) {}
  $g('geoNear').hidden = false; $g('geoNearList').innerHTML = ''; $g('geoNearMsg').textContent = T('Ищу магазины рядом…');
  try {
    const res = await nearby(radius), list = res.places;
    const sites = Object.fromEntries((shopsOf(geo.country) || []).map(x => [x.name.toLowerCase(), x.url])); // если у сетевого магазина есть сайт — даём и его
    const fmtKm = km => km < 1 ? Math.round(km*1000) + ' м' : km.toFixed(1).replace('.', ',') + ' км';
    $g('geoNearH').textContent = `${T('Рядом с вами')} · ${list.length}`;
    $g('geoNearList').innerHTML = NEAR_GROUPS.map(([k, title]) => { const g = list.filter(p => KIND(p.kind || '', p) === k); if (!g.length) return '';
      return `<div class="geo-grp"><span class="geo-gt">${esc(T(title))} · ${g.length}</span><ul class="geo-near">${g.map(p => {
        const site = Object.keys(sites).find(n => p.name.toLowerCase().includes(n));
        return `<li><a href="${esc(p.map || mapsDir(p))}" target="_blank" rel="noopener noreferrer"><b data-noi18n>${esc(p.name)}</b>
          <span><span data-noi18n>${fmtKm(p.km)}</span>${p.address ? ' · ' : ''}<span data-noi18n>${esc((p.address || '').split(',')[0])}</span></span></a>${site ? `<a class="geo-site" href="${esc(sites[site])}" target="_blank" rel="noopener noreferrer">${esc(T('сайт'))}</a>` : ''}</li>`; }).join('')}</ul></div>`; }).join('');
    $g('geoNearMsg').textContent = list.length ? `${T('Нажмите на магазин — откроется на карте.')} ${T('Данные')}: ${res.source === 'google' ? 'Google Maps' : 'OpenStreetMap'}.`
      : T('В этом радиусе магазинов не найдено. Увеличьте радиус или посмотрите на карте.');
  } catch (e) { $g('geoNearMsg').textContent = T('Сервер карт сейчас не отвечает. Откройте «Магазины одежды на карте».'); }
}
$g('geoRad').onchange = () => showNearby();
$g('geoBtn').onclick = async () => {
  const b = $g('geoBtn'); b.disabled = true; $g('geoWhere').textContent = T('Определяю местоположение…');
  try { await locate(); render(); notify(`${T('Вы здесь')}: ${[geo.city, geo.countryName].filter(Boolean).join(', ')}`, T('Местоположение')); showNearby(); }
  catch (e) { $g('geoWhere').textContent = e.message; }
  finally { b.disabled = false; }
};
render();
if (geo) showNearby();
if (window.I18N && I18N.onChange) I18N.onChange(render);

window.Geo = { get: () => geo, locate, onChange: f => listeners.push(f), shopsOf, groupsOf, regionOf };
})();
