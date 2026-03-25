import type { CharacterCreationContent, ContentOption } from "./character-models.js";

const RACES: ContentOption[] = [
  {
    description:
      "Anpassungsfähig, ehrgeizig und gefährlich überzeugt davon, dass man alles irgendwie hinkriegt.",
    id: "human",
    label: "Mensch",
    tags: ["worldly", "earnest", "ambitious"],
  },
  {
    description:
      "Elegant, leicht überheblich und mit der Ausstrahlung von jemandem, der seit Jahrhunderten bessere Entscheidungen trifft als andere.",
    id: "elf",
    label: "Elf",
    tags: ["elegant", "smug", "mystical"],
  },
  {
    description:
      "Robust, praktisch und mit einer fast professionellen Geduld für Unsinn.",
    id: "dwarf",
    label: "Zwerg",
    tags: ["rugged", "stoic", "crafty"],
  },
  {
    description:
      "Imposant, würdevoll und immer nur einen heroischen Monolog vom nächsten großen Auftritt entfernt.",
    id: "dragonborn",
    label: "Drachenblütiger",
    tags: ["radiant", "disciplined", "heroic"],
  },
  {
    description:
      "Stylish, rebellisch und verdächtig gut darin, gleichzeitig charmant und problematisch zu wirken.",
    id: "tiefling",
    label: "Tiefling",
    tags: ["glamorous", "rebellious", "eerie"],
  },
  {
    description:
      "Herzlich, unterschätzt und meistens erstaunlich stabil, solange genug Snacks vorhanden sind.",
    id: "halfling",
    label: "Halbling",
    tags: ["charming", "earnest", "rustic"],
  },
  {
    description:
      "Zäh, direkt und mit dem Energielevel von jemandem, der sich nie freiwillig aus einer peinlichen Situation zurückzieht.",
    id: "half_orc",
    label: "Halb-Ork",
    tags: ["rugged", "scrappy", "ambitious"],
  },
  {
    description:
      "Neugierig, verschroben und jederzeit bereit, eine viel zu komplizierte Idee begeistert zu erklären.",
    id: "gnome",
    label: "Gnom",
    tags: ["curious", "crafty", "awkward"],
  },
  {
    description:
      "Strahlend, edel und mit der Aura einer himmlischen Erscheinung, die trotzdem auch nur improvisiert.",
    id: "aasimar",
    label: "Aasimar",
    tags: ["holy", "radiant", "noble"],
  },
  {
    description:
      "Chaotisch, straßenschlau und erschreckend zufrieden mit fragwürdigen Lösungen.",
    id: "goblin",
    label: "Goblin",
    tags: ["chaotic", "streetwise", "scrappy"],
  },
];

const CLASSES: ContentOption[] = [
  {
    description:
      "Direkt, belastbar und fest davon überzeugt, dass viele Probleme durch entschlossenes Auftreten lösbar sind.",
    id: "fighter",
    label: "Kämpfer",
    tags: ["disciplined", "heroic", "stoic"],
  },
  {
    description:
      "Listig, schnell und mit dem Selbstvertrauen von jemandem, der sich auch in schlechter Planung noch clever fühlt.",
    id: "rogue",
    label: "Schurke",
    tags: ["cunning", "streetwise", "smug"],
  },
  {
    description:
      "Wild, ungefiltert und oft erschreckend ehrlich in Momenten, in denen das niemand braucht.",
    id: "barbarian",
    label: "Barbar",
    tags: ["feral", "chaotic", "earnest"],
  },
  {
    description:
      "Belesen, mysteriös und gefährlich nah daran, jede Kleinigkeit als theoretisches Problem zu behandeln.",
    id: "wizard",
    label: "Magier",
    tags: ["arcane", "scholarly", "awkward"],
  },
  {
    description:
      "Pflichtbewusst, edel und jederzeit bereit, auch den unnötigsten Moment mit heiliger Ernsthaftigkeit zu versehen.",
    id: "paladin",
    label: "Paladin",
    tags: ["holy", "disciplined", "heroic"],
  },
  {
    description:
      "Ambitioniert, seltsam cool und eindeutig zu entspannt dafür, dass irgendwo dunkle Mächte mitreden.",
    id: "warlock",
    label: "Hexenpaktler",
    tags: ["eerie", "ambitious", "arcane"],
  },
  {
    description:
      "Aufrichtig, geerdet und mit dem Vibe von jemandem, der sogar Chaos mit ruhiger Stimme tadeln kann.",
    id: "cleric",
    label: "Kleriker",
    tags: ["holy", "earnest", "stoic"],
  },
  {
    description:
      "Wachsam, wetterfest und innerlich überzeugt, dass zivilisierte Orte meistens das eigentliche Problem sind.",
    id: "ranger",
    label: "Waldläufer",
    tags: ["rugged", "curious", "mystical"],
  },
  {
    description:
      "Laut, charmant und emotional immer nur einen halben Schritt von einer Performance entfernt.",
    id: "bard",
    label: "Barde",
    tags: ["theatrical", "charming", "glamorous"],
  },
  {
    description:
      "Naturverbunden, geheimnisvoll und mit einer fast beunruhigenden Ruhe gegenüber sehr seltsamen Dingen.",
    id: "druid",
    label: "Druide",
    tags: ["mystical", "feral", "stoic"],
  },
];

