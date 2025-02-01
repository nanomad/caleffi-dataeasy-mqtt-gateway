import {connect, MqttClient} from "mqtt";
import {ChannelsDB, MeterInfo, MeterReading, MeterReadings} from "../api/types";
import {decodeLabel, decodeUnit} from "../api/utils";

export interface MqttPublisherConfig {
    host: string;
    port: number;
    protocol: string;
    tlsServerCertificatePath?: string;

    username?: string;
    password?: string;
    clientId?: string;

    topicRoot: string;

    haDiscoveryPrefix?: string;
}

interface MqttPublisher {
    onDeviceDiscovered(meter: MeterInfo, channels: ChannelsDB): void;

    onDataReceived(meter: MeterInfo, readings: MeterReadings): void;
}

export interface MeterEntry {
    meter: MeterInfo;
    channels: ChannelsDB;
}

export class MqttPublisherImpl implements MqttPublisher {

    private readonly client: MqttClient;
    private readonly topicRoot: string;
    private readonly lwtTopic: string;
    private readonly haDiscoveryPrefix?: string;

    private readonly meters: Map<string, MeterEntry> = new Map<string, MeterEntry>();

    constructor(config: MqttPublisherConfig) {
        const brokerUrl = `${config.protocol}://${config.host}:${config.port}`
        this.topicRoot = config.topicRoot
        this.lwtTopic = `${this.topicRoot}/_internal/lwt`;
        this.haDiscoveryPrefix = config.haDiscoveryPrefix

        this.client = connect(brokerUrl, {
            port: config.port,
            username: config.username,
            password: config.password,
            clientId: config.clientId,
            caPaths: config.tlsServerCertificatePath,
            manualConnect: true,
            will: {
                topic: this.lwtTopic,
                payload: 'offline',
                retain: true
            }
        })

        if (this.haDiscoveryPrefix) {
            const haLwtTopic = `${this.haDiscoveryPrefix}/status`;
            this.client.subscribe(haLwtTopic);
            this.client.on('message', (topic, payload, _packet) => {
                if (topic == haLwtTopic && payload.toString() === 'online') {
                    this.#publishAllHaDiscoveryMessages()
                }
            })
        }

        this.client.on('connect', (_socket) => {
            this.#markAsOnline()
        })

        this.client.connect();
        this.#markAsOnline();
    }

    onDeviceDiscovered(meter: MeterInfo, channels: ChannelsDB) {
        const devId = meter.ID_DEVICE;
        this.meters.set(devId, {
            meter: meter,
            channels: channels
        });
        this.client.publish(
            `${this.topicRoot}/${devId}/info`,
            JSON.stringify(meter),
            {retain: true}
        );
        this.#publishHaDiscoveryMessage(meter, channels);
    }

    onDataReceived(meter: MeterInfo, readings: MeterReadings) {
        for (const reading of readings.data) {
            this.client.publish(
                this.#getTopicForChannel(meter, reading.channelIdx),
                JSON.stringify({
                    ts: readings.ts,
                    ...reading
                }),
                {retain: true}
            );
        }
        this.client.publish(
            this.#getLastUpdateTopic(meter),
            readings.ts.toISOString(),
            {retain: true}
        )
    }


    #getTopicForChannel(device: MeterInfo, channelIdx: number): string {
        return `${this.#getTopicForDevice(device)}/${channelIdx}`;
    }

    #getLastUpdateTopic(meter: MeterInfo) {
        return `${this.#getTopicForDevice(meter)}/ts`;
    }

    #getTopicForDevice(device: MeterInfo) {
        return `${this.topicRoot}/${device.ID_DEVICE}`;
    }

    #markAsOnline() {
        this.client.publish(this.lwtTopic, 'online')
    }

    #publishAllHaDiscoveryMessages() {
        for (const meter of this.meters.values()) {
            this.#publishHaDiscoveryMessage(meter.meter, meter.channels)
        }
    }


    #publishHaDiscoveryMessage(meter: MeterInfo, channels: ChannelsDB) {
        if (!this.haDiscoveryPrefix) {
            return
        }
        const deviceSerial = meter.ID_DEVICE;
        console.log(`Publishing HA discovery prefix for device ${deviceSerial}`)
        const commonAttrs = {
            "availability_topic": this.lwtTopic,
            "device": {
                "identifiers": deviceSerial,
                "name": `Caleffi DataEasy ${meter.NAME_CUSTOMER}`,
                "serial_number": deviceSerial,
            }
        }
        for (let i = 0; i < channels.channels.length; i++) {
            const channel = channels.channels[i];
            const originalUnit = decodeUnit(channel)
            const {deviceClass, stateClass, unit} = this.#decodeHaDeviceAndStateClass(originalUnit);
            const deviceUniqueId = `caleffi_dataeasy_${deviceSerial}_${i}`;
            const discoveryMessage = {
                "name": decodeLabel(channel),
                "unique_id": deviceUniqueId,
                "device_class": deviceClass,
                "state_class": stateClass,
                "unit_of_measurement": unit,
                "state_topic": this.#getTopicForChannel(meter, i),
                "value_template": "{{ value_json.value }}",
                ...commonAttrs,
            }
            this.client.publish(
                `${this.haDiscoveryPrefix}/sensor/${deviceSerial}/${deviceUniqueId}/config`,
                JSON.stringify(discoveryMessage),
                {retain: true}
            );
        }
        const deviceUniqueId = `caleffi_dataeasy_${deviceSerial}_last_update`;
        const discoveryMessage = {
            "name": "Last Update",
            "unique_id": deviceUniqueId,
            "device_class": "timestamp",
            "state_topic": this.#getLastUpdateTopic(meter),
            ...commonAttrs,
        }
        this.client.publish(
            `${this.haDiscoveryPrefix}/sensor/${deviceSerial}/${deviceUniqueId}/config`,
            JSON.stringify(discoveryMessage),
            {retain: true}
        );
    }

    #decodeHaDeviceAndStateClass(unit: string | null) {
        let deviceClass = null
        let stateClass = null
        if (unit) {
            switch (unit) {
                case "C":
                case "F":
                case "K":
                case "mK":
                    deviceClass = "temperature"
                    break;
                case "kWh":
                    deviceClass = "energy"
                    stateClass = "TOTAL_INCREASING"
                    break
                case "kW":
                    deviceClass = "power"
                    break;
                case "m3/h":
                    deviceClass = "volume_flow_rate"
                    unit = "m³/h"
                    break;
                case "m3":
                    deviceClass = "water"
                    stateClass = "TOTAL_INCREASING"
                    unit = "m³"
                    break;
            }
        }
        return {deviceClass, stateClass, unit};
    }
}