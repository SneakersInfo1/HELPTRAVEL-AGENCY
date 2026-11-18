import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatClimateNumber, getClimateNormal } from "@/lib/mvp/climate-normals";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { getMonthIndex, polishMonthSlugs, type PolishMonthSlug } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import { collectJsonLdNodes, validateJsonLd } from "./jsonld-validate";
import { buildMonthPageModel } from "./month-page-model";

const SITE = "https://helptravel.pl";
const TODAY = "2026-09-15";
const AUTHOR = { "@type": "Person", name: "Autor testowy", url: `${SITE}/redakcja` };
const OVERVIEW = "Przegląd testowy kierunku.";
const profiles = getAllDestinationProfiles();
const bySlug = new Map(profiles.map((profile) => [profile.slug, profile]));

function modelFor(profile: DestinationProfile, month: PolishMonthSlug) {
  return buildMonthPageModel({ profile, overview: OVERVIEW, month, baseUrl: SITE, author: AUTHOR });
}

function modelForSlug(slug: string, month: PolishMonthSlug) {
  const profile = bySlug.get(slug);
  assert.ok(profile, slug);
  return modelFor(profile, month);
}

describe("model strony kierunku w miesiącu", () => {
  it("dla wszystkich 2820 stron pokazuje pogodę wyłącznie z norm WMO", () => {
    let count = 0;
    let weatherCount = 0;
    let indexableCount = 0;

    for (const profile of profiles) {
      const normal = getClimateNormal(profile.slug);
      for (const month of polishMonthSlugs) {
        count += 1;
        const monthIndex = getMonthIndex(month);
        const model = modelFor(profile, month);
        const serialized = JSON.stringify(model);
        const jsonLd = JSON.stringify(model.structuredData);
        if (model.indexable) indexableCount += 1;

        if (normal) {
          weatherCount += 1;
          assert.ok(model.weather, `${profile.slug}/${month}`);
          assert.equal(model.weather.maxTempC, normal.maxTempC[monthIndex], `${profile.slug}/${month}`);
          assert.equal(model.weather.minTempC, normal.minTempC[monthIndex], `${profile.slug}/${month}`);
          assert.equal(model.weather.rainDays, normal.rainDays[monthIndex], `${profile.slug}/${month}`);
          assert.equal(model.weather.rainfallMm, normal.rainfallMm[monthIndex], `${profile.slug}/${month}`);
          assert.equal(model.weather.source.name, "WMO World Weather Information Service", `${profile.slug}/${month}`);
          assert.equal(model.weather.source.url, normal.sourceUrl, `${profile.slug}/${month}`);
          assert.match(jsonLd, /worldweather\.wmo\.int/, `${profile.slug}/${month}`);
          assert.match(model.text.title, new RegExp(`${formatClimateNumber(normal.maxTempC[monthIndex]).replace(",", "\\,")}°C`));
        } else {
          assert.equal(model.weather, null, `${profile.slug}/${month}`);
          assert.equal(model.fit, null, `${profile.slug}/${month}`);
          assert.doesNotMatch(serialized, /°C|WMO World Weather Information Service|worldweather\.wmo\.int/, `${profile.slug}/${month}`);
        }

        assert.equal(model.indexable, isMonthIndexable(profile, monthIndex), `${profile.slug}/${month}`);
        assert.ok(model.text.title.length <= 60, `${profile.slug}/${month}: ${model.text.title}`);
        assert.doesNotMatch(serialized, /temperatur\w* morz|morze szacunk|seaTemp/i, `${profile.slug}/${month}`);
        assert.doesNotMatch(serialized, /\d(?:[\d\s.,]*\d)?\s*(?:zł|PLN)/i, `${profile.slug}/${month}`);
        assert.doesNotMatch(serialized, /taniej|drożej|tanio|budżet|opłacaln|cheaper|pricier/i, `${profile.slug}/${month}`);
        assert.doesNotMatch(jsonLd, /datePublished|dateModified|"Offer"|"price"/, `${profile.slug}/${month}`);
        assert.doesNotMatch(
          `${jsonLd} ${model.text.lead}`,
          /najtaniej|najdrożej|ceny najniższe|najwyższe ceny|turystów|najspokojniej|wysoki sezon|sezon przejściowy|poza sezonem|szczyt sezonu/i,
          `${profile.slug}/${month}`,
        );
        assert.deepEqual(validateJsonLd(model.structuredData, { todayIso: TODAY }), [], `${profile.slug}/${month}`);

        const faqNode = collectJsonLdNodes(model.structuredData).find((node) => node["@type"] === "FAQPage");
        if (model.faq.length === 0) {
          assert.equal(faqNode, undefined, `${profile.slug}/${month}`);
        } else {
          assert.ok(faqNode && Array.isArray(faqNode.mainEntity), `${profile.slug}/${month}`);
          assert.deepEqual(
            faqNode.mainEntity.map((item) => ({
              question: item.name,
              answer: (item.acceptedAnswer as Record<string, unknown>).text,
            })),
            model.faq,
            `${profile.slug}/${month}`,
          );
        }
      }
    }

    assert.equal(profiles.length, 235);
    assert.equal(count, 2820);
    assert.equal(weatherCount, 187 * 12);
    assert.equal(indexableCount, 1039);
  });

  it("Barcelona w styczniu odtwarza wartości dziesiętne z pliku norm", () => {
    const model = modelForSlug("barcelona-spain", "styczen");
    assert.ok(model.weather);
    assert.equal(model.weather.maxTempC, 13.6);
    assert.equal(model.weather.minTempC, 4.7);
    assert.equal(model.weather.rainDays, 5.4);
    assert.equal(model.weather.rainfallMm, 37.7);
    assert.equal(model.text.title, "Barcelona w styczniu: pogoda, w dzień 13,6°C");
    assert.match(model.text.lead, /13,6°C/);
    assert.match(model.text.lead, /4,7°C/);
    assert.match(model.text.lead, /w 5,4 dnia miesiąca, łącznie 37,7 mm/);
    assert.match(JSON.stringify(model.structuredData), /13,6°C/);
    assert.match(JSON.stringify(model.structuredData), /4,7°C/);
  });

  it("kierunek bez normy nie pokazuje żadnych liczb pogodowych", () => {
    const model = modelForSlug("olbia-italy", "lipiec");
    assert.equal(getClimateNormal("olbia-italy"), null);
    assert.equal(model.weather, null);
    assert.equal(model.fit, null);
    assert.doesNotMatch(JSON.stringify(model), /°C|dni z opadem|mm opadu|WMO|worldweather/i);
  });

  it("polskie nazwy kierunków pozostają w tytule i JSON-LD", () => {
    const rome = modelForSlug("rome-italy", "lipiec");
    assert.match(rome.text.title, /^Rzym w lipcu/);
    assert.doesNotMatch(rome.text.title, /Rome/);
    assert.doesNotMatch(JSON.stringify(rome.structuredData), /Rome/);

    const heraklion = modelForSlug("heraklion-greece", "lipiec");
    assert.match(heraklion.text.title, /^Kreta w lipcu/);
  });
});

