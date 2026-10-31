import {AsyncTask, SimpleIntervalJob, ToadScheduler} from "toad-scheduler";
import {ChannelsDB, MeterInfo} from "./api/types.js";
import {DataEasyClientConfig, DataEasyClientImpl} from "./api/client.js";
import {MqttPublisherConfig, MqttPublisherImpl} from "./publisher/mqtt_publisher.js";
import {readFileSync} from "node:fs";
import config from 'config';
import {logger} from './logging.js';

interface Configuration {
    devices: string[];
    refreshIntervalMinutes: number;
    api: DataEasyClientConfig,
    mqtt: MqttPublisherConfig
}

/**
 * Reads a secret from `<ENV>_FILE` (Docker/Kubernetes secret file), then `<ENV>`,
 * then falls back to the config file.
 */
function secret(envName: string, configKey: string): string | undefined {
    const file = process.env[`${envName}_FILE`];
    if (file) {
        return readFileSync(file, "utf8").trim();
    }
    const fromEnv = process.env[envName];
    if (fromEnv) {
        return fromEnv;
    }
    return config.has(configKey) ? config.get<string>(configKey) : undefined;
}

function requireSecret(envName: string, configKey: string): string {
    const value = secret(envName, configKey);
    if (value === undefined) {
        throw new Error(`Missing ${envName}[_FILE] or config key ${configKey}`);
    }
    return value;
}

function validateBaseUrl(raw: string): string {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`api.baseURL must be http(s), got ${url.protocol}`);
    }
    if (url.protocol === "http:") {
        logger.warn("api.baseURL uses plain HTTP: Basic credentials are sent in cleartext. Keep the device on an isolated network.");
    }
    return raw;
}

function getConfig(): Configuration {
    return {
        devices: config.get<string>('devices').split(","),
        refreshIntervalMinutes: config.has('refreshIntervalMinutes') ? config.get('refreshIntervalMinutes') : 5,
        api: {
            baseURL: validateBaseUrl(config.get("api.baseURL")),
            username: requireSecret("API_USERNAME", "api.username"),
            password: requireSecret("API_PASSWORD", "api.password"),
            timeoutMs: config.has("api.timeoutMs") ? config.get("api.timeoutMs") : 30_000,
        },
        mqtt: {
            host: config.get("mqtt.host"),
            port: config.get("mqtt.port"),
            protocol: config.has("mqtt.protocol") ? config.get("mqtt.protocol") : "mqtt",
            username: secret("MQTT_USERNAME", "mqtt.username"),
            password: secret("MQTT_PASSWORD", "mqtt.password"),
            topicRoot: config.has("mqtt.topicRoot") ? config.get("mqtt.topicRoot") : "caleffi-dataeasy",
            clientId: config.has("mqtt.clientId") ? config.get("mqtt.clientId") : "caleffi-dataeasy",
            tlsServerCertificatePath: config.has("mqtt.tlsServerCertificatePath") ? config.get("mqtt.tlsServerCertificatePath") : undefined,
            haDiscoveryPrefix: config.has("mqtt.haDiscoveryPrefix") ? config.get("mqtt.haDiscoveryPrefix") : "homeassistant",
            connectTimeoutMs: config.has("mqtt.connectTimeoutMs") ? config.get("mqtt.connectTimeoutMs") : 30_000,
        }
    };
}

async function fetchData(meter: MeterInfo, channels: ChannelsDB) {
    const meterReadings = await client.getLastMeterReadings(meter, channels);
    logger.info(`Got readings for meter ${meter.ID_DEVICE}`)

    mqtt.onDataReceived(meter, meterReadings);
    logger.info(`Published readings for meter ${meter.ID_DEVICE}`)
}


async function main(config: Configuration) {
    const metersDB = await client.getMeters();
    for (const meter of metersDB.meters) {
        const deviceSerial = meter.ID_DEVICE;
        const deviceIdx = config.devices.indexOf(deviceSerial);
        if (deviceIdx < 0) {
            logger.debug(`Skipped device ${deviceSerial}`);
            continue;
        }
        logger.info(`Found requested device with SN ${deviceSerial}`)

        const channels = await client.getMeterChannels(meter);
        const channelsNum = channels.channels.length;
        logger.info(`Fetched ${channelsNum.toString()} channels for meter ${deviceSerial}`);

        mqtt.onDeviceDiscovered(meter, channels);

        scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
                minutes: config.refreshIntervalMinutes,
                runImmediately: true,
            },
            new AsyncTask(
                `fetch-${deviceSerial}`,
                async () => {
                    await fetchData(meter, channels);
                },
                (err: Error) => {
                    logger.error(err, `Error while fetching data for device ${deviceSerial}`);
                }
            )
        ));
    }
}

const swConfig = getConfig()
const client = new DataEasyClientImpl(swConfig.api);
const mqtt = new MqttPublisherImpl(swConfig.mqtt);
const scheduler = new ToadScheduler();
main(swConfig).then(() => {
    logger.info("Main function launched")
}, (err: unknown) => {
    logger.error(err, "Main function crashed");
})