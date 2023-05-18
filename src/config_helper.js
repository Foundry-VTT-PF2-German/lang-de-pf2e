import { readFileSync, existsSync } from 'fs';

export const CONFIG_FILE = './buildconfig.json';

export const readJSONFile = (path) => {
    const content = readFileSync(path).toString();
    try {
        return JSON.parse(content);
    }
    catch (error) {
        throw `Detected invalid JSON in ${path}: ${error.toString()}`;
    }
}

export const getConfigParameter = (parameterName, defaultValue) => {
    if (!existsSync(CONFIG_FILE)) {
        return defaultValue;
    }
    const configuration = readJSONFile(CONFIG_FILE);
    if (configuration[parameterName] !== undefined) {
        return configuration[parameterName];
    }

    return defaultValue;
}