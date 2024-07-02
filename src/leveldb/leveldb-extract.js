import { existsSync, readFileSync } from "fs";
import { saveFileWithDirectories } from "../helper/src/util/file-handler.js";
import { getJSONfromPack } from "../helper/src/util/level-db.js";

// Path to config file
const CFG_FILE = "./src/leveldb/leveldb-config.json";

// Get config file
if (!existsSync(CFG_FILE)) {
    console.warn(`Config file ${CFG_FILE} missing.`);
} else {
    const CONFIG = JSON.parse(readFileSync(CFG_FILE, "utf-8"));
    CONFIG.forEach(async (entry) => {
        if (existsSync(entry.leveldbSourcePath)) {
            // Read leveldb and extract data
            const source = await getJSONfromPack(entry.leveldbSourcePath, entry.packType);
            // Save data to specified path
            saveFileWithDirectories(entry.jsonPath, JSON.stringify(source, null, 4));
        } else {
            console.warn(`Database path ${entry.leveldbSourcePath} does not exist.`);
        }
    });
}
