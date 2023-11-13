// Create Translator instance and register settings
Hooks.once("init", () => {
    game.langDePf2e = Translator.get();

    // Register token setting
    game.settings.register("lang-de-pf2e", "token", {
        name: "Portraitbild als Token",
        hint: "Soll beim Import eines übersetzten NSCs aus einem Kompendium das Portraitbild als Token genutzt werden statt des regulären Token-Bilds?",
        scope: "world",
        type: Boolean,
        config: true,
        default: false,
        requiresReload: true,
    });
});

class Translator {
    static get() {
        if (!Translator.instance) {
            Translator.instance = new Translator();
        }
        return Translator.instance;
    }

    // Initialize translator
    async initialize() {
        this.artworkExceptions = {};
        // Read config file
        const config = await Promise.all([
            fetch("modules/lang-de-pf2e/src/translator/translator-config.json")
                .then((r) => r.json())
                .catch((_e) => {
                    console.error("lang-de-pf2e: Couldn't find translator config file.");
                }),
        ]);

        // Create list of artwork exceptions and initialize artwork lists
        this.artworkLists = {};
        const artworkExceptions = config[0]?.artworkExceptions ?? {};
        Object.keys(artworkExceptions).forEach((compendium) => {
            Object.keys(artworkExceptions[compendium]).forEach((module) => {
                if (game.modules.get(module)?.active) {
                    mergeObject(this.artworkExceptions, {
                        [compendium]: { [module]: artworkExceptions[compendium][module] },
                    });
                }
            });
        });

        // Get list of compendium exceptions
        this.compendiumExceptions = {};
        const basicCompendiumExceptions = config[0]?.compendiumExceptions ?? {};
        Object.keys(basicCompendiumExceptions).forEach((compendium) => {
            if (game.modules.get(basicCompendiumExceptions[compendium])?.active) {
                mergeObject(this.compendiumExceptions, {
                    [compendium]: basicCompendiumExceptions[compendium],
                });
            }
        });

        // Load translations from dictionary
        const dictionaryPath = config[0]?.paths?.dictionary ?? undefined;
        if (dictionaryPath) {
            const dict = await Promise.all([
                fetch(dictionaryPath)
                    .then((result) => result.json())
                    .catch((error) => {
                        console.error(error);
                    }),
            ]);
            this.dictionary = dict[0];
        } else {
            console.error("lang-de-pf2e: Dictionary not available");
        }

        // Create list of icons
        this.icons = config[0]?.iconList ?? {};

        // Create list of mappings
        this.mappings = config[0]?.mappings ?? {};

        // Signalize translator is ready
        Hooks.callAll("langDePf2e.ready");
    }

    constructor() {
        this.initialize();
    }

    // Register a madia path for a compendium containing portrait and token images
    addMediaPath(moduleName, compendium, path) {
        let creatureExclusions = [];
        let excluded = false;
        // Check if a different module excludes the compendium
        if (this.artworkExceptions[compendium]) {
            excluded = Object.keys(this.artworkExceptions[compendium]).some((exceptionModule) => {
                [exceptionModule];
                if (moduleName !== exceptionModule && this.artworkExceptions[compendium][exceptionModule] === "all") {
                    return true;
                } else if (
                    moduleName !== exceptionModule &&
                    Array.isArray(this.artworkExceptions[compendium][exceptionModule])
                ) {
                    creatureExclusions = creatureExclusions.concat(this.artworkExceptions[compendium][exceptionModule]);
                }
            });
        }

        if (!excluded) {
            ["portraits", "tokens"].forEach(async (imageType) => {
                const imagePath = game.settings.get("lang-de-pf2e", "token")
                    ? path.concat(`/portraits/`)
                    : path.concat(`/${imageType}/`);
                const images = {};
                await FilePicker.browse("data", imagePath).then((picker) =>
                    picker.files.forEach((file) => {
                        const actorName = file.split("\\").pop().split("/").pop().replace(".webp", "");
                        if (!creatureExclusions.includes(actorName)) {
                            Object.assign(images, {
                                [actorName]: {
                                    [imageType.substring(0, imageType.length - 1)]: file,
                                },
                            });
                        }
                    })
                );

                mergeObject(this.artworkLists, { [compendium]: images });
            });
        }
    }

