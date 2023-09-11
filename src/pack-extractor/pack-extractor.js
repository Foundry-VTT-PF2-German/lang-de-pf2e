import { readFileSync, writeFileSync } from "fs";
import { getZipContentFromURL, writeFilesFromBlob } from "../helper/src/util/fileHandler.js";
import { replaceProperties } from "../helper/src/util/utilities.js";
import { buildItemDatabase, extractPackGroupList } from "../helper/src/pack-extractor/pack-extractor.js";
import { PF2_DEFAULT_MAPPING } from "../helper/src/pack-extractor/constants.js";

// Read config file
const configFile = JSON.parse(readFileSync("./src/pack-extractor/pack-extractor-config.json", "utf-8"));

const CONFIG = {...configFile, mappings: PF2_DEFAULT_MAPPING}

// Replace linked mappings and savePaths with actual data
replaceProperties(CONFIG.mappings, ["subMapping"], CONFIG.mappings);
replaceProperties(CONFIG.packs, ["mapping"], CONFIG.mappings);
replaceProperties(CONFIG.packs, ["savePath"], CONFIG.filePaths.packs);

// Fetch assets from current pf2 release and get zip contents
const packs = await getZipContentFromURL(CONFIG.filePaths.zipURL);

// Build item database in order to compare actor items with their comdendium entries
const itemDatabase = buildItemDatabase(packs, CONFIG.itemDatabase);

// Extract data for all configured packs
const extractedPackGroupList = extractPackGroupList(packs, CONFIG.packs, itemDatabase);

// Write extracted packs to target directories
Object.keys(extractedPackGroupList.extractedPackGroups).forEach((packGroup) => {
    const path = CONFIG.packs[packGroup].savePath;
    Object.keys(extractedPackGroupList.extractedPackGroups[packGroup]).forEach((pack) => {
        writeFileSync(
            `${path}/${pack}.json`,
            JSON.stringify(extractedPackGroupList.extractedPackGroups[packGroup][pack], null, 2)
        );
    });
});

// Write dictionary to target directory
writeFileSync(CONFIG.filePaths.dictionary, JSON.stringify(extractedPackGroupList.packGroupListDictionary, null, 2));

// Extract and write i18n files
writeFilesFromBlob(
    packs.filter((pack) => CONFIG.i18nFiles.includes(`${pack.fileName}.${pack.fileType}`)),
    CONFIG.filePaths.i18n,
    "i8n files"
);
