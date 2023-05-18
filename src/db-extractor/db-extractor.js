import { existsSync, mkdirSync, readdirSync, readFileSync, writeFile, writeFileSync } from "fs";
import { resolvePath, resolveValue } from "path-value";
import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/db-extractor/db-extractor-config.json", "utf-8"));

// Set skill list
const SKILLS = CONFIG.skillList ?? [];

// Create list of all db packs for extraction
let DBPACKS = [];
Object.keys(CONFIG.packs).forEach((packGroup) => {
    if (resolvePath(CONFIG.packs[packGroup], "packNames").exists) {
        DBPACKS = DBPACKS.concat(CONFIG.packs[packGroup].packNames);
    } else {
        Object.keys(CONFIG.packs[packGroup]).forEach((packSubGroup) => {
            DBPACKS = DBPACKS.concat(CONFIG.packs[packGroup][packSubGroup].packNames);
        });
    }
});

// Dictionary
const dictionaryData = {};

// Actor item comparison database
let actorItemComparison = {};

// Pull current pf2 release and extract db files
if (!existsSync(CONFIG.filePaths.db)) {
    mkdirSync(CONFIG.filePaths.db);
}

// Fetch the file from the URL
fetch(CONFIG.filePaths.zipURL).then((res) => {
    res.blob().then((blobRes) => {
        // Read the zip archive
        const zipReader = new ZipReader(new BlobReader(blobRes));
        zipReader.getEntries().then((res) => {
            return Promise.all(
                res.map((zipEntry) => {
                    let saveFileName = "";
                    let fileFound = false;
                    // Get the db data files
                    if (
                        zipEntry.filename.startsWith(CONFIG.filePaths.zipDb) &&
                        DBPACKS.includes(zipEntry.filename.replace(`${CONFIG.filePaths.zipDb}/`, "").replace(".db", ""))
                    ) {
                        fileFound = true;
                        saveFileName = zipEntry.filename.replace(
                            `${CONFIG.filePaths.zipDb}/`,
                            `${CONFIG.filePaths.db}/`
                        );
                        // Get the I18N files (en.json and re-en.json)
                    } else if (
                        zipEntry.filename.startsWith(CONFIG.filePaths.zipI18n) &&
                        CONFIG.i18nFiles.includes(zipEntry.filename.replace(`${CONFIG.filePaths.zipI18n}/`, ""))
                    ) {
                        fileFound = true;
                        saveFileName = zipEntry.filename.replace(
                            `${CONFIG.filePaths.zipI18n}/`,
                            `${CONFIG.filePaths.i18n}/`
                        );
                    }
                    // Get the file from the zip archive and write it to the target directory
                    if (fileFound) {
                        return zipEntry.getData(new BlobWriter()).then((blobRes) => {
                            return blobRes.arrayBuffer().then((data) => {
                                writeFileSync(saveFileName, Buffer.from(data));
                            });
                        });
                    } else {
                        // Signalize that everything is done,
                        // as there was nothing to do with no file found
                        return Promise.resolve();
                    }
                })
            ).then(() => {
                //Read available data pack files
                const dbFiles = readdirSync(CONFIG.filePaths.db);

                formatI18nFiles();
                if (resolvePath(CONFIG, "packs.ItemPacks").exists) {
                    extractPackGroup("ItemPacks", CONFIG.packs.ItemPacks, dbFiles);
                    extractPackGroupList(CONFIG.packs.OtherPacks, dbFiles);
                } else console.error(`Mandatory Pack Group "ItemPacks" missing in config.`);

                // Build the dictionary
                if (Object.keys(dictionaryData).length > 0) {
                    const dictionary = sortObject(dictionaryData);
                    Object.keys(dictionary).forEach((dictionaryEntry) => {
                        Object.assign(dictionary, { [dictionaryEntry]: sortObject(dictionary[dictionaryEntry]) });
                    });

                    writeFile(CONFIG.filePaths.dictionary, JSON.stringify(dictionary, null, 2), (error) => {
                        if (error) throw error;
                    });
                }
            });
        });
    });
});

