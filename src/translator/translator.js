import { CompendiumMapping } from "../../../babele/script/compendium-mapping.js";

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
        // Read config file
        const config = await Promise.all([
            fetch("modules/lang-de-pf2e/src/translator/translator-config.json")
                .then((r) => r.json())
                .catch((_e) => {
                    console.error("lang-de-pf2e: Couldn't find translator config file.");
                }),
        ]);

        // Initialize artwork lists
        this.artworkLists = {};

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

        // Create item blacklist for items. Actor items with compendium sources on this list won't get synchronized with the compendium data
        this.itemBlacklist = config[0]?.itemBlacklist ?? [];

        // Create list of mappings
        this.mappings = config[0]?.mappings ?? {};

        // Signalize translator is ready
        Hooks.callAll("langDePf2e.ready");
    }

    constructor() {
        this.initialize();
    }

    // Register a madia path for a compendium containing portrait and token images
    addMediaPath(compendium, path) {
        ["portraits", "tokens"].forEach(async (imageType) => {
            const imagePath = game.settings.get("lang-de-pf2e", "token")
                ? path.concat(`/portraits/`)
                : path.concat(`/${imageType}/`);
            const images = {};
            await foundry.applications.apps.FilePicker.implementation.browse("data", imagePath).then((picker) =>
                picker.files.forEach((file) => {
                    const actorName = file.split("\\").pop().split("/").pop().replace(".webp", "");

                    Object.assign(images, {
                        [actorName]: {
                            [imageType.substring(0, imageType.length - 1)]: file,
                        },
                    });
                })
            );

            foundry.utils.mergeObject(this.artworkLists, { [compendium]: images });
        });
    }

    // Sluggify a string
    sluggify(label) {
        return label
            .replace(/([a-z])([A-Z])\B/g, "$1-$2")
            .toLowerCase()
            .replace(/['’]/g, "")
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
        return this.mappings[mapping];
    }

    // Merge an object using a provided field mapping
    dynamicMerge(sourceObject, translation, mapping) {
        if (translation) {
            foundry.utils.mergeObject(sourceObject, mapping.map(sourceObject, translation ?? {}), { overwrite: true });
        }
        return sourceObject;
    }

    // Merge an array of objects using a provided field mapping
    dynamicArrayMerge(sourceArray, translations, mapping) {
        if (!translations) {
            return sourceArray;
        }
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

    // Check if strike is ranged or melee and return the type
    checkStrikeType(strike) {
        let strikeType = "strike-melee";
        strike.system.traits.value.forEach((trait) => {
            if (trait.startsWith("range-") || trait.startsWith("thrown-")) {
                strikeType = "strike-ranged";
            }
        });
        return strikeType;
    }

    // Normalize name for correct display within Foundry
    normalizeName(name) {
        return name.replace("ß", "ss");
    }

    registerCompendium(module, compendium, language, compendiumDirectory, imageDirectory = undefined) {
        // Register compendium
        if (game.babele) {
            game.babele.register({
                module: module,
                lang: language,
                dir: compendiumDirectory,
            });
        } else {
            console.error("lang-de-pf2e: Required module Babele not active");
        }

        // Register imageDirectory if provided
        if (imageDirectory) {
            this.addMediaPath(compendium, `modules/${module}/${imageDirectory}`);
        }
    }

    // Translate an array of similar objects, e.g. scenes or journal pages. This supports duplicate object names within the array using ids to identify the correct data
    translateArrayOfObjects(data, translation, mappingType) {
        data.forEach((entry, index, arr) => {
            let objectTranslation = translation ? translation[entry.name] ?? undefined : undefined;

            // Check if the object translation is an array (in case of duplicate names)
            // Take the objectTranslation that matches the current objects' id
            if (Array.isArray(objectTranslation)) {
                objectTranslation = objectTranslation.find((obj) => obj.id === entry._id) ?? false;
            }
            if (objectTranslation) {
                // For adventure journal pages, normalize the name
                if (mappingType === "adventureJournalPage") {
                    objectTranslation.name = this.normalizeName(objectTranslation.name);
                }
                this.dynamicMerge(arr[index], objectTranslation, this.getMapping(mappingType, true));
            }
        });
        return data;
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
                foundry.utils.mergeObject(data.levels, translation, { overwrite: true });
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

    translateItems(data, translation, actorItem = false, mergeFromCompendium = true) {
        data.forEach((entry, index, arr) => {
            // Get the available translation for the item and the sluggified item name
            let itemKey;

            // Build itemKey depending on the type of item (world item or actor item)
            if (actorItem) {
                itemKey =
                    entry.type != "melee"
                        ? `${entry.type}->${entry.name}`
                        : `${this.checkStrikeType(entry)}->${entry.name}`;
            } else {
                itemKey = entry.name;
            }
            let itemTranslation = translation ? translation[itemKey] ?? undefined : undefined;
            let itemName = entry.name;

            // For compendium items, get the data from the compendium

            const compendiumLink = getCompendiumLinkFromItemData(entry);
            if (
                compendiumLink &&
                compendiumLink.startsWith("Compendium.pf2e.") &&
                !compendiumLink.includes(".Actor.") &&
                !this.itemBlacklist.includes(compendiumLink)
            ) {
                // Get the actual compendium name
                const itemCompendium = compendiumLink.split(".");

                const originalName = fromUuidSync(compendiumLink)?.flags?.babele?.originalName;
                if (originalName) {
                    entry.name = originalName;
                    itemName = originalName;

                    // Get the item from the compendium
                    const itemData = game.babele.packs
                        .get(`${itemCompendium[1]}.${itemCompendium[2]}`)
                        .translate(entry);

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

                // Add babele standard translated fields
                foundry.utils.mergeObject(arr[index], {
                    translated: true,
                    hasTranslation: true,
                    originalName: itemName,
                    flags: {
                        babele: {
                            translated: true,
                            hasTranslation: true,
                            originalName: itemName,
                        },
                    },
                });

                // Translate available rules
                if (itemTranslation.rules) {
                    arr[index].system.rules = this.translateRules(entry.system.rules, itemTranslation.rules);
                }
            }

            // Add the item slug if not already included
            if (arr[index].system) {
                if (!arr[index].system.slug || arr[index].system.slug === "") {
                    arr[index].system.slug = this.sluggify(itemName);
                }
            }
        });

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

            // Translation for array of choices within ChoiceSet rule element and array of values within ItemAlteration rule element
            for (let i = 0; i < data.length; i++) {
                if (data[i].choices && translation[i]?.choices) {
                    this.dynamicArrayMerge(data[i].choices, translation[i].choices, this.getMapping("choice", true));
                }
                if (data[i].value && translation[i]?.value) {
                    this.dynamicArrayMerge(data[i].value, translation[i].value, this.getMapping("value", true));
                }
            }
        }
        return data;
    }

    // Translate the various table results for a rollable table
    translateTableResults(tableResults, translation) {
        if (translation) {
            for (let i = 0; i < tableResults.length; i++) {
                const range = tableResults[i].range.join("-");
                if (translation[range]) {
                    this.dynamicMerge(tableResults[i], translation[range], this.getMapping("tableResult", true));
                }
            }
        }
        return tableResults;
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

    // For default icons, update the image if included in the media path
    updateImage(type, value, dataObject, translatedCompendium) {
        if (!translatedCompendium) {
            return value;
        }
        // Get image source based on type
        let imageSource = "";
        if (type === "portrait") {
            imageSource = dataObject.img;
        } else if (type === "token") {
            imageSource = dataObject.prototypeToken.texture.src;
        } else {
            return value;
        }
        // Check, if image source uses default image
        if (!(imageSource.includes("systems/pf2e/") || imageSource.includes("icons/svg/mystery-man"))) {
            return value;
        }
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
}

/**
 * Extracts an item's compendium link for items, that originate from a compendium
 *
 * @param {Object} item         Item data
 * @returns {string|boolean}  The item's compendium link
 */
function getCompendiumLinkFromItemData(item) {
    let compendiumLink = false;
    if (item.flags?.core?.sourceId && item.flags.core.sourceId !== null) {
        compendiumLink = item.flags.core.sourceId;
    }
    if (item._stats?.compendiumSource && item._stats.compendiumSource !== null) {
        compendiumLink = item._stats.compendiumSource;
    }
    if (compendiumLink !== false && compendiumLink.startsWith("Compendium.pf2e.")) {
        return compendiumLink;
    }

    return false;
}
