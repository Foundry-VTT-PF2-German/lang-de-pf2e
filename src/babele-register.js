// Prevent errors due to data structure changes - thanks to n1xx1 from the italian localization for the coding
function removeMismatchingTypes(fallback, other = {}) {
    for (let k of Object.keys(other)) {
        const replacement = other[k];
        const replacementType = getType(replacement);

        if (!fallback.hasOwnProperty(k)) {
            delete other[k];
            continue;
        }

        const original = fallback[k];
        const originalType = getType(original);

        if (replacementType === "Object" && originalType === "Object") {
            removeMismatchingTypes(original, replacement);
            continue;
        }

        if (originalType !== "undefined" && replacementType !== originalType) {
            delete other[k];
        }
    }

    return fallback;
}

Hooks.once("init", () => {
    if (typeof Babele !== "undefined") {
        game.settings.register("lang-de-pf2e", "dual-language-names", {
            name: "Namen in Deutsch und Englisch",
            hint: "Zusätzlich zum deutschen Namen wird auch der englische Name verwendet.",
            scope: "world",
            type: Boolean,
            default: false,
            config: true,
            onChange: foundry.utils.debounce(() => {
                window.location.reload();
            }, 100),
        });

        Babele.get().register({
            module: "lang-de-pf2e",
            lang: "de",
            dir: "translation/de/compendium",
        });

        Babele.get().registerConverters({
            normalizeName: (_data, translation) => {
                return game.langDePf2e.normalizeName(translation);
            },
            translateActorDescription: (data, translation) => {
                return game.langDePf2e.translateActorDescription(data, translation);
            },
            translateActorItems: (data, translation, dataObject, translatedCompendium, translationObject) => {
                return game.langDePf2e.translateActorItems(
                    data,
                    translation,
                    dataObject,
                    translatedCompendium,
                    translationObject
                );
            },
            translateDualLanguage: (data, translation) => {
                return game.langDePf2e.translateDualLanguage(data, translation);
            },
            translateDuration: (data) => {
                return game.langDePf2e.translateValue("duration", data);
            },
            translateHeightening: (data, translation) => {
                return game.langDePf2e.dynamicObjectListMerge(
                    data,
                    translation,
                    game.langDePf2e.getMapping("heightening", true)
                );
            },
            translateJournal: (pages, translation) => {
                return game.langDePf2e.translateJournal(pages, translation);
            },
            translateRange: (data) => {
                return game.langDePf2e.translateValue("range", data);
            },
            translateRules: (data, translation) => {
                return game.langDePf2e.translateRules(data, translation);
            },
            translateSource: (data) => {
                return game.langDePf2e.translateValue("source", data);
            },
            translateSpellVariant: (data, translation) => {
                return game.langDePf2e.dynamicObjectListMerge(
                    data,
                    translation,
                    game.langDePf2e.getMapping("item", true)
                );
            },
            translateTime: (data) => {
                return game.langDePf2e.translateValue("time", data);
            },
            translateTokenName: (data, translation, _dataObject, _translatedCompendium, translationObject) => {
                return game.langDePf2e.translateTokenName(data, translation, translationObject);
            },
            updateActorImage: (data, _translations, dataObject, translatedCompendium) => {
                return game.langDePf2e.updateImage("portrait", data, dataObject, translatedCompendium);
            },
            updateTokenImage: (data, _translations, dataObject, translatedCompendium) => {
                return game.langDePf2e.updateImage("token", data, dataObject, translatedCompendium);
            },
        });
    }
});

Hooks.once("ready", () => {
    const pack = game.packs.get("pf2e.feats-srd");
    // Alle Felder die für das Filtern gebraucht werden
    const fields = [
        "system.prerequisites.value",
        "system.source.value",
        "system.level.value",
        "system.description.value",
        "name",
        "originalName",
    ];
    // Erstellt einen neuen Index oder ruft einen bestehenden Index ab wenn alle Felder bereits indiziert sind
    pack.getIndex({ fields });
});

Hooks.once("i18nInit", () => {
    if (game.i18n.lang === "de") {
        const fallback = game.i18n._fallback;
        removeMismatchingTypes(fallback, game.i18n.translations);
    }
});
