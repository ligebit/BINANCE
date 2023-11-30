const { readFile, writeFile } = require("fs");


function sleep(ms) {
    return new Promise((res, rej) => {
        setTimeout(res, ms);
    });
}

function getConfig(file) {
    return new Promise((res, rej) => {
        readFile(__dirname + '\\' +  file, (err, data) => {
            if (err) return rej(err);

            return res(JSON.parse(data.toString()));
        });
    });
}

function saveConfig(obj, file) {
    return new Promise((res, rej) => {
        writeFile(__dirname + '\\' + file, JSON.stringify(obj), (err) => {
            if (err) return rej(err);

            return res();
        });
    });
}

module.exports = { sleep, getConfig, saveConfig }