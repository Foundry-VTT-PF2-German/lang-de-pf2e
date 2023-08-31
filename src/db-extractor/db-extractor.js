import { readFileSync, writeFileSync } from "fs";
import { getZipContentFromURL, writeFiles } from "../helper/src/util/fileHandler.js";
import { replaceProperties } from "../helper/src/util/utilities.js";
import { extractPackGroupList } from "../helper/src/pack-extractor/pack-extractor.js";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/db-extractor/db-extractor-config.json", "utf-8"));

// Replace linked mappings and savePaths with actual data
replaceProperties(CONFIG.mappings, ["subMapping"], CONFIG.mappings);
replaceProperties(CONFIG.packs, ["mapping"], CONFIG.mappings);
replaceProperties(CONFIG.packs, ["savePath"], CONFIG.filePaths.packs);

// Fetch assets from current pf2 release and get zip contents
const packs = await getZipContentFromURL(CONFIG.filePaths.zipURL);

// Extract data for all configured packs
const extractedPackGroupList = extractPackGroupList(packs, CONFIG.packs);

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
writeFiles(
    packs.filter((pack) => CONFIG.i18nFiles.includes(`${pack.fileName}.${pack.fileType}`)),
    CONFIG.filePaths.i18n,
    "i8n files"
);
