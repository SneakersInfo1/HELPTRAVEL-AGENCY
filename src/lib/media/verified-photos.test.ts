import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOME_TILE_DESTINATION_IDS } from "@/lib/hotels/warm-config";
import { getDestinationMedia, getDestinationMediaBySlug } from "@/lib/mvp/commercial-assets";
import { commercialCities } from "@/lib/mvp/commercial-cities";
import { comparisonPairs } from "@/lib/mvp/comparisons";
import { getAllDestinationProfiles, getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

import { noPhotoMedia, VERIFIED_DESTINATION_PHOTOS, verifiedMediaFor } from "./verified-photos";

// Kilka zdjęć Pexels to PNG — rozszerzenie musi zgadzać się z plikiem (sprawdzone na CDN).
const PEXELS_PHOTO = /^https:\/\/images\.pexels\.com\/photos\/(\d+)\/pexels-photo-\1\.(jpeg|png)$/;

/**
 * Kierunki z najważniejszych stron: strona główna, karty hubów „wyjazdy”
 * (przewodnik albo przypisane zdjęcie), porównania i strony „Hotele w …”
 * (sekcja komercyjna katalogu).
 *
 * Poza zakresem: karty „Tanie loty” na stronie głównej (DEAL_ROUTES). Sekcja jest
 * ukryta, dopóki nie ma świeżych cen lotów; jej karty biorą zdjęcie z wyszukiwania
 * (opis z miastem i krajem) albo pokazują układ bez zdjęcia.
 */
function importantDestinations(): string[] {
  const hubs = TRAVEL_MOODS.flatMap((mood) => mood.picks.map((pick) => pick.slug ?? pick.photoSlug));
  const comparisons = comparisonPairs.flatMap((pair) => [pair.a, pair.b]);
  const commercial = commercialCities.map((city) => city.destinationId);
  const all = [...HOME_TILE_DESTINATION_IDS, ...hubs, ...comparisons, ...commercial].filter((slug): slug is string => Boolean(slug));
  return [...new Set(all)].sort();
}

describe("rejestr zweryfikowanych zdjęć", () => {
  it("każdy ważny kierunek istnieje w katalogu", () => {
    const unknown = importantDestinations().filter((slug) => !getDestinationProfileBySlug(slug));
    assert.deepEqual(unknown, [], `nieznane kierunki: ${unknown.join(", ")}`);
  });

  it("obejmuje każdy kierunek ze strony głównej, hubów, porównań i stron „Hotele w …”", () => {
    const missing = importantDestinations().filter((slug) => !VERIFIED_DESTINATION_PHOTOS[slug]);
    assert.deepEqual(missing, [], `brak zweryfikowanych zdjęć: ${missing.join(", ")}`);
  });

  it("same zdjęcia Pexels z opisem; jedno zdjęcie nie ilustruje dwóch miejsc", () => {
    const seen = new Map<string, string>();
    for (const [slug, photos] of Object.entries(VERIFIED_DESTINATION_PHOTOS)) {
      assert.ok(getDestinationProfileBySlug(slug), `${slug}: nie ma takiego kierunku`);
      assert.ok(photos.gallery.length <= 3, `${slug}: najwyżej 3 zdjęcia galerii`);
      for (const photo of [photos.hero, ...photos.gallery]) {
        assert.match(photo.url, PEXELS_PHOTO, `${slug}: ${photo.url}`);
        assert.ok(photo.alt.trim().length >= 8, `${slug}: za krótki opis „${photo.alt}”`);
        assert.ok(!seen.has(photo.url), `${slug}: to samo zdjęcie jest już przy ${seen.get(photo.url)}`);
        seen.set(photo.url, slug);
      }
    }
  });

  it("kierunki z opublikowanych porównań mają pełną galerię (3 zdjęcia)", () => {
    // Szablon porównania: [0] panel werdyktu, [1] i [2] blok zdjęć w treści.
    for (const slug of ["athens-greece", "rome-italy", "barcelona-spain", "valencia-spain", "malaga-spain", "funchal-portugal", "santa-cruz-de-tenerife-spain"]) {
      assert.equal(VERIFIED_DESTINATION_PHOTOS[slug]?.gallery.length, 3, slug);
    }
  });

  it("media z rejestru są oznaczone jako zweryfikowane i mają opis zdjęcia głównego", () => {
    const media = verifiedMediaFor("athens-greece");
    assert.ok(media);
    assert.equal(media.verified, true);
    assert.equal(media.heroAlt, "Akropol nad Atenami");
    assert.equal(verifiedMediaFor("nie-ma-takiego-kierunku"), null);
  });
});

describe("media bez sieci (commercial-assets) — bez zdjęć zastępczych", () => {
  it("każdy kierunek: zdjęcie zweryfikowane albo układ bez zdjęcia, nigdy obce zdjęcie zastępcze", () => {
    for (const destination of getAllDestinationProfiles()) {
      const media = getDestinationMedia(destination);
      const urls = [media.heroImage, media.poster, ...media.gallery].filter((url): url is string => Boolean(url));
      for (const url of urls) assert.match(url, PEXELS_PHOTO, `${destination.slug}: ${url}`);
      if (!media.heroImage) assert.deepEqual(media, noPhotoMedia(), destination.slug);
      else assert.equal(media.verified, true, destination.slug);
    }
  });

  it("Barcelona nie dostaje już wieży Eiffla ani żadnego zdjęcia Unsplash", () => {
    const media = getDestinationMediaBySlug("barcelona-spain");
    assert.doesNotMatch(JSON.stringify(media), /unsplash|1502602898657/);
  });
});
