import crowdin from "@crowdin/crowdin-api-client";
import { rmSync, readdirSync, existsSync, mkdirSync, readFileSync, writeFile } from "fs";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/crowdin-updater/crowdin-config.json", "utf-8"));
const databasePath = "./src/crowdin-updater/database";

if (!existsSync(databasePath)) {
    mkdirSync(databasePath);
}
for (const path of readdirSync(databasePath)) {
    rmSync(databasePath + "/" + path, { recursive: true });
}
mkdirSync(`${databasePath}/compendium`);

// initialization of crowdin client
const { labelsApi, sourceFilesApi, sourceStringsApi } = new crowdin.default({
    token: CONFIG.personalToken,
});

// Get the project labels
labelsApi
    .listLabels(CONFIG.projectId, { limit: 500 })
    .then((labels) =>
        writeFile(`${databasePath}/labels.csv`, convertToCSV(labels.data.map(selectProps("id", "title"))), (error) => {
            if (error) throw error;
        })
    )
    .catch((error) => console.error(error));

// Get source files and source strings

sourceFilesApi
    .listProjectFiles(CONFIG.projectId, { limit: 500 })
    .then(async (files) => {
        const sourceFiles = files.data.map(selectProps("id", "name", "path"));
        writeFile(`${databasePath}/sourceFiles.csv`, convertToCSV(sourceFiles), (error) => {
            if (error) throw error;
        });
        await sourceFiles.forEach(async (sourceFile) => {
            let sourceStrings = [];
            let offsetCounter = 0;
            let limit = 500;
            let arrayHasData = true;

            do {
                await sourceStringsApi
                    .listProjectStrings(CONFIG.projectId, {
                        fileId: sourceFile.id,
                        limit: limit,
                        offset: offsetCounter * limit,
                    })
                    .then((sourceStringData) => {
                        if (sourceStringData.data.length > 0) {
                            sourceStrings = sourceStrings.concat(
                                sourceStringData.data.map(selectProps("id", "fileId", "identifier", "labelIds"))
                            );
                        } else {
                            arrayHasData = false;
                            if (sourceStrings.length > 0) {
                                writeFile(
                                    databasePath.concat("/compendium/", sourceFile.name.replace(".json", ".csv")),
                                    convertToCSV(sourceStrings),
                                    (error) => {
                                        if (error) throw error;
                                    }
                                );
                            }
                        }
                    })
                    .catch((error) => console.error(error));
                offsetCounter = offsetCounter + 1;
            } while (arrayHasData);
        });
    })
    .catch((error) => console.error(error));

// Get specified properties from an object
function selectProps(...props) {
    return function (obj) {
        const newObj = {};
        props.forEach((name) => {
            newObj[name] = obj.data[name];
        });

        return newObj;
    };
}

// Convert array of objects to csv
function convertToCSV(arr) {
    const array = [Object.keys(arr[0])].concat(arr);

    return array
        .map((it) => {
            return Object.values(it).join("|");
        })
        .join("\n");
}
