import { readdirSync, readFileSync,writeFileSync } from "fs";
import { convertData } from "../helper/src/util/utilities.js";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/crowdin-manager/crowdin-config.json", "utf-8"));

const sourceFiles = readdirSync(`${CONFIG.databasePath}/crowdin-backup/compendium`);

let unlabeledStrings = "";
sourceFiles.forEach((sourceFile) => {
    const fileData = JSON.parse(
        readFileSync(`${CONFIG.databasePath}/crowdin-backup/compendium/${sourceFile}`, "utf-8")
    );

    const unlabeledFileStrings = fileData.filter((entry) => entry.labelIds.length === 0);
    if (unlabeledFileStrings.length > 0) {
        unlabeledStrings = unlabeledStrings.concat(convertData(unlabeledFileStrings, "csv", ["fileId", "identifier"]));
    }
});
writeFileSync(`${CONFIG.databasePath}/csv-overviews/unlabeledStrings.csv`, unlabeledStrings);
