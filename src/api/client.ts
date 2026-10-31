import axios, {AxiosInstance, AxiosResponse} from "axios";
import {isSafeIdentifier, isSafeKey} from "../utils.js";
import {logger} from "../logging.js";
import {ChannelDefinition, ChannelsDB, MeterInfo, MeterReading, MeterReadings, MetersDB} from "./types.js";

export interface DataEasyClientConfig {
    baseURL: string;
    username: string;
    password: string;
    timeoutMs: number;
}

export interface DataEasyClient {
    getMeters(): Promise<MetersDB>;

    getMeterChannels(device: MeterInfo): Promise<ChannelsDB>;

    getLastMeterReadings(device: MeterInfo, channels: ChannelsDB): Promise<MeterReadings>;
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class DataEasyClientImpl implements DataEasyClient {
    private readonly client: AxiosInstance;

    constructor(config: DataEasyClientConfig) {
        this.client = axios.create({
            baseURL: config.baseURL,
            auth: {
                username: config.username,
                password: config.password,
            },
            timeout: config.timeoutMs,
            // never follow redirects: Basic credentials must not be forwarded elsewhere
            maxRedirects: 0,
            maxContentLength: MAX_RESPONSE_BYTES,
            maxBodyLength: MAX_RESPONSE_BYTES,
        })
    }

    async getMeters(): Promise<MetersDB> {
        const response = await this.#doGet("DB/REGISTRY_METER.dbs");
        if (/ERROR/.exec(response.data)) {
            throw new Error("Error getting meter list")
        }
        return new MetersDB(DataEasyClientImpl.#parseDeviceRecords(response.data));
    }


    async getMeterChannels(device: MeterInfo): Promise<ChannelsDB> {
        const requestUri = `${DataEasyClientImpl.#encodePathFromDeviceRecord(device)}/alldb.dbs`;
        const response = await this.#doGet(requestUri);

        const payload = response.data;

        if ((/ERROR/.exec(payload)) || response.status === 404) {
            throw new Error("Could not get DB Of Device");
        }

        const lines = payload.split("\n");
        const result: ChannelDefinition[] = [];

        for (let g = 0; g < lines.length - 1; g += 2) {
            const keys = lines[g].split(";");
            const values = lines[g + 1].split(";");
            const entry: Record<string, string> = {};

            if (values.length > 2) {
                for (let j = 1; j < values.length - 1; j++) {
                    const key = keys[j] as string | undefined;
                    if (key === undefined || !isSafeKey(key)) {
                        continue;
                    }
                    entry[key] = values[j];
                }
            }

            result.push(((entry as unknown) as ChannelDefinition));
        }

        return new ChannelsDB(result)
    }

    async getLastMeterReadings(device: MeterInfo, channels: ChannelsDB): Promise<MeterReadings> {
        const requestUri = `${DataEasyClientImpl.#encodePathFromDeviceRecord(device)}/LOG/last.txt`;

        const response = await this.#doGet(requestUri);

        const payload = response.data;
        if ((/ERROR/.exec(payload)) || payload === "") {
            throw new Error("Could not get last log of device");
        }

        const dataLines = payload.split("\n");
        const dataLine = dataLines[0].split("$");

        const rawTs = Number(dataLine[0]);
        const tzOffset = new Date().getTimezoneOffset() * 60;
        const ts = new Date((rawTs + tzOffset) * 1000);
        const readings = channels.channels.map((channelDefinition, channelIdx) => {
            const rawValue = dataLine[channelIdx + 2];
            return new MeterReading(channelIdx, rawValue, channelDefinition);
        });

        return new MeterReadings(ts, readings);
    }

    async #doGet(path: string): Promise<AxiosResponse<string>> {
        return await this.client.get(path, {
            headers: {
                'Accept': 'text/plain',
            },
            responseType: 'text'
        });
    }

    static #encodePathFromDeviceRecord(deviceRecord: MeterInfo) {
        return "DB/" + deviceRecord.ID_DEVICE + "-" + deviceRecord.MANF_CODE + deviceRecord.MEDIUM + deviceRecord.VERSION;
    }

    static #parseDeviceRecords(data: string): MeterInfo[] {
        const lines = data.trim().split("\r\n");
        if (lines.length < 2) {
            throw new Error("Unexpected meter list format");
        }
        const headers = lines[1].split(";");

        return lines.slice(2).map(line => {
            const values = line.split(";");
            return headers.reduce((acc, key, index) => {
                if (isSafeKey(key)) {
                    acc[key as keyof MeterInfo] = values[index];
                }
                return acc;
            }, {} as MeterInfo);
        }).filter(meter => {
            // device fields end up in request paths, MQTT topics and HA entity ids
            const ok = isSafeIdentifier(meter.ID_DEVICE)
                && isSafeIdentifier(meter.MANF_CODE)
                && isSafeIdentifier(meter.MEDIUM)
                && isSafeIdentifier(meter.VERSION);
            if (!ok) {
                logger.warn("Ignoring meter record with unsafe identifiers");
            }
            return ok;
        });
    };

}

