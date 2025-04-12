import {ChannelDefinition} from "./types.js";
import {isNullOrUndefined} from "../utils.js";

export function decodeLabel(definition: ChannelDefinition): string {
    let label = definition.LABEL;
    if (definition.T != "0") {
        label += " - " + definition.T;
    }
    if (definition.SU != "0") {
        label += " - " + definition.SU;
    }
    if (definition.ST != "0") {
        label += " - " + definition.ST;
    }
    return label;
}

export function decodeUnit(definition: ChannelDefinition): string | null {
    let units;
    if (
        !isNullOrUndefined(definition.Units)
        && definition.Units !== ""
        && definition.Units !== "date e time"
    ) {
        units = definition.Units.trim();
    } else {
        units = null
    }
    return units;
}


export function decodeMultiplier(definition: ChannelDefinition): number {
    if (!isNullOrUndefined(definition.Multiplier)) {
        return Number(definition.Multiplier);
    } else {
        return 1.0;
    }
}