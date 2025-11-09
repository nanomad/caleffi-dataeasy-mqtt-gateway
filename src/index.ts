import {AsyncTask, SimpleIntervalJob, ToadScheduler} from "toad-scheduler";
import {ChannelsDB, MeterInfo} from "./api/types.js";
import {DataEasyClientConfig, DataEasyClientImpl} from "./api/client.js";
import {MqttPublisherConfig, MqttPublisherImpl} from "./publisher/mqtt_publisher.js";
import config from 'config';
import {logger} from './logging.js';

interface Configuration {
    devices: string[];
    refreshIntervalMinutes: number;
    api: DataEasyClientConfig,
    mqtt: MqttPublisherConfig
}

function getConfig(): Configuration {
    return {
        devices: config.get<string>('devices').split(","),
        refreshIntervalMinutes: config.has('refreshIntervalMinutes') ? config.get('refreshIntervalMinutes') : 5,
        api: {
            baseURL: config.get("api.baseURL"),
            username: config.get("api.username"),
            password: config.get("api.password"),
        },
        mqtt: {
            host: config.get("mqtt.host"),
            port: config.get("mqtt.port"),
            protocol: config.has("mqtt.protocol") ? config.get("mqtt.protocol") : "mqtt",
            username: config.has("mqtt.username") ? config.get("mqtt.username") : undefined,
            password: config.has("mqtt.password") ? config.get("mqtt.password") : undefined,
            topicRoot: config.has("mqtt.topicRoot") ? config.get("mqtt.topicRoot") : "caleffi-dataeasy",
            clientId: config.has("mqtt.clientId") ? config.get("mqtt.clientId") : "caleffi-dataeasy",
            tlsServerCertificatePath: config.has("mqtt.tlsServerCertificatePath") ? config.get("mqtt.tlsServerCertificatePath") : undefined,
            haDiscoveryPrefix: config.has("mqtt.haDiscoveryPrefix") ? config.get("mqtt.haDiscoveryPrefix") : "homeassistant",
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