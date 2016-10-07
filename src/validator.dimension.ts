import {Util} from "./util";
import {Validator} from "./validator";
export class DimensionValidator extends Validator {
    constructor(files, attrGetter) {
        super(files, attrGetter);
    }

    protected validateDimensions(dimensions, prefix?) {
        prefix = prefix || '';
        var ratioName = this.addPrefix('ratio', prefix),
            expectedRatio = this.attrGetter(ratioName),
            actualRatio = dimensions.width / dimensions.height;
        this.validateMinMax(i, this.capitalize(prefix) + 'Ratio', actualRatio, 0.01);
        if (expectedRatio) {
            var split = expectedRatio.toString().split(','), ratioMatch;
            for (var i = 0; i < split.length; i++) {
                if (Math.abs(actualRatio - Util.ratioToFloat(split[i])) < 0.01) {
                    ratioMatch = true;
                    break;
                }
            }
            if (!ratioMatch) {
                this.markFileError(i, ratioName, actualRatio);
            }
        }
        var dimName = this.addPrefix('dimensions', prefix),
            dimensionsExpr = this.attrGetter(dimName);
        if (dimensionsExpr) {
            var ngfDimFn:Function = null;
            eval('var ngfDimFn = function(width, height){ return ' + dimensionsExpr + ';}');
            if (!ngfDimFn(dimensions.width, dimensions.height)) {
                this.markFileError(i, dimName, false);
            }
        }
    }

    private addPrefix(str, prefix) {
        return prefix + this.capitalize(str);
    }
    private capitalize(str: string) {
        return str ? str.charAt(0).toUpperCase() + str.substring(1) : str;
    }
}