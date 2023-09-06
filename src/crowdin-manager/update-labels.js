import crowdin from "@crowdin/crowdin-api-client";
import { rmSync, readdirSync, existsSync, mkdirSync, readFileSync, writeFile } from "fs";

// Read config file
const CONFIG = JSON.parse(readFileSync("crowdin-config.json", "utf-8"));
const UPDATE = JSON.parse(readFileSync("updateLabels.json", "utf-8"));

// initialization of crowdin client
const { labelsApi } = new crowdin.default({
    token: CONFIG.personalToken,
});

// Get the update info
for (let i = 0; i < UPDATE.stringIds.length; i += 500) {
    const chunk = UPDATE.stringIds.slice(i, i + 500);
    labelsApi.assignLabelToString(CONFIG.projectId, UPDATE.labelId, { stringIds: chunk });
}