describe("dopasowanie terminu z normy WMO", () => {
  it("próg opadu dodaje ostrzeżenie dla mokrego miesiąca i wskazanie dla suchego", () => {
    const warsaw = modelForSlug("warsaw-poland", "styczen");
    assert.ok(warsaw.fit);
    assert.match(warsaw.fit.skipIf.join(" "), /16,0 dnia/);
    assert.match(warsaw.fit.basis, /WMO World Weather Information Service/);

    const abuDhabi = modelForSlug("abu-dhabi-united-arab-emirates", "styczen");
    assert.ok(abuDhabi.fit);
    assert.match(abuDhabi.fit.goodFor.join(" "), /0,8 dnia z opadem/);
  });

  it("Marrakesz latem nie dostaje twierdzeń o wodzie ani plaży z temperatury powietrza", () => {
    const july = modelForSlug("marrakesh-morocco", "lipiec");
    assert.ok(july.fit);
    assert.doesNotMatch(JSON.stringify(july.fit), /morze|kąpiel|plaż/i);
  });

  it("FAQ z czasem lotu używa przecinka dziesiętnego", () => {
    for (const profile of profiles) {
      const model = modelFor(profile, "styczen");
      for (const item of model.faq) assert.doesNotMatch(item.answer, /\d\.\d h/, profile.slug);
    }
  });
});
