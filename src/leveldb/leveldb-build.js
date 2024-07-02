import { existsSync, mkdirSync, readFileSync } from "fs";
import { deleteFolderRecursive } from "../helper/src/util/file-handler.js";
import { createPack } from "../helper/src/util/level-db.js";

// Path to config file
const CFG_FILE = "./src/leveldb/leveldb-config.json";

// Get config file
if (!existsSync(CFG_FILE)) {
    console.warn(`Config file ${CFG_FILE} missing.`);
} else {
    const CONFIG = JSON.parse(readFileSync(CFG_FILE, "utf-8"));
    CONFIG.forEach((entry) => {
        if (existsSync(entry.jsonPath)) {
            // Clear target directory
            deleteFolderRecursive(entry.leveldbDestinationPath);
            mkdirSync(entry.leveldbDestinationPath);

            // Read and parse json, build leveldb at specified location
            const source = JSON.parse(readFileSync(entry.jsonPath, "utf-8"));
            createPack(entry.leveldbDestinationPath, source.packType, source.packData, source.folders);
        } else {
            console.warn(`JSON ${entry.jsonPath} does not exist.`);
        }
    });
}
