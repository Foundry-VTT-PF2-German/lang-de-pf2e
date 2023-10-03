import { unflattenObject } from "../helper/src/util/utilities.js";
import { xliffToJson } from "../helper/src/util/xliff-tool.js";
import { existsSync, readFileSync } from "fs";
import { saveFileWithDirectories } from "../helper/src/util/fileHandler.js";

// Path to config file
const CFG_FILE = "./src/xliff/xliff-config.json";

// Get config file
if (!existsSync(CFG_FILE)) {
    console.warn(`Config file ${CFG_FILE} missing.`);
} else {
    const CONFIG = JSON.parse(readFileSync(CFG_FILE, "utf-8"));
    CONFIG.forEach((entry) => {
        // Read xliff, extract and parse JSON, and unflatten it
        const source = unflattenObject(xliffToJson(readFileSync(entry.xliffPath, "utf-8")));

        // Save JSON to destination path
        saveFileWithDirectories(entry.jsonDestinationPath, JSON.stringify(source, null, 4));
    });
}
