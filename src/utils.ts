import { Entry } from '@lucas-bortoli/libdiscord-fs'

export default abstract class Utils {
    public static naturalSort(entries: [string, Entry][]): [string, Entry][] {
        return entries.sort((a, b) => {
            return (a[1].type + a[0]).localeCompare((b[1].type + b[0]), undefined, {numeric: true, sensitivity: 'base'})
        })
    }

    /**
     * Converts a value to its unit representation, handling plurals.
     * @example unit(3, 'item') => '3 items'
     */
    public static unit(value: number, unit: string): string {
        return `${value} ${unit + ((value !== 1) ? 's' : '')}`
    }

    /**
     * Returns a Promise that resolves after a specified amount of time.
     */
    public static Wait = (ms: number): Promise<void> => {
        return new Promise(resolve => {
            setTimeout(resolve, ms)
        })
    }

    public static secondsToHuman(s: number): string {
        const milliseconds = s * 1000;
        let temp = milliseconds / 1000;
        const years = Math.floor( temp / 31536000 ),
              days = Math.floor( ( temp %= 31536000 ) / 86400 ),
              hours = Math.floor( ( temp %= 86400 ) / 3600 ),
              minutes = Math.floor( ( temp %= 3600 ) / 60 ),
              seconds = temp % 60;
    
        if ( days || hours || seconds || minutes ) {
          return ( years ? years + "y " : "" ) +
          ( days ? days + "d " : "" ) +
          ( hours ? hours + "h " : ""  ) +
          ( minutes ? minutes + "m " : "" ) +
          seconds.toFixed(0) + "s";
        }
    
        return "< 1s";
    }
}