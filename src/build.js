import { convertJournals } from "./translator/build-converter.js";
import { build } from "./helper/build/build.js";

const PATHS = [
    "module.json",
    "style.css",
    "NodestoCapsCondensed2.otf",
    "src/babele-register.js",
    "src/translator",
    "static",
    "translation/de",
    "LICENSE",
];

let targetFolder = process.argv[2];

build(PATHS, targetFolder, { "translation/de/compendium/pf2e.journals.json": convertJournals });