const JOBS: ContentOption[] = [
  {
    description:
      "Arbeitet lieber mit Werkzeug als mit langen Diskussionen und vertraut soliden Dingen mehr als großen Worten.",
    id: "smith",
    label: "Schmied",
    tags: ["crafty", "rugged", "disciplined"],
  },
  {
    description:
      "Kennt Rituale, Regeln und die besondere Kunst, auch alltägliche Aufgaben würdevoll erscheinen zu lassen.",
    id: "temple_aide",
    label: "Tempeldiener",
    tags: ["holy", "bureaucratic", "earnest"],
  },
  {
    description:
      "Hat schon viel Unsinn gesehen und trotzdem nie aufgehört, so zu tun, als ließe sich Ordnung herstellen.",
    id: "city_guard",
    label: "Stadtwache",
    tags: ["disciplined", "stoic", "streetwise"],
  },
  {
    description:
      "Kann mit Leuten umgehen, Preise verdrehen und selbst ein mittelmäßiges Angebot überzeugend präsentieren.",
    id: "merchant",
    label: "Händler",
    tags: ["worldly", "charming", "cunning"],
  },
  {
    description:
      "Reiseerfahren, wetterfest und mit genau der Sorte Energie, die Geschichten entweder verbessert oder ruiniert.",
    id: "sailor",
    label: "Seemann",
    tags: ["rugged", "worldly", "chaotic"],
  },
  {
    description:
      "Lebt für Wirkung, Publikum und den Moment, in dem selbst schlechte Ideen noch stilvoll aussehen.",
    id: "performer",
    label: "Schausteller",
    tags: ["theatrical", "glamorous", "charming"],
  },
  {
    description:
      "Präzise, formal und jederzeit bereit, die Realität in eine etwas zu ordentliche Form zu pressen.",
    id: "scribe",
    label: "Schreiber",
    tags: ["bureaucratic", "scholarly", "awkward"],
  },
  {
    description:
      "Beobachtet mehr als andere, sagt weniger als nötig und traut Spuren mehr als Gerüchten.",
    id: "hunter",
    label: "Jäger",
    tags: ["curious", "rugged", "stoic"],
  },
  {
    description:
      "Kennt Leute, Probleme und die erstaunliche Bandbreite davon, was man noch mit Würde servieren kann.",
    id: "tavern_worker",
    label: "Tavernenkraft",
    tags: ["charming", "scrappy", "grimy"],
  },
  {
    description:
      "Bleibt ruhig, wo andere nervös werden, und wirkt dabei ein wenig zu vertraut mit seltsamer Stille.",
    id: "gravekeeper",
    label: "Friedhofshilfe",
    tags: ["eerie", "stoic", "grimy"],
  },
];

