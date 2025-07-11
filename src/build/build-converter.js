import { readdirSync } from "fs";
import { getConfigParameter, readJSONFile } from "../helper/src/build/config-helper.js";
import { sluggify } from "../helper/src/util/utilities.js";
import { resolvePath } from "path-value";

const BLACKLIST_PREFIX = "block:";

const attributes = {
    str: "Stärke",
    con: "Konstitution",
    dex: "Geschicklichkeit",
    int: "Intelligenz",
    wis: "Weisheit",
    cha: "Charisma",
};

const skills = {
    acrobatics: "Akrobatik",
    arcana: "Arkane Künste",
    athletics: "Athletik",
    crafting: "Handwerkskunst",
    deception: "Täuschung",
    diplomacy: "Diplomatie",
    intimidation: "Einschüchtern",
    medicine: "Heilkunde",
    nature: "Naturkunde",
    occultism: "Okkultismus",
    performance: "Darbietung",
    religion: "Religionskunde",
    society: "Gesellschaftskunde",
    stealth: "Heimlichkeit",
    survival: "Überlebenskunst",
    thievery: "Diebeskunst",
};

const readSystemMap = (filename) => {
    const result = new Map();
    let systemFolder = getConfigParameter("systemPath", null);
    if (systemFolder == null) {
        throw "systemPath must be set for build";
    }
    if (systemFolder.slice(-1) !== "/") {
        systemFolder += "/";
    }
    const folderPath = systemFolder + "packs/" + filename;
    for (const child of readdirSync(folderPath)) {
        if (child.startsWith("_")) {
            continue;
        }
        if (child.includes(".json")) {
            const featData = readJSONFile(folderPath + "/" + child);
            result.set(featData.name.toLowerCase().trim(), featData);
            continue;
        }
        for (const grandchild of readdirSync(folderPath + "/" + child)) {
            if (grandchild.includes(".json")) {
                const featData = readJSONFile(folderPath + "/" + child + "/" + grandchild);
                result.set(featData.name.toLowerCase().trim(), featData);
                continue;
            }
            for (const grandgrandchild of readdirSync(folderPath + "/" + child + "/" + grandchild)) {
                if (grandgrandchild.includes(".json")) {
                    const featData = readJSONFile(folderPath + "/" + child + "/" + grandchild + "/" + grandgrandchild);
                    result.set(featData.name.toLowerCase().trim(), featData);
                    continue;
                }

                for (const grandgrandgrandchild of readdirSync(
                    folderPath + "/" + child + "/" + grandchild + "/" + grandgrandchild
                )) {
                    const featData = readJSONFile(
                        folderPath + "/" + child + "/" + grandchild + "/" + grandgrandchild + "/" + grandgrandgrandchild
                    );
                    result.set(featData.name.toLowerCase().trim(), featData);
                    continue;
                }
            }
        }
    }
    return result;
};