// Extract data from a single pack
function extractPack(packName, packConfig, dbFiles) {
    // Create basic json structure
    const extractedPack = {
        label: packName,
        entries: {},
        mapping: {},
    };

    // Unsorted extracted entries
    const entries = {};

    // Open source DB file if available
    if (dbFiles.includes(`${packName}.db`)) {
        const dbData = readFileSync(`${CONFIG.filePaths.db}/${packName}.db`, "utf-8")
            .toString()
            .trim()
            .split("\n")
            .map(JSON.parse);

        // Build comparison database?
        const createComparisonData = resolvePath(packConfig, `packCompendiumMapping.${packName}`).exists ? true : false;
        const compendiumName = createComparisonData ? packConfig.packCompendiumMapping[packName] : "";

        // Initialize structure of neccessary
        if (createComparisonData) {
            actorItemComparison[compendiumName] = actorItemComparison[compendiumName] || {};
        }

        // Loop through source data and look for keys included in the mappings
        Object.values(dbData).forEach((dbDataEntry) => {
            // Add entry to comparison database
            if (createComparisonData) {
                actorItemComparison[compendiumName][dbDataEntry._id] = dbDataEntry;
            }

            // Extract entries based on mapping in config file
            const extractedEntry = extractEntry(CONFIG.mappings[packConfig.mapping], dbDataEntry);
            if (extractedEntry[0] !== undefined) {
                Object.assign(entries, extractedEntry[0]);
            }
            if (extractedEntry[1] !== undefined) {
                addMapping(extractedPack.mapping, extractedEntry[1]);
            }
        });

        // Sort entries and assign them to final export object
        Object.keys(entries)
            .sort()
            .forEach(function (mappingKey) {
                extractedPack.entries[mappingKey] = entries[mappingKey];
            });

        // Mapping sortieren
        extractedPack.mapping = sortObject(extractedPack.mapping);

        // Save file to directory
        writeFile(
            `${CONFIG.filePaths[packConfig.savePath]}/${packName}.json`,
            JSON.stringify(extractedPack, null, 2),
            (error) => {
                if (error) throw error;
            }
        );

        console.log(`Extracted pack: ${packName}`);
    }
}

// Extract pack data from a list of pack groups
function extractPackGroupList(packGroupList, dbFiles) {
    for (const [packGroup, packConfig] of Object.entries(packGroupList)) {
        extractPackGroup(packGroup, packConfig, dbFiles);
    }
}

// Extract data from a pack group
function extractPackGroup(packGroup, packConfig, dbFiles) {
    // Loop through packs and extract data defined in mappings
    console.log(`\n--------------------------\nExtracting: ${packGroup}\n--------------------------`);
    packConfig.packNames.forEach((packName) => {
        extractPack(packName, packConfig, dbFiles);
    });
}

function formatI18nFiles() {
    const i18nFiles = readdirSync(CONFIG.filePaths.i18n);
    CONFIG.i18nFiles.forEach((i18nFile) => {
        if (i18nFiles.includes(i18nFile)) {
            const fileData = JSON.parse(readFileSync(`${CONFIG.filePaths.i18n}/${i18nFile}`, "utf-8"));
            writeFile(`${CONFIG.filePaths.i18n}/${i18nFile}`, JSON.stringify(fileData, null, 2), (error) => {
                if (error) throw error;
            });
        }
    });
}

//Add new mapping entries
function addMapping(mapping, mappingData, converter = false) {
    Object.keys(mappingData).forEach((mappingKey) => {
        if (!resolvePath(mapping, mappingKey).exists) {
            // Check if the current mapping entry already contains a complete converter mapping
            if (resolvePath(mappingData, [mappingKey, converter]).exists) {
                Object.assign(mapping, { [mappingKey]: mappingData[mappingKey] });
            } else {
                const newMapping = converter
                    ? { path: mappingData[mappingKey], converter: converter }
                    : mappingData[mappingKey];

                Object.assign(mapping, { [mappingKey]: newMapping });
            }
        }
    });
}