const BACKGROUNDS: ContentOption[] = [
  {
    description:
      "Wurde durch irgendeine halbwahre Geschichte viel berühmter, als ursprünglich geplant war.",
    id: "folk_hero",
    label: "Volksheld",
    tags: ["heroic", "earnest", "rustic"],
  },
  {
    description:
      "Kommt eher mit Wildnis, Weite und eigenwilligen Methoden klar als mit höflicher Gesellschaft.",
    id: "outlander",
    label: "Außenseiter",
    tags: ["rugged", "worldly", "feral"],
  },
  {
    description:
      "Hat in geweihten Hallen gelernt, dass selbst Chaos mit genügend Haltung zumindest ordentlich aussehen kann.",
    id: "acolyte",
    label: "Akolyth",
    tags: ["holy", "earnest", "disciplined"],
  },
  {
    description:
      "Kennt Abkürzungen, Ausreden und mehrere Arten, sich in Schwierigkeiten elegant unauffällig zu geben.",
    id: "criminal_spy",
    label: "Gauner / Spion",
    tags: ["cunning", "streetwise", "grimy"],
  },
  {
    description:
      "Lebt davon, überzeugend zu wirken, auch wenn die Fakten gelegentlich noch nachgeliefert werden müssen.",
    id: "charlatan",
    label: "Scharlatan",
    tags: ["smug", "theatrical", "cunning"],
  },
  {
    description:
      "Wurde zwischen Etikette, Erwartungen und einer ungesunden Nähe zu aufwendigen Auftritten großgezogen.",
    id: "noble",
    label: "Adel",
    tags: ["noble", "elegant", "bureaucratic"],
  },
  {
    description:
      "Hat mehr gelesen als erlebt und behandelt trotzdem beides mit erstaunlicher Ernsthaftigkeit.",
    id: "sage",
    label: "Gelehrter",
    tags: ["scholarly", "curious", "stoic"],
  },
  {
    description:
      "Hat Häfen, Menschen und schlechte Entscheidungen in großer Vielfalt kennengelernt.",
    id: "sailor_background",
    label: "Seefahrer",
    tags: ["worldly", "rugged", "scrappy"],
  },
  {
    description:
      "War lange fern von Leuten und hat dabei entweder Weisheit oder sehr spezielle Eigenheiten entwickelt.",
    id: "hermit",
    label: "Einsiedler",
    tags: ["mystical", "awkward", "stoic"],
  },
  {
    description:
      "Hat gelernt, aus wenig viel zu machen und Autorität nur zu respektieren, wenn es wirklich sein muss.",
    id: "urchin_wayfarer",
    label: "Straßenkind / Wanderer",
    tags: ["streetwise", "scrappy", "rebellious"],
  },
];

const FLAWS: ContentOption[] = [
  {
    description:
      "Jeder geheime Satz klingt bei diesem Charakter sofort wie eine öffentliche Ankündigung.",
    id: "cannot_whisper",
    label: "Kann nicht flüstern",
    tags: ["awkward", "chaotic", "theatrical"],
  },
  {
    description:
      "Nichts bleibt lange sicher, sobald es wirklich gebraucht werden könnte.",
    id: "loses_important_things",
    label: "Verliert ständig wichtige Gegenstände",
    tags: ["chaotic", "awkward", "scrappy"],
  },
  {
    description:
      "Essbares zieht die Aufmerksamkeit dieses Charakters mit alarmierender Zuverlässigkeit an.",
    id: "distracted_by_snacks",
    label: "Ist leicht durch Snacks ablenkbar",
    tags: ["playful", "chaotic", "earnest"],
  },
  {
    description:
      "Ist sich sicher, unsichtbar zu wirken, obwohl wirklich jeder das Gegenteil beobachtet.",
    id: "thinks_stealthy",
    label: "Hält sich für viel stealthiger als er ist",
    tags: ["smug", "awkward", "streetwise"],
  },
  {
    description:
      "Selbst harmlose Ausreden klingen, als würden sie gleich unter höflichem Nachfragen zusammenbrechen.",
    id: "cannot_lie",
    label: "Kann nicht überzeugend lügen",
    tags: ["earnest", "awkward", "cunning"],
  },
  {
    description:
      "Findet Wege mit großer Zuversicht und meistens in die falsche Richtung.",
    id: "terrible_direction",
    label: "Hat eine erbärmliche Orientierung",
    tags: ["chaotic", "awkward", "worldly"],
  },
  {
    description:
      "Vertrauliche Informationen verlassen diesen Charakter oft schneller als geplant.",
    id: "cannot_keep_secrets",
    label: "Kann keine Geheimnisse für sich behalten",
    tags: ["earnest", "chaotic", "charming"],
  },
  {
    description:
      "Begegnungen beginnen freundlich und enden oft mit improvisierten Anreden.",
    id: "forgets_names",
    label: "Vergisst Namen direkt nach dem Hören",
    tags: ["awkward", "charming", "chaotic"],
  },
];

