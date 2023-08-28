import { readFileSync, writeFileSync } from "fs";
import { resolvePath } from "path-value";
import { getZipContentFromURL } from "../helper/src/util/fileHandler.js";
import { extractFiles, extractPackGroup, extractPackGroupList } from "../helper/src/pack-extractor/pack-extractor.js";
import { sortObject } from "../helper/src/util/utilities.js";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/db-extractor/db-extractor-config.json", "utf-8"));

// Initialize database
const database = {
    dictionary: {},
    actorItemComparison: {},
};

// Fetch assets from current pf2 release and get zip contents
const packs = await getZipContentFromURL(CONFIG.filePaths.zipURL);

// Extract data for mandatory ItemPacks and all other packs
if (resolvePath(CONFIG, "packs.ItemPacks").exists) {
    const packGroupConfig = {
        name: "ItemPacks",
        packConfig: CONFIG.packs.ItemPacks,
        mappings: CONFIG.mappings,
        savePath: CONFIG.filePaths.packs[CONFIG.packs.ItemPacks.savePath],
    };
    extractPackGroup(
        packs.filter((pack) => CONFIG.packs.ItemPacks.packNames.includes(pack.fileName)),
        database,
        packGroupConfig
    );
    const packGroupListConfig = {
        packGroupList: CONFIG.packs.OtherPacks,
        mappings: CONFIG.mappings,
        filePaths: CONFIG.filePaths.packs,
    };
    extractPackGroupList(packs, database, packGroupListConfig);

    // Extract and write i18n files
    extractFiles(
        packs.filter((pack) => CONFIG.i18nFiles.includes(`${pack.fileName}.${pack.fileType}`)),
        CONFIG.filePaths.i18n
    );
} else console.error(`Mandatory Pack Group "ItemPacks" missing in config.`);

// Build the dictionary
if (Object.keys(database.dictionary).length > 0) {
    writeFileSync(
        CONFIG.filePaths.dictionary,
        JSON.stringify(sortObject(database.dictionary, { recursiveSort: true }), null, 2)
    );
}
