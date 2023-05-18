
import { readFileSync, readdirSync } from 'fs';
import { getConfigParameter, readJSONFile } from './config_helper.js';

const startingPoint = process.argv[2];
if (startingPoint === undefined) {
    throw new Error('Bitte gebe den englischen Namen des Zugangs als ersten Parameter an, z.B. node generate_archetype_journal.js "Zombie Dedication" - Anführungsstriche sind bei Namen mit Leerzeichen erforderlich');
}

const featNameToOriginalDataMap = new Map();
{
    let systemFolder = getConfigParameter('systemPath', '../../systems/pf2e/');
    if (systemFolder.slice(-1) !== '/') {
        systemFolder += '/';
    }
    if (getConfigParameter('systemIsBuilt', true)) {
        const featsOriginalContentLines = readFileSync(systemFolder + 'packs/feats.db', 'utf-8').split('\n');
        for (const line of featsOriginalContentLines) {
            if (!line.trim()) {
                continue;
            }
            try {
                const lineObject = JSON.parse(line);
                featNameToOriginalDataMap.set(lineObject.name, lineObject);
            }
            catch {
                console.error('Could not parse line: ' + line);
            }
        }
    }
    else {
        const folderPath = systemFolder + 'packs/data/feats.db';
        for (const child of readdirSync(folderPath)) {
            const featData = readJSONFile(folderPath + '/' + child);
            featNameToOriginalDataMap.set(featData.name, featData);
        }
    }
}

if (!featNameToOriginalDataMap.has(startingPoint)) {
    throw new Error(`Der angegebene Zugang "${startingPoint}" wurde nicht gefunden. Bitte gebe den englischen Namen des Zugangs als ersten Parameter an, z.B. node generate_archetype_journal.js "Zombie Dedication" - Anführungsstriche sind bei Namen mit Leerzeichen erforderlich`);
}

const includedFeatNames = [startingPoint];
let foundNewFeats = true;
while (foundNewFeats) {
    foundNewFeats = false;
    for (const featData of featNameToOriginalDataMap) {
        // No need to check for already added feats
        if (includedFeatNames.includes(featData[0].trim())) {
            continue;
        }

        // Found a feat with a previously detected feat as prerequisite -> Probably part of the archetype
        // Sometimes there are additional spaces in the prerequites, due to bad handling within the english localization. We handle these by trimming
        if (featData[1].system.prerequisites && featData[1].system.prerequisites.value && featData[1].system.prerequisites.value.find((prerequisite) => {
            return includedFeatNames.includes(prerequisite.value.trim());
        })) {
            includedFeatNames.push(featData[0].trim());
            foundNewFeats = true;
        }
    }
}

const featsTranslated = readJSONFile('./translation/de/compendium/pf2e.feats-srd.json');

const feats = [];
for (const includedFeatName of includedFeatNames) {
    const originalData = featNameToOriginalDataMap.get(includedFeatName);
    const translatedData = featsTranslated.entries[includedFeatName];
    const level = originalData.system.level.value;
    let featText = `<h2>@UUID[Compendium.pf2e.feats-srd.${originalData._id}]{${translatedData.name}} <span style="float: right">TALENT ${level}</span></h2>\n`;
    // Some Dedications have no prerequisites, i.e., Demolitionist
    if (translatedData.prerequisites) {
        featText += `<p><strong>Voraussetzungen</strong> ${translatedData.prerequisites.map((prerequisite) => { return prerequisite.value }).join(', ')}</p>\n`;
        // If the description includes any parameters with <p><strong>, e.g., trigger, it includes its own horizontal line, otherwise add one below the prerequisites
        if (!translatedData.description.startsWith('<p><strong>')) {
            featText += '<hr>\n';
        }
    }
    featText += translatedData.description;
    feats.push({
        name: translatedData.name,
        level: level,
        text: featText
    });
}

feats.sort((feat1, feat2) => {
    if (feat1.level != feat2.level) {
        return feat1.level - feat2.level;
    }

    if (feat1.name.toLowerCase() < feat2.name.toLowerCase()) {
        return -1;
    }
    else if (feat1.name.toLowerCase() > feat2.name.toLowerCase()) {
        return 1;
    }
    else {
        return 0;
    }
});

const archetypeText = '<p>Hier Beschreibungstext einfügen + ggfs. Weitere Talente + ggfs. zusätzliche Regelelemente</p>\n' + feats.map((feat) => { return feat.text; }).join('\n');

console.log(archetypeText);