const QUIRKS: ContentOption[] = [
  {
    description:
      "Behandelt Gegenstände mit einer Feierlichkeit, die kaum jemand außer diesem Charakter für nötig hält.",
    id: "knocks_for_dignity",
    label: "Klopft auf Dinge, als müsste erst ihre Würde bestätigt werden",
    tags: ["formal", "whimsical", "stoic"],
  },
  {
    description:
      "Begrüßt selbst beiläufige Begegnungen mit der Ernsthaftigkeit eines großen Bühnenauftritts.",
    id: "bows_on_intro",
    label: "Macht bei jeder Vorstellung eine Verbeugung",
    tags: ["theatrical", "formal", "charming"],
  },
  {
    description:
      "Verleiht gewöhnlichen Aussagen regelmäßig eine irritierend epische Note.",
    id: "third_person_sometimes",
    label: "Spricht manchmal von sich in der dritten Person",
    tags: ["theatrical", "smug", "awkward"],
  },
  {
    description:
      "Kommentiert Dinge im Vorbeigehen, als würde gerade ein überraschend strenges Testformat laufen.",
    id: "spontaneous_product_reviews",
    label: "Führt spontane Produktbewertungen durch",
    tags: ["curious", "bureaucratic", "playful"],
  },
  {
    description:
      "Begegnet jeder Kreatur mit der sachlichen Höflichkeit eines gemeinsamen Arbeitstags.",
    id: "talks_to_animals_like_colleagues",
    label: "Spricht Tiere an, als seien sie Kollegen",
    tags: ["earnest", "whimsical", "charming"],
  },
  {
    description:
      "Liest in gewöhnliche Hindernisse sofort eine tiefere Bedeutung hinein.",
    id: "doors_are_symbolic",
    label: "Hält jede geschlossene Tür für symbolisch",
    tags: ["mystical", "dramatic", "awkward"],
  },
  {
    description:
      "Verleiht banalen Dingen Titel, als wären sie alte Verbündete mit Würde und Geschichte.",
    id: "gives_objects_honorific_names",
    label: "Gibt alltäglichen Gegenständen ehrfürchtige Spitznamen",
    tags: ["whimsical", "formal", "earnest"],
  },
  {
    description:
      "Lob klingt aus diesem Mund selten locker, dafür umso offizieller.",
    id: "compliments_like_royal_verdicts",
    label: "Spricht Komplimente aus, als wären es königliche Urteile",
    tags: ["noble", "formal", "charming"],
  },
];

const SIGNATURE_OBJECTS: ContentOption[] = [
  {
    description:
      "Ein Notizblock, der wirkt, als stünde darin entweder Geniales oder eine erstaunlich passive Beschwerdeliste.",
    id: "ominous_notebook",
    label: "Ominöser Notizblock",
    tags: ["scholarly", "eerie", "bureaucratic"],
  },
  {
    description:
      "Ein imposanter Schlüssel, dessen Bedeutung sofort wichtig wirkt, obwohl niemand weiß, wofür er gut ist.",
    id: "giant_key_unknown_door",
    label: "Riesiger Schlüssel ohne bekannte Tür",
    tags: ["mystical", "dramatic", "crafty"],
  },
  {
    description:
      "Ein Instrument mit viel Geschichte, mäßiger Pflege und dem festen Willen, trotzdem Eindruck zu machen.",
    id: "dented_lute",
    label: "Zerbeulte Laute",
    tags: ["theatrical", "glamorous", "scrappy"],
  },
  {
    description:
      "Ein überraschend feines Objekt, das gleichermaßen dekadent, unnötig und seltsam bedeutungsvoll wirkt.",
    id: "silver_dessert_spoon",
    label: "Silberner Dessertlöffel",
    tags: ["elegant", "noble", "whimsical"],
  },
  {
    description:
      "Ein Reiseaccessoire, das bequemen Luxus mit erstaunlich unpraktischer Würde verbindet.",
    id: "travel_pillow_crest",
    label: "Reisekissen mit Wappen",
    tags: ["noble", "playful", "glamorous"],
  },
  {
    description:
      "Ein Accessoire für maximale Urteilskraft, auch wenn der Blick dadurch nicht unbedingt klarer wird.",
    id: "crooked_monocle",
    label: "Schiefes Monokel",
    tags: ["smug", "scholarly", "elegant"],
  },
  {
    description:
      "Ein Stab, der deutlich stärker an Wirkung als an Zurückhaltung interessiert ist.",
    id: "overdecorated_walking_staff",
    label: "Überdekorierter Wanderstab",
    tags: ["mystical", "glamorous", "theatrical"],
  },
  {
    description:
      "Ein verschlossener Brief, der allein durch seine Existenz bereits Gerüchte und Spekulationen erzeugt.",
    id: "sealed_letter_unknown_sender",
    label: "Versiegelter Brief ohne Absender",
    tags: ["eerie", "noble", "dramatic"],
  },
  {
    description:
      "Ein kleines Objekt von überraschend strenger Präsenz, das niemand wirklich erklären kann.",
    id: "serious_wooden_duck",
    label: "Holzente mit ernstem Gesicht",
    tags: ["whimsical", "awkward", "eerie"],
  },
  {
    description:
      "Ein Hut, der jeden Raum so betritt, als hätte er selbst bereits eine Ansprache vorbereitet.",
    id: "dramatic_feather_hat",
    label: "Dramatischer Federhut",
    tags: ["theatrical", "glamorous", "smug"],
  },
];

