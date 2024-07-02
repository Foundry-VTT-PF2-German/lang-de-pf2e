import { flattenObject } from "../helper/src/util/utilities.js";
import { jsonToXliff, updateXliff } from "../helper/src/util/xliff-tool.js";
import { existsSync, readFileSync } from "fs";
import { saveFileWithDirectories } from "../helper/src/util/file-handler.js";

// Path to config file
const CFG_FILE = "./src/xliff/xliff-config.json";

// Get config file
if (!existsSync(CFG_FILE)) {
    console.warn(`Config file ${CFG_FILE} missing.`);
} else {
    const CONFIG = JSON.parse(readFileSync(CFG_FILE, "utf-8"));
    CONFIG.forEach((entry) => {
        console.warn(`Creating/Updating xliff: ${entry.xliffPath} `);
        // Read and flatten source JSON
        const source = flattenObject(JSON.parse(readFileSync(entry.jsonSourcePath, "utf-8")));
        // If target xliff already exists, make a backup and update the file. Otherwise create new xliff
        let target = "";
        if (existsSync(entry.xliffPath)) {
            const xliff = readFileSync(entry.xliffPath, "utf-8");
            if (entry.xliffBackup) {
                saveFileWithDirectories(entry.xliffPath.replace(".xliff", "-backup.xliff"), xliff);
            }
            target = updateXliff(xliff, source);
        } else {
            target = jsonToXliff(source);
        }
        saveFileWithDirectories(entry.xliffPath, target);
    });
}
