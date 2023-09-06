import { rmSync, readdirSync, existsSync, mkdirSync, readFileSync, writeFile } from "fs";
import { convertData } from "../helper/src/util/utilities.js";
import { getLabels, getSourceFiles, getSourceStrings } from "../helper/src/util/crowdin-manager.js";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/crowdin-manager/crowdin-config.json", "utf-8"));

// Create database directory if not already existing
if (!existsSync(CONFIG.databasePath)) {
    mkdirSync(CONFIG.databasePath);
}

// Clean database directory
for (const path of readdirSync(`${CONFIG.databasePath}/crowdin-backup`)) {
    rmSync(CONFIG.databasePath + "/crowdin-backup/" + path, { recursive: true });
}
for (const path of readdirSync(`${CONFIG.databasePath}/csv-overviews`)) {
    rmSync(CONFIG.databasePath + "/csv-overviews/" + path, { recursive: true });
}
for (const path of readdirSync(CONFIG.databasePath)) {
    rmSync(CONFIG.databasePath + "/" + path, { recursive: true });
}

// Create neccessary subdirectories
mkdirSync(`${CONFIG.databasePath}/crowdin-backup`);
mkdirSync(`${CONFIG.databasePath}/crowdin-backup/compendium`);
mkdirSync(`${CONFIG.databasePath}/csv-overviews`);
mkdirSync(`${CONFIG.databasePath}/csv-overviews/compendium`);

// Get the project labels
const labels = await getLabels(CONFIG.projectId, CONFIG.personalToken);

writeFile(`${CONFIG.databasePath}/crowdin-backup/labels.json`, convertData(labels, "json"), (error) => {
    if (error) console.error(error);
});
writeFile(`${CONFIG.databasePath}/csv-overviews/labels.csv`, convertData(labels, "csv", ["id", "title"]), (error) => {
    if (error) console.error(error);
});

// Get source files and source strings
const sourceFiles = await getSourceFiles(CONFIG.projectId, CONFIG.personalToken);
writeFile(`${CONFIG.databasePath}/crowdin-backup/sourceFiles.json`, convertData(sourceFiles, "json"), (error) => {
    if (error) console.error(error);
});
writeFile(
    `${CONFIG.databasePath}/csv-overviews/sourceFiles.csv`,
    convertData(sourceFiles, "csv", ["id", "name", "path"]),
    (error) => {
        if (error) console.error(error);
    }
);

sourceFiles.forEach(async (sourceFile) => {
    const sourceStrings = await getSourceStrings(CONFIG.projectId, CONFIG.personalToken, sourceFile.data.id);

    writeFile(
        `${CONFIG.databasePath}/crowdin-backup/compendium/${sourceFile.data.name}`,
        convertData(sourceStrings, "json"),
        (error) => {
            if (error) console.error(error);
        }
    );
    writeFile(
        `${CONFIG.databasePath}/csv-overviews/compendium/${sourceFile.data.name.replace(".json", ".csv")}`,
        convertData(sourceStrings, "csv", ["id", "fileId", "identifier", "labelIds"]),
        (error) => {
            if (error) console.error(error);
        }
    );
});