const START_ITEMS: ContentOption[] = [
  {
    description:
      "Hält Wind ganz ordentlich ab, aber bei Regen wird jede Nacht automatisch zu einem Charaktertest.",
    id: "tent_hole_in_roof",
    label: "Zelt mit einem Loch im Dach",
    tags: ["rugged", "playful", "defective"],
  },
  {
    description:
      "Treuer Begleiter mit gutem Herzen, scharfem Blick und einer kompromisslosen Haltung zu unbeaufsichtigtem Proviant.",
    id: "dog_steals_food",
    label: "Hund, der zuverlässig Essen klaut",
    tags: ["charming", "chaotic", "playful"],
  },
  {
    description:
      "Spendet Licht, aber nur nach kurzem technischen Widerstand und etwas unnötiger Überredung.",
    id: "lantern_jammed_latch",
    label: "Laterne mit klemmendem Verschluss",
    tags: ["crafty", "awkward", "defective"],
  },
  {
    description:
      "Hat seinen Zweck schon einmal sehr deutlich erfüllt und trägt diese Erinnerung mit schwerer Würde.",
    id: "dented_shield",
    label: "Schild mit auffälliger Delle",
    tags: ["rugged", "stoic", "defective"],
  },
  {
    description:
      "Warm, robust und praktisch genug, um nützlich zu sein, auch wenn sie ständig neue Fragen aufwirft.",
    id: "horse_blanket_without_horse",
    label: "Pferdedecke ohne Pferd",
    tags: ["worldly", "awkward", "playful"],
  },
  {
    description:
      "Sättigend und erstaunlich haltbar, leider aber auch für Tiere, Räuber und neugierige Mitreisende leicht auffindbar.",
    id: "food_bag_smells_strong",
    label: "Essensvorrat in einem stark riechenden Beutel",
    tags: ["scrappy", "playful", "defective"],
  },
  {
    description:
      "Grundsätzlich eine gute Stütze, solange man ihm nicht im falschen Moment zu viel Vertrauen schenkt.",
    id: "walking_staff_loose_grip",
    label: "Wanderstab mit lockerem Griffstück",
    tags: ["rugged", "worldly", "defective"],
  },
  {
    description:
      "Noch klar als Seil erkennbar und meistens brauchbar, aber die geflickte Mitte sorgt für genau die falsche Art von Respekt.",
    id: "rope_patched_in_middle",
    label: "Seil mit einer auffällig geflickten Stelle",
    tags: ["crafty", "scrappy", "defective"],
  },
  {
    description:
      "Wirkt entschlossen und ist nicht völlig nutzlos, aber ihre tatsächliche Effektivität bleibt eher eine Charakterfrage.",
    id: "hatchet_blunt_edge",
    label: "Handaxt mit stumpfer Schneide",
    tags: ["rugged", "scrappy", "defective"],
  },
];

export const CHARACTER_CREATION_CONTENT: CharacterCreationContent = {
  backgrounds: BACKGROUNDS,
  classes: CLASSES,
  flaws: FLAWS,
  jobs: JOBS,
  quirks: QUIRKS,
  races: RACES,
  signatureObjects: SIGNATURE_OBJECTS,
  startItems: START_ITEMS,
};

export function contentOptionById(
  list: ContentOption[],
  id: string | null,
): ContentOption | undefined {
  if (id === null || id === "") {
    return undefined;
  }
  return list.find((option) => option.id === id);
}
