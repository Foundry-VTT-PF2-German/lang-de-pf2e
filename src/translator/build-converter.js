import { readFileSync, readdirSync } from "fs";
import { getConfigParameter, readJSONFile } from "../config_helper.js";

export const convertJournals = (journalObject) => {
    const readSystemMap = (filename) => {
        const result = new Map();
        let systemFolder = getConfigParameter("systemPath", "../../systems/pf2e/");
        if (systemFolder.slice(-1) !== "/") {
            systemFolder += "/";
        }
        if (getConfigParameter("systemIsBuilt", true)) {
            const featsOriginalContentLines = readFileSync(systemFolder + "packs/" + filename, "utf-8").split("\n");
            for (const line of featsOriginalContentLines) {
                if (!line.trim()) {
                    continue;
                }
                try {
                    const lineObject = JSON.parse(line);
                    result.set(lineObject.name.toLowerCase().trim(), lineObject);
                } catch {
                    console.error("Could not parse line: " + line);
                }
            }
        } else {
            const folderPath = systemFolder + "packs/data/" + filename;
            for (const child of readdirSync(folderPath)) {
                const featData = readJSONFile(folderPath + "/" + child);
                result.set(featData.name.toLowerCase().trim(), featData);
            }
        }
        return result;
    };
    const featNameToOriginalDataMap = readSystemMap("feats.db");
    const featureMap = readSystemMap("classfeatures.db");

    const featsTranslated = readJSONFile("./translation/de/compendium/pf2e.feats-srd.json");

    const recursiveJournalHandling = (object) => {
        if (Array.isArray(object)) {
            for (const innerObject of object) {
                recursiveJournalHandling(innerObject);
            }
        } else if (typeof object === "object" && object !== null) {
            if (object.text) {
                object.text = object.text.replaceAll(/<([^<>]*)>/g, (match, featsString) => {
                    const startingPoints = featsString.split(";");
                    const feats = [];
                    for (const startingPoint of startingPoints) {
                        if (featNameToOriginalDataMap.has(startingPoint.toLowerCase())) {
                            feats.push(featNameToOriginalDataMap.get(startingPoint.toLowerCase()));
                        }
                    }

                    // If some required feats were not found, something is wrong, possibly a false positive. Just return the original match
                    if (feats.length !== startingPoints.length) {
                        return match;
                    }

                    let foundNewFeats = true;
                    const includedFeatNames = feats.map((feat) => {
                        return feat.name.toLowerCase().trim();
                    });
                    while (foundNewFeats) {
                        foundNewFeats = false;
                        for (const featData of featNameToOriginalDataMap) {
                            // No need to check for already added feats
                            if (includedFeatNames.includes(featData[0])) {
                                continue;
                            }

                            // Do not consider nested Dedications, e.g., Hellknight Armiger -> Hellknight
                            if (featData[0].includes("dedication")) {
                                continue;
                            }

                            // Found a feat with a previously detected feat as prerequisite -> Probably part of the archetype
                            // Sometimes there are additional spaces in the prerequites, due to bad handling within the english localization. We handle these by trimming
                            if (
                                featData[1].system.prerequisites &&
                                featData[1].system.prerequisites.value &&
                                featData[1].system.prerequisites.value.find((prerequisite) => {
                                    return includedFeatNames.includes(prerequisite.value.toLowerCase().trim());
                                })
                            ) {
                                includedFeatNames.push(featData[0]);
                                feats.push(featData[1]);
                                foundNewFeats = true;
                            }
                        }
                    }

                    for (const feat of feats) {
                        feat.translation = featsTranslated.entries[feat.name];
                        feat.translated =
                            feat.system.description.value.replaceAll(/@UUID[^\]]*]/g, "") !==
                            feat.translation.description.replaceAll(/@UUID[^\]]*]/g, "");
                    }

                    feats.sort((feat1, feat2) => {
                        // The original dedication should always remain first
                        if (feat1 === feats[0]) {
                            return -1;
                        }

                        if (feat2 === feats[0]) {
                            return 1;
                        }

                        // Translated first
                        if (feat1.translated !== feat2.translated) {
                            return feat1.translated ? -1 : 1;
                        }

                        // Next, sort by level
                        if (feat1.system.level.value !== feat2.system.level.value) {
                            return feat1.system.level.value - feat2.system.level.value;
                        }

                        // Next, sort by name
                        if (feat1.translation.name.toLowerCase() < feat2.translation.name.toLowerCase()) {
                            return -1;
                        } else if (feat1.translation.name.toLowerCase() > feat2.translation.name.toLowerCase()) {
                            return 1;
                        } else {
                            return 0;
                        }
                    });

                    let result = "";
                    let hasTranslation = true;

                    for (const feat of feats) {
                        if (hasTranslation && !feat.translated) {
                            hasTranslation = false;
                            result += "<h2>Talente ohne Übersetzung</h2>";
                            result +=
                                "<p><em>Die folgenden Talente sind bisher nicht in einer deutschen Veröffentlichung erschienen</em></p><hr>";
                        }
                        result += `<${feat.translated ? "h2" : "h3"}>@UUID[Compendium.pf2e.feats-srd.${feat._id}]{${
                            feat.translation.name
                        }} <span style='float: right'>${feat.translated ? "TALENT" : "FEAT"} ${
                            feat.system.level.value
                        }</span></${feat.translated ? "h2" : "h3"}>`;
                        // Some Dedications have no prerequisites, i.e., Demolitionist
                        if (feat.system.prerequisites && feat.system.prerequisites.value.length > 0) {
                            result += `<p><strong>${
                                feat.translated ? "Voraussetzungen" : "Prerequisites"
                            }</strong> ${feat.system.prerequisites.value
                                .map((prerequisite, index) => {
                                    // If a prerequisite is a class feature, link it
                                    const displayName = feat.translation.prerequisites[index].value;
                                    if (featureMap.has(prerequisite.value)) {
                                        return `@UUID[Compendium.pf2e.classfeatures.${
                                            featureMap.get(prerequisite.value)._id
                                        }]{${displayName}}`;
                                    } else {
                                        return displayName;
                                    }
                                })
                                .join(", ")}</p>`;
                            // If the description includes any parameters with <p><strong>, e.g., trigger, it includes its own horizontal line, otherwise add one below the prerequisites
                            if (!feat.translation.description.startsWith("<p><strong>")) {
                                result += "<hr>\n";
                            }
                        }
                        // If it is an old entry, still containing prerequisites, remove them
                        result += feat.translation.description.replaceAll(
                            /<p><strong>(?:Voraussetzungen|Prerequisites)<\/strong>[^<]*<\/p>/g,
                            ""
                        );
                    }

                    return result;
                });
            } else {
                for (const index in object) {
                    recursiveJournalHandling(object[index]);
                }
            }
        }
    };

    recursiveJournalHandling(journalObject);
};