    // Sluggify a string
    sluggify(label) {
        return label
            .replace(/([a-z])([A-Z])\B/g, "$1-$2")
            .toLowerCase()
            .replace(/'/g, "")
            .replace(/[^a-z0-9]+/gi, " ")
            .trim()
            .replace(/[-\s]+/g, "-");
    }

    // Get mapping
    getMapping(mapping, compendium = false) {
        if (compendium) {
            return this.mappings[mapping]
                ? new CompendiumMapping(this.mappings[mapping].entryType, this.mappings[mapping].mappingEntries)
                : {};
        }
        return this.mapping[mapping];
    }

    // Merge an object using a provided field mapping
    dynamicMerge(sourceObject, translation, mapping) {
        if (translation) {
            mergeObject(sourceObject, mapping.map(sourceObject, translation ?? {}), { overwrite: true });
        }
        return sourceObject;
    }

    // Merge an array of objects using a provided field mapping
    dynamicArrayMerge(sourceArray, translations, mapping) {
        // Loop through array, merge available objects
        const mappedObjectArray = [];
        for (let i = 0; i < sourceArray.length; i++) {
            if (translations[i]) {
                mappedObjectArray.push(this.dynamicMerge(sourceArray[i], translations[i], mapping));
            } else {
                mappedObjectArray.push(sourceArray[i]);
            }
        }
        return mappedObjectArray;
    }

    // Merge an object list using a provided field mapping
    dynamicObjectListMerge(sourceObjectList, translations, mapping) {
        if (translations) {
            const mergedObjectList = {};
            Object.keys(sourceObjectList).forEach((entry) => {
                Object.assign(mergedObjectList, {
                    [entry]: this.dynamicMerge(sourceObjectList[entry], translations[entry], mapping),
                });
            });
        }
    }

    // Normalize name for correct display within Foundry
    normalizeName(name) {
        return name.replace("ß", "ss");
    }

    registerCompendium(module, compendium, language, compendiumDirectory, imageDirectory = undefined) {
        // Register compendium, check if different modules excludes the compendium
        if (!(this.compendiumExceptions[compendium] && this.compendiumExceptions[compendium] !== module)) {
            if (typeof Babele !== "undefined") {
                Babele.get().register({
                    module: module,
                    lang: language,
                    dir: compendiumDirectory,
                });
            } else {
                console.error("lang-de-pf2e: Required module Babele not active");
            }
        }

        // Register imageDirectory if provided
        if (imageDirectory) {
            this.addMediaPath(module, compendium, `modules/${module}/${imageDirectory}`);
        }
    }

    // If an actor description format is provided create formatted html, otherwise use plain text
    translateActorDescription(data, translation) {
        if (translation) {
            try {
                JSON.parse(translation);
            } catch (e) {
                return translation;
            }
            const descriptionData = JSON.parse(translation);

            let actorDescription = "";

            // If actor description is available create actor name and actor description
            if (descriptionData.ActorDescription) {
                actorDescription = descriptionData.ActorName ? `<h2>${descriptionData.ActorName}</h2>` : "";
                actorDescription = actorDescription.concat(descriptionData.ActorDescription);
            }

            // Create creature family name
            if (descriptionData.FamilyName) {
                actorDescription = actorDescription.concat(`<p>&nbsp;</p><h2>${descriptionData.FamilyName}</h2>`);

                // If family name exists, create creature family description
                if (descriptionData.FamilyDescription)
                    actorDescription = actorDescription.concat(descriptionData.FamilyDescription);
            }

            // Create additional infos
            if (descriptionData.AdditionalInfo) {
                actorDescription = actorDescription.concat(`<p>&nbsp;</p><table border="0"><tbody>`);

                for (const [infoTypeNumbered, infos] of Object.entries(descriptionData.AdditionalInfo)) {
                    const infoType = infoTypeNumbered.slice(0, infoTypeNumbered.length - 1);
                    if (["item", "lore", "location", "monster", "rule", "treasure"].includes(infoType)) {
                        const img = this.icons[infoType]
                            ? `<img src="${this.icons[infoType]}" alt="" width="40" height="40" />`
                            : " ";

                        for (const [infoName, infoText] of Object.entries(infos)) {
                            actorDescription = actorDescription
                                .concat(`<tr><td style="width: 45px" valign= "top">${img}</td>`)
                                .concat(`<td><h3>${infoName}</h3>${infoText}</td></tr>`);
                        }
                    }
                }

                actorDescription = actorDescription.concat(`</tbody></table>`);
            }
            return actorDescription;
        }
        return data;
    }

    translateActorItems(data, translation, mergeFromCompendium = true) {
        data.forEach((entry, index, arr) => {
            // Get the available translation for the item and the sluggified item name
            const itemKey =
                entry.type != "melee"
                    ? `${entry.type}->${entry.name}`
                    : `strike-${entry.system.weaponType.value}->${entry.name}`;
            let itemTranslation = translation ? translation[itemKey] ?? undefined : undefined;
            const itemNameSlug = this.sluggify(entry.name);

            // For compendium items, get the data from the compendium
            if (
                entry.flags?.core?.sourceId &&
                entry.flags.core.sourceId.startsWith("Compendium") &&
                !entry.flags.core.sourceId.includes(".Actor.")
            ) {
                // Get the actual compendium name
                const itemCompendium = entry.flags.core.sourceId.slice(
                    entry.flags.core.sourceId.indexOf(".") + 1,
                    entry.flags.core.sourceId.lastIndexOf(".", entry.flags.core.sourceId.lastIndexOf(".") - 1)
                );

                const originalName = fromUuidSync(entry.flags.core.sourceId)?.flags?.babele?.originalName;
                if (originalName) {
                    entry.name = originalName;

                    // Get the item from the compendium
                    const itemData = game.babele.packs.get(itemCompendium).translate(entry);

                    if (mergeFromCompendium) {
                        arr[index] = itemData;
                    } else {
                        arr[index].system.description.value = itemData.system.description.value;
                        arr[index].name = itemData.name;
                    }

                    // Remove dual language translations
                    if (arr[index].name.search("/") != -1) {
                        arr[index].name = arr[index].name.substring(0, arr[index].name.search("/"));
                    }
                }
            }

            // Check if the item translation is an array (in case of duplicate items such as a magical and a regular shortsword)
            // Take the itemTranslation that matches the current item's id
            if (Array.isArray(itemTranslation)) {
                itemTranslation = itemTranslation.find((itm) => itm.id === entry._id) ?? false;
            }

            // Merge the available translation
            if (itemTranslation) {
                // Normalize item name
                if (itemTranslation.name) {
                    itemTranslation.name = this.normalizeName(itemTranslation.name);
                }
                // For name and description fields, replace "<Compendium>" tag with text from compendium if translation is provided
                ["description", "name"].forEach((dataElement) => {
                    if (itemTranslation[dataElement]) {
                        if (itemTranslation[dataElement].startsWith("<Compendium> tag will get replaced")) {
                            delete itemTranslation[dataElement];
                        } else {
                            itemTranslation[dataElement] =
                                dataElement === "description"
                                    ? itemTranslation[dataElement].replace(
                                          "<Compendium>",
                                          arr[index].system.description.value
                                      )
                                    : itemTranslation[dataElement].replace("<Compendium>", arr[index].name);
                        }
                    }
                });

                this.dynamicMerge(arr[index], itemTranslation, this.getMapping("item", true));

                // Translate available rules
                if (itemTranslation.rules) {
                    arr[index].system.rules = this.translateRules(entry.system.rules, itemTranslation.rules);
                }
            }

            // Add the item slug if not already included
            if (!arr[index].system.slug || arr[index].system.slug === "") {
                arr[index].system.slug = itemNameSlug;
            }
        });

        return data;
    }

    // Translate adventure journals. This is primarily used in order to access a custom converter for pages translation
    translateAdventureJournals(data, translation) {
        data.forEach((entry, index, arr) => {
            let journalTranslation = translation ? translation[entry.name] ?? undefined : undefined;
            this.dynamicMerge(arr[index], journalTranslation, this.getMapping("adventureJournal", true));
        });
        return data;
    }

    // Translate adventure journal pages. This supports duplicate page names within the same journal
    translateAdventureJournalPages(data, translation) {
        data.forEach((entry, index, arr) => {
            let pageTranslation = translation ? translation[entry.name] ?? undefined : undefined;

            // Check if the page translation is an array (in case of duplicate page names)
            // Take the pageTranslation that matches the current pages' id
            if (Array.isArray(pageTranslation)) {
                pageTranslation = pageTranslation.find((page) => page.id === entry._id) ?? false;
            }
            if (pageTranslation) {
                this.dynamicMerge(arr[index], pageTranslation, this.getMapping("adventureJournalPage", true));
            }
        });
        return data;
    }

    // Return either localized or both localized and english text, based on module setting
    translateDualLanguage(data, translation) {
        if (!translation || data === translation) {
            return data;
        } else if (game.settings.get("lang-de-pf2e", "dual-language-names")) {
            return this.normalizeName(translation) + "/" + data;
        } else {
            return this.normalizeName(translation);
        }
    }

    // Translate heightened spells
    translateHeightening(data, translation) {
        if (data.levels) {
            if (translation) {
                mergeObject(data.levels, translation, { overwrite: true });
            }
            Object.keys(data.levels).forEach((level) => {
                ["duration", "range", "time"].forEach((fieldName) => {
                    if (data.levels[level][fieldName]?.value) {
                        data.levels[level][fieldName].value = this.translateValue(
                            fieldName,
                            data.levels[level][fieldName].value
                        );
                    }
                });
            });
        }
        return data;
    }

    // Translates a specified value within an object using the dictionary
    translateObject(type, fieldName, sourceObject) {
        const translatedObject = {};
        for (const [objectKey, objectData] of Object.entries(sourceObject)) {
            if (objectKey === fieldName) {
                Object.assign(translatedObject, { [objectKey]: this.translateValue(type, objectData) });
            } else {
                Object.assign(translatedObject, { [objectKey]: objectData });
            }
        }
        return translatedObject;
    }

    // Translates a specified value within a normalized object list using the dictionary
    // Sample call: translateObjectList("resistance", "exceptions", value);
    translateObjectList(type, fieldName, sourceObjectList) {
        if (Array.isArray(sourceObjectList)) {
            const translatedArray = [];
            sourceObjectList.forEach((sourceObject) => {
                translatedArray.push(this.translateObject(type, fieldName, sourceObject));
            });
            return translatedArray;
        } else if (typeof sourceObjectList === "object") {
            const translatedObjectList = {};
            for (const [objectKey, objectData] of Object.entries(sourceObjectList)) {
                Object.assign(translatedObjectList, { [objectKey]: this.translateObject(type, fieldName, objectData) });
            }
            return translatedObjectList;
        }
    }

    // Translate text labels provided in rule elements
    translateRules(data, translation) {
        if (translation) {
            // Translation for regular strings like labels
            this.dynamicArrayMerge(data, translation, this.getMapping("rule", true));

            // Translation for array of choices within ChoiceSet rule element
            for (let i = 0; i < data.length; i++) {
                if (data[i].choices && translation[i]?.choices) {
                    this.dynamicArrayMerge(data[i].choices, translation[i].choices, this.getMapping("choice", true));
                }
            }
        }
        return data;
    }

    // Use a unique token name if provided, otherwise use the translated actor name
    translateTokenName(data, translation, translationObject) {
        return translation ?? translationObject.name ?? data;
    }

    // Translates a value from the dictionary
    translateValue(type, value) {
        const convertedValue = String(value).toLowerCase();
        if (
            Object.keys(this.dictionary).includes(type) &&
            Object.keys(this.dictionary[type]).includes(convertedValue)
        ) {
            return this.dictionary[type][convertedValue];
        }
        return value;
    }

    // Update the image if included in the media path
    updateImage(type, value, dataObject, translatedCompendium) {
        const artworkList = this.artworkLists[translatedCompendium.metadata.name];
        if (
            dataObject.type === "npc" &&
            artworkList &&
            artworkList[this.sluggify(dataObject.name)] &&
            ["portrait", "token"].includes(type)
        ) {
            return artworkList[this.sluggify(dataObject.name)][type] ?? value;
        }
        return value;
    }

    // Migrate images to new structure
    migrateImages(moduleName) {
        for (const scene of game.scenes) {
            for (const token of scene.tokens) {
                if (
                    token.actor?.flags?.core?.sourceId &&
                    token.actor.flags.core.sourceId.startsWith("Compendium.pf2e")
                ) {
                    fromUuid(token.actor.flags.core.sourceId).then((compActor) => {
                        const update = { _id: token._id };
                        if (token.texture.src.search(`/${moduleName}/`) > -1) {
                            Object.assign(update, { texture: { src: compActor.prototypeToken.texture.src } });
                        }
                        if (token.actorData?.img && token.actorData.img.search(`/${moduleName}/`) > -1) {
                            update.actorData = update.actorData || {};
                            Object.assign(update.actorData, { img: compActor.img });
                        }
                        if (token.actorData?.system?.details?.publicNotes) {
                            update.actorData = update.actorData || {};
                            const newNotes = token.actorData.system.details.publicNotes.replaceAll(
                                "/npc/icons/",
                                "/static/icons/"
                            );
                            Object.assign(update.actorData, { system: { details: { publicNotes: newNotes } } });
                        }
                        if (Object.keys(update).length > 1) {
                            scene.updateEmbeddedDocuments("Token", [update]);
                        }
                    });
                }
            }
        }

        for (const actor of game.actors) {
            if (actor.flags?.core?.sourceId && actor.flags.core.sourceId.startsWith("Compendium.pf2e")) {
                fromUuid(actor.flags.core.sourceId).then((compActor) => {
                    const update = {};
                    if (actor.prototypeToken.texture.src.search(`/${moduleName}/`) > -1) {
                        Object.assign(update, {
                            prototypeToken: { texture: { src: compActor.prototypeToken.texture.src } },
                        });
                    }
                    if (actor.img.search(`/${moduleName}/`) > -1) {
                        Object.assign(update, { img: compActor.img });
                    }
                    if (actor.system?.details?.publicNotes) {
                        const newNotes = actor.system.details.publicNotes.replaceAll("/npc/icons/", "/static/icons/");
                        Object.assign(update, { system: { details: { publicNotes: newNotes } } });
                    }
                    actor.update(update);
                });
            }
        }
    }
}
