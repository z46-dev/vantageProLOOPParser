import fs from "fs";
import { SerialPort } from "serialport";
import parse from "./lib/parser.js";

let promiseListener = undefined;

const port = new SerialPort({
    path: "/dev/ttyUSB0",
    baudRate: 19200
});

port.on("open", function onOpen() {
    console.log("Port is open");

    setTimeout(function onTimeout() {
        readData();
    }, 1000);
});

port.on("data", function onData(data) {
    if (data.length >= 99 && promiseListener !== undefined) {
        promiseListener(data);
        promiseListener = undefined;
    }
});

function loop(timeout = 1000) {
    return new Promise((resolve, reject) => {
        if (promiseListener !== undefined) {
            reject(new Error("Another LOOP is already running"));
            return;
        }

        setTimeout(reject, timeout, new Error("LOOP Timeout"));

        port.write("LOOP 1\n", function onWrite(err) {
            if (err) {
                return reject(err);
            }

            promiseListener = resolve;
        });
    });
}

const list = fs.existsSync("data.json") ? JSON.parse(fs.readFileSync("data.json", "utf-8")) : [];

async function readData() {
    let loopData;

    try {
        loopData = await loop();
    } catch (err) {
        console.error("LOOP Error:", err);
    }

    if (loopData !== undefined) {
        const data = parse(loopData);

        if (data.crc.valid && data.parsed.get("LOO") === "Valid") {
            console.log("[" + (performance.now() / 1000 | 0) + "]", "Received valid data");
            list.push({
                timestamp: Date.now(),
                data: Object.entries(data.parsed)
            });
        } else {
            console.log("[" + (performance.now() / 1000 | 0) + "]", "Received invalid data");
        }
    }

    setTimeout(readData, 1000 * 60 * 10);
}

setInterval(function saveData() {
    if (list.length === 0) {
        return;
    }

    while (list.length > 0 && list[0].timestamp < Date.now() - 1000 * 60 * 60 * 24 * 14) {
        list.shift();
    }

    try {
        fs.writeFileSync("data.json", JSON.stringify(list), "utf-8");
    } catch (err) {
        console.error("Error saving data:", err);
    }
}, 1000 * 60 * 5);