import { ITT } from "./ts_predefines";
import { AEnum } from "./ts_predefines";
export class C {
    constructor() {
        console.log('AEnum', AEnum.type1);
        let a: ITT = {};
        console.log(a.readName);
    }
}