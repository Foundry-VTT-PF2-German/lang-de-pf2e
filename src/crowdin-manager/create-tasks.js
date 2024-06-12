import crowdin from "@crowdin/crowdin-api-client";
import { readFileSync } from "fs";

// Read config file
const CONFIG = JSON.parse(readFileSync("./src/crowdin-manager/crowdin-config.json", "utf-8"));

const { tasksApi } = new crowdin.default({ token: CONFIG.personalToken });

// Define labels that are currently localized
const localizedLabels = [
    1, 5, 7, 9, 11, 19, 21, 23, 31, 33, 35, 37, 39, 43, 47, 49, 51, 53, 55, 57, 59, 61, 63, 67, 69, 71, 73, 75, 77, 79,
    81, 83, 85, 87, 91, 93, 95, 97, 99, 101, 103, 105, 107, 109, 111, 113, 115, 119, 121, 125, 127, 129, 133, 135, 137,
    139, 142, 144,
];

const labels = JSON.parse(readFileSync(`${CONFIG.databasePath}/crowdin-backup/labels.json`, "utf-8"));
const sourceFiles = JSON.parse(readFileSync(`${CONFIG.databasePath}/crowdin-backup/sourceFiles.json`, "utf-8")).map(
    (file) => file.id
);

localizedLabels.forEach(async (label) => {
    try {
        const response = await tasksApi.addTask(CONFIG.projectId, {
            title: labels.find((entry) => entry.id === label).title,
            type: 0,
            fileIds: sourceFiles,
            languageId: "de",
            labelIds: [label],
        });
    } catch (e) {}
});
