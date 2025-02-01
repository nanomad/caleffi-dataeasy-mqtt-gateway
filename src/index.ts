import {AsyncTask, SimpleIntervalJob, ToadScheduler} from "toad-scheduler";
import {DataEasyClientConfig, DataEasyClientImpl} from "./api/client";
import {MqttPublisherConfig, MqttPublisherImpl} from "./publisher/mqtt_publisher";
import config = require("config");
import {ChannelsDB, MeterInfo} from "./api/types";

console.log('Happy developing ✨')


interface Configuration {
    devices: string[];
    api: DataEasyClientConfig,
    mqtt: MqttPublisherConfig
}

function getConfig(): Configuration {
    return {
        devices: config.get<string>('devices').split(","),
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
    console.info(`Got readings for meter ${meter.ID_DEVICE}`)

    mqtt.onDataReceived(meter, meterReadings);
    console.info(`Published readings for meter ${meter.ID_DEVICE}`)
}


async function main() {
    const metersDB = await client.getMeters();
    for (const meter of metersDB.meters) {
        const deviceSerial = meter.ID_DEVICE;
        const deviceIdx = devices.indexOf(deviceSerial);
        if (deviceIdx < 0) {
            console.debug(`Skipped device ${deviceSerial}`);
            continue;
        }
        console.info(`Found requested device with SN ${deviceSerial}`)

        const channels = await client.getMeterChannels(meter);
        console.info(`Fetched ${channels.channels.length} channels for meter ${deviceSerial}`);

        mqtt.onDeviceDiscovered(meter, channels);

        scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
                minutes: 15,
                runImmediately: true,
            },
            new AsyncTask(
                `fetch-${deviceSerial}`,
                async () => {
                    await fetchData(meter, channels);
                },
                (err: Error) => {
                    console.error(`Error while fetching data for device ${deviceSerial}`, err);
                }
            )
        ));
    }
}

const swConfig = getConfig()
const devices = swConfig.devices;
const client = new DataEasyClientImpl(swConfig.api);
const mqtt = new MqttPublisherImpl(swConfig.mqtt);
const scheduler = new ToadScheduler();
main().then(() => {
    console.log("Main function launched")
}, (err: Error) => {
    console.error("Main function crashed");
})