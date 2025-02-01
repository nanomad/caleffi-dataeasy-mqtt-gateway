import {ChanelDefinition} from "./types";
import {isNullOrUndefined} from "../utils";

export function decodeLabel(definition: ChanelDefinition): string {
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

export function decodeUnit(definition: ChanelDefinition): string | null {
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


export function decodeMultiplier(definition: ChanelDefinition): number {
    if (definition.Multiplier !== null && definition.Multiplier !== undefined) {
        return Number(definition.Multiplier);
    } else {
        return 1.0;
    }
}