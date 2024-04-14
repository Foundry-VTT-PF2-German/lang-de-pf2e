import { convertDeities, convertJournals } from "./build-converter.js";
import { build } from "../helper/src/build/build.js";

const PATHS = ["module.json", "src/babele-register.js", "src/translator", "static", "translation/de", "LICENSE"];

let targetFolder = process.argv[2];

build(PATHS, targetFolder, {
    "translation/de/compendium/pf2e.journals.json": convertJournals,
    "translation/de/compendium/pf2e.deities.json": convertDeities,
});
