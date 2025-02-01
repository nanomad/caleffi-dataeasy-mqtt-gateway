import {isNullOrUndefined, isNumber} from "../utils";
import {decodeLabel, decodeMultiplier, decodeUnit} from "./utils";

export class MeterReading {
    channelIdx: number
    label: string;
    description: string;
    value: string | number | null;
    unit: string | null;

    constructor(channelIdx: number, rawValue: string, definition: ChanelDefinition) {
        this.channelIdx = channelIdx
        this.label = decodeLabel(definition);
        this.description = definition.Description
        this.value = MeterReading.#decodeValue(rawValue, definition);
        this.unit = decodeUnit(definition);
    }

    static #decodeValue(rawValue: string, definition: ChanelDefinition) {
        if (!isNullOrUndefined(rawValue)) {
            let multiplier = decodeMultiplier(definition);
            if (isNumber(rawValue)) {
                if (multiplier != 0) {
                    return Math.round(multiplier * Number(rawValue) * 100) / 100;
                } else {
                    return Number(rawValue);
                }
            } else {
                return rawValue;
            }
        }
        return rawValue
    }

}

export class MeterReadings {
    constructor(readonly ts: Date, readonly data: MeterReading[]) {
    }
}


export class MetersDB {
    constructor(readonly meters: MeterInfo[]) {
    }
}

export class ChannelsDB {
    constructor(readonly channels: ChanelDefinition[]) {
    }
}

export interface ChanelDefinition {
    SU: string;
    ST: string;
    T: string;
    TV: string;
    Description: string;
    Units: string;
    LABEL: string;
    TOLOG: string;
    MAINDB: string;
    TYPELOG: string;
    Multiplier: string;
}

export interface MeterInfo {
    PKEY: string;
    ID_DEVICE: string;
    NAME_CUSTOMER: string;
    LABEL1: string;
    LABEL2: string;
    STATE: string;
    DATE_INSTALL: string;
    PRIMARY_ID: string;
    TYPE_REQ: string;
    SCAN_TMO: string;
    BAUDRATE: string;
    MANF_CODE: string;
    VERSION: string;
    MEDIUM: string;
    DBNUM: string;
    INTERVAL: string;
    FORMAT: string;
    EMAIL: string;
    MOD_ID: string;
}

