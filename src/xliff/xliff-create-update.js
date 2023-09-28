import { flattenObject } from "../helper/src/util/utilities.js";
import { jsonToXliff, updateXliff } from "../helper/src/util/xliff-tool.js";
import { existsSync, readFileSync } from "fs";
import { saveFileWithDirectories } from "../helper/src/util/fileHandler.js";

// Get config file
const CONFIG = JSON.parse(readFileSync("./src/xliff/xliff-config.json", "utf-8"));

CONFIG.forEach((entry) => {
    // Read and flatten source JSON
    const source = flattenObject(JSON.parse(readFileSync(entry.jsonSourcePath, "utf-8")));
    // If target xliff already exists, make a backup and update the file. Otherwise create new xliff
    let target = "";
    if (existsSync(entry.xliffPath)) {
        const xliff = readFileSync(entry.xliffPath, "utf-8");
        saveFileWithDirectories(entry.xliffPath.replace(".xliff", "-sicherung.xliff"), xliff);
        target = updateXliff(xliff, source);
    } else {
        target = jsonToXliff(source);
    }
    saveFileWithDirectories(entry.xliffPath, target);
});
