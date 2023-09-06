import crowdin from "@crowdin/crowdin-api-client";
import { rmSync, readdirSync, existsSync, mkdirSync, readFileSync, writeFile } from "fs";
import { convertData } from "../helper/src/util/utilities.js";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/crowdin-updater/crowdin-config.json", "utf-8"));

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

sourceFiles.forEach(async (sourceFile, index, arr) => {
    const sourceStrings = await getSourceStrings(CONFIG.projectId, CONFIG.personalToken, sourceFile.data.id);
    arr[index].sourceStrings = sourceStrings;

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

/**
 * Get the project labels for a specified Crowdin project
 *
 * @param {string} projectId            Crowdin project id
 * @param {string} token                Crowdin API access token
 */
function getLabels(projectId, token) {
    const { labelsApi } = new crowdin.default({ token: token });

    return labelsApi.listLabels(projectId, { limit: 500 }).then((labels) => {
        return labels.data;
    });
}

/**
 * Get the source files for a specified crowdin project
 *
 * @param {string} projectId    Crowdin project id
 * @param {string} token        Crowdin API access token
 */
function getSourceFiles(projectId, token) {
    const { sourceFilesApi } = new crowdin.default({ token: token });

    return sourceFilesApi.listProjectFiles(projectId, { limit: 500 }).then(async (files) => {
        return files.data;
    });
}

function getSourceStrings(projectId, token, sourceFile) {
    const { sourceStringsApi } = new crowdin.default({ token: token });
    return new Promise(async (resolve) => {
        let sourceStrings = [];
        let offsetCounter = 0;
        let limit = 500;
        let arrayHasData = true;
        do {
            await sourceStringsApi
                .listProjectStrings(projectId, {
                    fileId: sourceFile,
                    limit: limit,
                    offset: offsetCounter * limit,
                })
                .then((sourceStringData) => {
                    if (sourceStringData.data.length > 0) {
                        sourceStrings = sourceStrings.concat(sourceStringData.data);
                    } else {
                        arrayHasData = false;
                    }
                });
            offsetCounter = offsetCounter + 1;
        } while (arrayHasData);
        resolve(sourceStrings);
    });
}