// Convert array to object list
function convertArray(sourceArray) {
    if (Array.isArray(sourceArray)) {
        return Object.assign({}, sourceArray);
    }
    return sourceArray;
}

// Extend dictionary entries
function extendDictionary(mappingKey, extractedData) {
    if (Array.isArray(extractedData)) {
        extractedData.forEach((arrayValue) => {
            addToDictionary(mappingKey, arrayValue);
        });
    } else {
        const convertedValue = String(extractedData).toLowerCase();
        if (!resolvePath(dictionaryData, [mappingKey, convertedValue]).exists) {
            dictionaryData[mappingKey] = dictionaryData[mappingKey] || {};
        }
        Object.assign(dictionaryData[mappingKey], { [convertedValue]: extractedData });
    }
}

// Sort an object by key
function sortObject(sourceObject) {
    return Object.keys(sourceObject)
        .sort()
        .reduce((obj, key) => {
            obj[key] = sourceObject[key];
            return obj;
        }, {});
}

// Extract an entry
function extractEntry(
    baseMapping,
    dbDataEntry,
    idType = "dynamic",
    idName = "name",
    specialExtraction = false,
    addToMapping = true
) {
    // Check if there already exists a complete mapping, take mapping from config otherwise
    const entryMapping = typeof baseMapping === "object" ? baseMapping : CONFIG.mappings[baseMapping];

    // Apply special extraction rules on entry level
    if (specialExtraction !== false) {
        if (specialExtraction === "actorItem") {
            idType = "static";
            idName = `${dbDataEntry.type}->`;
            if (dbDataEntry.type === "melee") {
                idName = `strike-${dbDataEntry.system.weaponType.value}->`;
            }
            idName = idName.concat(`${dbDataEntry.name}`);
        } else if (specialExtraction === "tableResult") {
            idType = "static";
            idName = `${dbDataEntry.range[0]}-${dbDataEntry.range[1]}`;
        }
    }

    // Initialize variables for data and mapping extraction and get
    let currentEntry = {};
    const currentMapping = {};

    // Loop through mappings for the entry, extract matching data
    for (const [mappingKey, mappingData] of Object.entries(entryMapping)) {
        // Get added options for extraction
        const extractOptions = resolvePath(mappingData, "extractOptions").exists ? mappingData.extractOptions : false;
        const option_actorItemExtraction = resolvePath(extractOptions, "actorItemExtraction").exists
            ? extractOptions.actorItemExtraction
            : true;
        const option_addSubMappingToMapping = resolvePath(extractOptions, "addSubMappingToMapping").exists
            ? extractOptions.addSubMappingToMapping
            : false;
        const option_addToDictionary = resolvePath(extractOptions, "addToDictionary").exists
            ? extractOptions.addToDictionary
            : false;
        const option_addToMapping = resolvePath(extractOptions, "addToMapping").exists
            ? extractOptions.addToMapping
            : true;
        const option_alwaysAddMapping = resolvePath(extractOptions, "alwaysAddMapping").exists
            ? extractOptions.alwaysAddMapping
            : false;
        const option_extractValue = resolvePath(extractOptions, "extractValue").exists
            ? extractOptions.extractValue
            : true;
        const option_dictionaryName = resolvePath(extractOptions, "dictionaryName").exists
            ? extractOptions.dictionaryName
            : mappingKey;
        const option_idType = resolvePath(extractOptions, "idType").exists ? extractOptions.idType : false;
        const option_idName = resolvePath(extractOptions, "idName").exists ? extractOptions.idName : false;
        const option_specialExtraction = resolvePath(extractOptions, "specialExtraction").exists
            ? extractOptions.specialExtraction
            : false;
        const option_subMapping = resolvePath(extractOptions, "subMapping").exists ? extractOptions.subMapping : false;

        // Check if the current field uses a converter
        const hasConverter = mappingData.converter ? mappingData.converter : false;

        // Check if path to the data field is a single entry or an array of possible paths
        const dataPaths = resolvePath(mappingData, "path").exists
            ? Array.isArray(mappingData.path)
                ? mappingData.path
                : [mappingData.path]
            : [];

        // Loop through possible data field paths, take the first one found
        dataPaths.some((dataPath) => {
            let dataFound = false;

            // Check if the current field exists in the db entry
            let extractedData = resolvePath(dbDataEntry, dataPath).exists ? resolveValue(dbDataEntry, dataPath) : false;
            // Add mappings that should always be included
            if (addToMapping && option_alwaysAddMapping) {
                addMapping(currentMapping, { [mappingKey]: dataPath }, hasConverter);
            }

            // Extract the data, ignoring empty data fields, objects and arrays
            // Also ignore numbers, values already containing a localization variable like "PF2E." and other variables
            if (
                extractedData &&
                ((!Array.isArray(extractedData) &&
                    typeof extractedData !== "object" &&
                    extractedData !== null &&
                    isNaN(extractedData) &&
                    extractedData !== "" &&
                    extractedData.substring(0, 4) !== "PF2E" &&
                    extractedData.search(RegExp(`^\\{[^\\}]*\\}$`, "g")) === -1 &&
                    extractedData.search(RegExp(`^<p>@Localize\\[[^\\]]*\\]</p>$`, "g")) === -1) ||
                    (!Array.isArray(extractedData) &&
                        typeof extractedData === "object" &&
                        Object.keys(extractedData).length > 0) ||
                    (Array.isArray(extractedData) && extractedData.length > 0))
            ) {
                dataFound = true;

                // Add mapping
                if (addToMapping && option_addToMapping && !option_alwaysAddMapping) {
                    addMapping(currentMapping, { [mappingKey]: dataPath }, hasConverter);
                }

                // Add to dictionary
                if (option_addToDictionary) {
                    extendDictionary(option_dictionaryName, extractedData);
                }

                // Extract the data
                if (option_extractValue) {
                    // If extracted data is an array, convert it to an object list
                    if (Array.isArray(extractedData) && !resolvePath(extractOptions, "noArrayConvert").exists) {
                        extractedData = convertArray(extractedData);
                    }

                    let extracted = false;
                    // Apply special extraction rules on mapping entry level

                    if (specialExtraction) {
                        // Special extraction for actor items
                        if (specialExtraction === "actorItem") {
                            // All fields to be extracted are checked against the source id if available
                            // and only get extracted if values differ from each other
                            // (exptions: no extraction for the descriptions of ancestries, backgrounds, classes, feats, heritages, and spells)
                            // Regular extraction if no source id is provided
                            if (option_actorItemExtraction) {
                                // Do some special treatment first...

                                // ...Don't extract names for skills
                                if (
                                    dbDataEntry.type === "lore" &&
                                    mappingKey === "name" &&
                                    SKILLS.includes(dbDataEntry.name)
                                ) {
                                    extracted = true;

                                    // ... for weapons, include runes into the name
                                } else if (
                                    dbDataEntry.type === "weapon" &&
                                    mappingKey === "name" &&
                                    !resolvePath(dbDataEntry, "system.specific.value").exists
                                ) {
                                    const nameAdditions = [];
                                    // Potency rune
                                    if (
                                        resolvePath(dbDataEntry, "system.potencyRune.value").exists &&
                                        dbDataEntry.system.potencyRune.value > 0
                                    ) {
                                        nameAdditions.push("+".concat(dbDataEntry.system.potencyRune.value));
                                    }

                                    // Other runes and material
                                    [
                                        "system.strikingRune.value",
                                        "system.preciousMaterial.value",
                                        "system.propertyRune1.value",
                                        "system.propertyRune2.value",
                                        "system.propertyRune3.value",
                                        "system.propertyRune4.value",
                                    ].forEach((property) => {
                                        if (
                                            resolvePath(dbDataEntry, property).exists &&
                                            resolveValue(dbDataEntry, property) !== null &&
                                            resolveValue(dbDataEntry, property) !== ""
                                        ) {
                                            nameAdditions.push(resolveValue(dbDataEntry, property));
                                        }
                                    });
                                    if (nameAdditions.length > 0) {
                                        currentEntry[mappingKey] = `${extractedData} (${nameAdditions.join(",")})`;
                                        extracted = true;
                                    }
                                }
                                // Check for source ID
                                if (
                                    !extracted &&
                                    resolvePath(dbDataEntry, "flags.core.sourceId").exists &&
                                    dbDataEntry.flags.core.sourceId.includes("Compendium.pf2e")
                                ) {
                                    const compendiumLink = dbDataEntry.flags.core.sourceId.split(".");
                                    const compendiumEntry = resolvePath(actorItemComparison, [
                                        `${compendiumLink[1]}.${compendiumLink[2]}`,
                                        compendiumLink[3],
                                    ]).exists
                                        ? resolveValue(actorItemComparison, [
                                              `${compendiumLink[1]}.${compendiumLink[2]}`,
                                              compendiumLink[3],
                                          ])
                                        : undefined;
                                    if (typeof compendiumEntry === "undefined") {
                                        // Data quality check currently not active, because embedded documents don't get checked for broken links in pf2e system
                                        // console.warn("Broken Link: ".concat(dbDataEntry.flags.core.sourceId));
                                        // Don't extract descriptions for defined item types. Those always use the description from the compendium entry
                                    } else if (
                                        mappingKey === "description" &&
                                        ["ancestry", "background", "class", "feat", "heritage", "spell"].includes(
                                            dbDataEntry.type
                                        )
                                    ) {
                                        extracted = true;
                                        // Don't extract data if value is identical to compendium data
                                    } else if (
                                        resolvePath(compendiumEntry, dataPath).exists &&
                                        extractedData === resolveValue(compendiumEntry, dataPath)
                                    ) {
                                        extracted = true;

                                        // If value differs from compendium data, add translation note for name and description
                                    } else if (
                                        resolvePath(compendiumEntry, dataPath).exists &&
                                        ["description", "name"].includes(mappingKey) &&
                                        extractedData !== resolveValue(compendiumEntry, dataPath)
                                    ) {
                                        currentEntry[
                                            mappingKey
                                        ] = `<Compendium> tag will get replaced with text from compendium entry @UUID[${dbDataEntry.flags.core.sourceId}]\n${extractedData}`;
                                        extracted = true;
                                    }
                                }
                            } else {
                                extracted = true;
                            }
                        } else if (specialExtraction === "tableResult") {
                            currentEntry = extractedData;
                            extracted = true;
                        }
                    }
                    if (!extracted) {
                        // Convert nested data in case submappings exist
                        if (option_subMapping) {
                            Object.keys(extractedData).forEach((subEntry) => {
                                const extractedSubEntry = extractEntry(
                                    option_subMapping,
                                    extractedData[subEntry],
                                    option_idType !== false ? option_idType : "static",
                                    option_idName !== false ? option_idName : subEntry,
                                    option_specialExtraction,
                                    option_addSubMappingToMapping
                                );
                                if (extractedSubEntry[0] !== undefined) {
                                    currentEntry[mappingKey] = currentEntry[mappingKey] || {};
                                    Object.assign(currentEntry[mappingKey], extractedSubEntry[0]);
                                }
                                if (extractedSubEntry[1] !== undefined) {
                                    addMapping(currentMapping, extractedSubEntry[1]);
                                }
                            });

                            // Extract the plain entry, taking special extractions into account
                        } else {
                            currentEntry[mappingKey] = extractedData;
                        }
                    }
                }
            }
            return dataFound;
        });
    }
    // create the return value, consisting of the data and the mapping
    const returnValue = [];
    const entryId = idType === "dynamic" ? dbDataEntry[idName] : idName;
    returnValue.push(Object.keys(currentEntry).length > 0 ? Object.assign({}, { [entryId]: currentEntry }) : undefined);
    returnValue.push(Object.keys(currentMapping).length > 0 ? currentMapping : undefined);
    return returnValue;
}