export const convertJournals = (journalObject) => {
    const featNameToOriginalDataMap = readSystemMap("feats");
    const featureMap = readSystemMap("classfeatures");

    const featsTranslated = readJSONFile("./translation/de/compendium/pf2e.feats-srd.json");

    // Build list of domains
    const deitiesMap = readSystemMap("deities");
    const domains = {};
    for (const [deityKey, deityData] of deitiesMap) {
        for (const type of ["primary", "alternate"]) {
            if (resolvePath(deityData, `system.domains.${type}`).exists) {
                for (const deityDomain of deityData.system.domains[type]) {
                    // Start Sonderlogik alte Domänen
                    let domainName = deityDomain;
                    if (domainName === "void") {
                        domainName = "nothingness";
                    }
                    if (domainName === "wyrmkin") {
                        domainName = "dragon";
                    }
                    if (domainName === "delirium") {
                        domainName = "disorientation";
                    }
                    // Ende Sonderlogik alte Domänen
                    domains[domainName] = domains[domainName] || {
                        deity: { primary: [], alternate: [] },
                        pantheon: { primary: [], alternate: [] },
                        covenant: { primary: [], alternate: [] },
                    };
                    domains[domainName][deityData.system.category][type].push(
                        `@UUID[Compendium.pf2e.deities.Item.${deityData._id}]`
                    );
                }
            }
        }
    }
    //console.warn(domains);

    const recursiveJournalHandling = (object) => {
        if (Array.isArray(object)) {
            for (const innerObject of object) {
                recursiveJournalHandling(innerObject);
            }
        } else if (typeof object === "object" && object !== null) {
            if (object.text) {
                // Domain conversion
                object.text = object.text.replaceAll(/<([^<> ]+) domain>/g, (match, domName) => {
                    let result = "";
                    if (domains[domName]) {
                        result += "<hr />";
                        // Add deities
                        for (const type of ["deity", "covenant", "pantheon"]) {
                            if (
                                domains[domName][type].primary.length > 0 ||
                                domains[domName][type].alternate.length > 0
                            ) {
                                if (type === "deity") {
                                    result += `<h2>Gottheiten</h2>\n`;
                                } else if (type === "covenant") {
                                    result += `<h2>Bündnisse</h2>\n`;
                                } else {
                                    result += `<h2>Pantheons</h2>\n`;
                                }
                            }
                            if (domains[domName][type].primary.length > 0) {
                                result += `<p>${domains[domName][type].primary.join(", ")}</p>\n`;
                            }
                            if (domains[domName][type].alternate.length > 0) {
                                result += `<p><em>Alternative Domänen</em></p>\n`;
                                result += `<p>${domains[domName][type].alternate.join(", ")}</p>\n`;
                            }
                        }
                    }
                    return result;
                });

                // Archetype conversion
                object.text = object.text.replaceAll(/<([^<>]*)>/g, (match, featsString) => {
                    const startingPoints = featsString.split(";");
                    const feats = [];
                    const blockedFeatNames = [];
                    for (const startingPoint of startingPoints) {
                        if (startingPoint.startsWith(BLACKLIST_PREFIX)) {
                            blockedFeatNames.push(startingPoint.substring(BLACKLIST_PREFIX.length).toLowerCase());
                        }
                        if (featNameToOriginalDataMap.has(startingPoint.toLowerCase())) {
                            feats.push(featNameToOriginalDataMap.get(startingPoint.toLowerCase()));
                        }
                    }

                    // If some required feats were not found, something is wrong, possibly a false positive. Just return the original match
                    if (feats.length !== startingPoints.length - blockedFeatNames.length) {
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

                            // If a feat was blacklisted, do not continue
                            if (blockedFeatNames.includes(featData[0])) {
                                continue;
                            }

                            // Do not consider nested Dedications, e.g., Hellknight Armiger -> Hellknight
                            if (featData[0].includes("dedication")) {
                                continue;
                            }

                            // Ignore feats that don't exist in the de module translation file at all
                            if (!featsTranslated.entries[featData[1].name]) {
                                continue;
                            }

                            // Found a feat with a previously detected feat as prerequisite -> Probably part of the archetype
                            // Sometimes there are additional spaces in the prerequites, due to bad handling within the english localization. We handle these by trimming
                            // Handle combined prerequisites, such as "Celebrity Dedication of Brawler Dedication, Master in Intimidation"
                            if (
                                featData[1].system.prerequisites &&
                                featData[1].system.prerequisites.value &&
                                featData[1].system.prerequisites.value.find((prerequisite) => {
                                    let included = false;
                                    for (const splittedPrerequisite of prerequisite.value
                                        .toLowerCase()
                                        .trim()
                                        .split(" or ")) {
                                        for (const splittedPre of splittedPrerequisite.split(", ")) {
                                            if (includedFeatNames.includes(splittedPre)) {
                                                included = true;
                                            }
                                        }
                                    }
                                    return included;
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
                        feat.translated = false;
                        if (feat.translation) {
                            feat.translated =
                                feat.system.description.value.replaceAll(/@UUID[^\]]*]({[^}]*})?/g, "") !==
                                feat.translation.description.replaceAll(/@UUID[^\]]*]({[^}]*})?/g, "");
                        }
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
                        result += `<${feat.translated ? "h2" : "h3"}>@UUID[Compendium.pf2e.feats-srd.Item.${
                            feat._id
                        }]{${feat.translation.name}} <span style='float: right'>${
                            feat.translated ? "TALENT" : "FEAT"
                        } ${feat.system.level.value}</span></${feat.translated ? "h2" : "h3"}>`;
                        // Some Dedications have no prerequisites, i.e., Demolitionist
                        if (feat.system.prerequisites && feat.system.prerequisites.value.length > 0) {
                            result += `<p><strong>${
                                feat.translated ? "Voraussetzungen" : "Prerequisites"
                            }</strong> ${feat.system.prerequisites.value
                                .map((prerequisite, index) => {
                                    // If a prerequisite is a class feature, link it
                                    // Take the english text if array length differs from translation array due to missing data sync
                                    let displayName = prerequisite.value;
                                    if (feat.translation.prerequisites && feat.translation.prerequisites[index]) {
                                        displayName = feat.translation.prerequisites[index]
                                            ? feat.translation.prerequisites[index].value
                                            : feat.system.prerequisites.value[index].value;
                                    }
                                    if (featureMap.has(prerequisite.value)) {
                                        return `@UUID[Compendium.pf2e.classfeatures.Item.${
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

export const convertDeities = (deitiesTranslated) => {
    let textAdditions = {};
    let textTitle = "";
    const i18nFile = readJSONFile("./translation/de/de.json");
    const weapons = i18nFile.PF2E.Weapon.Base;
    const domains = i18nFile.PF2E.Item.Deity.Domain;
    //Sonderlogik alte Domänen
    domains.Nothingness = domains.Void;
    domains.Dragon = domains.Wyrmkin;
    domains.Disorientation = domains.Delirium;
    //Ende Sonderlogik alte Domänen
    const deitiesMap = readSystemMap("deities");
    const equipmentMap = new Map([...readSystemMap("equipment")].map(([key, value]) => [sluggify(key), value]));
    const journalsMap = readSystemMap("journals");
    const spellsMap = readSystemMap("spells");
    const weaponsMap = new Map(
        Object.keys(weapons)
            .map((weapon) => {
                if (equipmentMap.has(weapon)) {
                    const weaponPage = equipmentMap.get(weapon);
                    const link = `@UUID[Compendium.pf2e.equipment-srd.Item.${weaponPage._id}]`;
                    return [weapons[weapon], { name: weapon, label: link }];
                }
                return [weapons[weapon], { name: weapon, label: weapons[weapon] }];
            })
            .sort()
    );

    const domainJournalId = journalsMap.get("domains")._id;
    const domainsMap = new Map(
        Object.keys(domains)
            .map((domain) => {
                const journalPage = journalsMap
                    .get("domains")
                    .pages.filter((dom) => dom.name.replace(" Domain", "") === domain);
                //Sonderlogik alte Domänen
                let domName = domain.toLowerCase();
                if (domName === "nothingness") {
                    domName = "void";
                }
                if (domName === "dragon") {
                    domName = "wyrmkin";
                }
                if (domName === "disorientation") {
                    domName = "delirium";
                }
                //Ende Sonderlogik alte Domänen

                if (journalPage.length === 1) {
                    const link = `@UUID[Compendium.pf2e.journals.JournalEntry.${domainJournalId}.JournalEntryPage.${journalPage[0]._id}]`;
                    return [domains[domain].Label, { name: domName, link: link }];
                }
                return [domains[domain].Label, { name: domName }];
            })
            .sort()
    );

    // Get the Ids for all spells in the compendium
    const spellIds = {};
    spellsMap.forEach(
        (spell) =>
            (spellIds[`Compendium.pf2e.spells-srd.Item.${spell.name}`] = `Compendium.pf2e.spells-srd.Item.${spell._id}`)
    );
    // Loop through translated deity description entries and add details section
    Object.keys(deitiesTranslated.entries).forEach((deityName) => {
        if (!deitiesMap.has(deityName.toLowerCase())) {
            console.warn(`Keine Daten zu ${deityName} gefunden.`)
            return;
        }
        const deityAttributes = deitiesMap.get(deityName.toLowerCase()).system.attribute;
        const deityDomains = deitiesMap.get(deityName.toLowerCase()).system.domains;
        const deityFont = deitiesMap.get(deityName.toLowerCase()).system.font;
        const deitySanctification = deitiesMap.get(deityName.toLowerCase()).system.sanctification;
        const deitySkills = deitiesMap.get(deityName.toLowerCase()).system.skill;
        const deitySpells = deitiesMap.get(deityName.toLowerCase()).system.spells;
        const deityWeapons = deitiesMap.get(deityName.toLowerCase()).system.weapons;

        // Add divine attributes
        if (deityAttributes.length > 0) {
            textTitle = "Göttliches Attribut";
            textAdditions[textTitle] = [];
            deityAttributes.forEach((deityAttribute) => {
                textAdditions[textTitle].push(attributes[deityAttribute]);
            });
            textAdditions[textTitle].sort();
        }

        // Add granted spells
        if (Object.keys(deitySpells).length > 0) {
            textTitle = "Klerikerzauber";
            textAdditions[textTitle] = [];
            Object.keys(deitySpells).forEach((deitySpell) => {
                if (Object.keys(spellIds).includes(deitySpells[deitySpell])) {
                    textAdditions[textTitle].push(`${deitySpell}. @UUID[${spellIds[deitySpells[deitySpell]]}]`);
                } else {
                    console.warn(`Spell @UUID[${deitySpells[deitySpell]}] missing in ${deityName}`);
                }
            });
        }

        // Add divine font
        const divineFont = [];
        if (deityFont.includes("heal")) {
            divineFont.push("Heilung");
        }
        if (deityFont.includes("harm")) {
            divineFont.push("Leid");
        }
        textTitle = "Göttlicher Quell";
        textAdditions[textTitle] = [divineFont.join(" oder ")];

        // Add divine sanctification
        textTitle = "Göttliche Weihe";
        if (deitySanctification) {
            const sanctificationOption = [];
            if (deitySanctification.what.includes("holy")) {
                sanctificationOption.push("Heilig");
            }
            if (deitySanctification.what.includes("unholy")) {
                sanctificationOption.push("Unheilig");
            }

            const multiOptions = sanctificationOption.length === 1 ? "" : " zwischen ";
            if (deitySanctification.modal === "can") {
                textAdditions[textTitle] = [`Kann ${multiOptions}${sanctificationOption.join(" und ")} wählen`];
            } else {
                textAdditions[textTitle] = [`Muss ${sanctificationOption.join(" oder ")} wählen`];
            }
        } else {
            textAdditions[textTitle] = ["Keine"];
        }
        // Add divine skills
        if (deitySkills.length > 0) {
            textTitle = "Göttliche Fertigkeit";
            textAdditions[textTitle] = [];
            deitySkills.forEach((deitySkill) => {
                textAdditions[textTitle].push(skills[deitySkill]);
            });
            textAdditions[textTitle].sort();
        }

        // Add domains
        if (deityDomains.primary.length > 0) {
            textTitle = "Domänen";
            textAdditions[textTitle] = [];
            domainsMap.forEach((domain) => {
                if (deityDomains.primary.includes(domain.name)) {
                    if (domain.link) {
                        textAdditions[textTitle].push(domain.link);
                    } else {
                        console.warn(`Domain ${domain.name} missing!`);
                    }
                }
            });
        }

        // Add alternate domains
        if (deityDomains.alternate.length > 0) {
            textTitle = "Alternative Domänen";
            textAdditions[textTitle] = [];
            domainsMap.forEach((domain) => {
                if (deityDomains.alternate.includes(domain.name)) {
                    if (domain.link) {
                        textAdditions[textTitle].push(domain.link);
                    } else {
                        console.warn(`Domain ${domain.name} missing!`);
                    }
                }
            });
        }

        // Add favored weapons
        if (deityWeapons.length > 0) {
            textTitle = "Bevorzugte Waffe";
            textAdditions[textTitle] = [];
            weaponsMap.forEach((weapon) => {
                if (deityWeapons.includes(weapon.name)) {
                    textAdditions[textTitle].push(weapon.label);
                }
            });
        }

        // Create the text addition
        let textAddition = "";
        if (Object.keys(textAdditions).length > 0) {
            textAddition += "<h2>Anhängervorteile</h2>";

            Object.keys(textAdditions).forEach((textComponent) => {
                const textDetail = textAdditions[textComponent].join(", ");
                textAddition += `<p><strong>${textComponent}</strong> ${textDetail}</p>`;
            });
        }

        // Add text addition after general description and before avatar info, if available
        const descriptionPartials = deitiesTranslated.entries[deityName].description.split("<h2>Avatar</h2>");
        descriptionPartials[0] += textAddition;
        deitiesTranslated.entries[deityName].description = descriptionPartials.join("<h2>Avatar</h2>");
    });
    return deitiesTranslated;
};
